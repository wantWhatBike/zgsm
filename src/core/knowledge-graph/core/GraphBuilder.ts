import { KnowledgeGraphConfig, BuildOptions, KnowledgeGraphBuildState, BuildProgress } from "../types"
import { KNOWLEDGE_GRAPH_STATUS, KNOWLEDGE_GRAPH_PHASE } from "@roo-code/types"
import { RootAnalyzer } from "./RootAnalyzer"
import { FileSummarizer } from "./FileSummarizer"
import { DirectorySummarizer } from "./DirectorySummarizer"
import { FileService } from "./FileService"
import { ILogger } from "../../../utils/logger"
import { BuildStateTracer } from "./BuildStateTracer"
import { ProgressTracer } from "../tools/ProgressTracer"
import { Mutex } from "../utils/Mutex"

/**
 * 依赖注入接口
 */
export interface GraphBuilderDependencies {
	rootAnalyzer: RootAnalyzer
	fileAnalyzer: FileSummarizer
	directoryAnalyzer: DirectorySummarizer
	fileService: FileService
	buildStateKeeper: BuildStateTracer
	logger: ILogger
}

/**
 * 知识图谱构建器
 * 负责协调各个分析器，管理构建流程和状态
 */
export class GraphBuilder {
	private config: KnowledgeGraphConfig
	// 依赖组件
	private rootAnalyzer: RootAnalyzer
	private fileSummarizer: FileSummarizer
	private directorySummarizer: DirectorySummarizer
	private fileService: FileService
	private logger: ILogger

	// 构建状态
	private buildStateTracer: BuildStateTracer
	
	// 性能跟踪
	private progressTracer: ProgressTracer
	
	// ✅ 互斥锁：确保同一时间只有一个构建任务
	private buildMutex = new Mutex()
	
	// 任务控制：防止重复执行
	private currentBuildPromise: Promise<void> | null = null
	// 状态控制：防止在清除过程中启动构建
	private isClearing: boolean = false
	// 中止控制器：用于在暂停/清除时中断耗时操作
	private abortController: AbortController | null = null

	constructor(config: KnowledgeGraphConfig, dependencies: GraphBuilderDependencies) {
		this.config = config
		this.rootAnalyzer = dependencies.rootAnalyzer
		this.fileSummarizer = dependencies.fileAnalyzer
		this.directorySummarizer = dependencies.directoryAnalyzer
		this.fileService = dependencies.fileService
		this.logger = dependencies.logger
		this.buildStateTracer = dependencies.buildStateKeeper
		this.progressTracer = new ProgressTracer()
	}

	/**
	 * 设置性能跟踪器
	 */
	public setProgressTracer(progressTracer: ProgressTracer): void {
		this.progressTracer = progressTracer
	}

	/**
	 * 开始构建知识图谱
	 * ✅ 增强版：使用互斥锁和原子操作确保同一时间只有一个构建任务
	 */
	async start(workspacePath: string, options: BuildOptions = {}): Promise<void> {
		// ========== 原子区域：检查和任务创建 ==========
		await this.buildMutex.lock()
		
		try {
			if (!workspacePath) {
				throw new Error("workspacePath is null, cannot build.")
			}

			// 1. 检查清除状态
			if (this.isClearing) {
				throw new Error("正在清除知识图谱，请稍后重试")
			}
			
			// 2. 检查是否已有任务（双重检查）
			if (this.currentBuildPromise) {
				this.logger.info("[GraphBuilder] 构建任务已在运行中，等待完成")
				// 释放锁后返回已有任务
				this.buildMutex.unlock()
				return this.currentBuildPromise
			}
			
			// 3. 原子性检查并更新状态
			const canStart = await this.buildStateTracer.atomicCheckAndStartBuild()
			if (!canStart) {
				const currentStatus = this.buildStateTracer.getCurrentState()?.status
				
				// 如果强制重建，先重置状态
				if (options.forceRebuild) {
					this.logger.info(`[GraphBuilder] 强制重建，重置状态: ${currentStatus}`)
					await this.buildStateTracer.forceResetState()
					
					// 再次尝试启动
					const retryStart = await this.buildStateTracer.atomicCheckAndStartBuild()
					if (!retryStart) {
						throw new Error(`强制重建失败，当前状态: ${currentStatus}`)
					}
				} else {
					throw new Error(`当前状态 ${currentStatus} 不允许启动构建`)
				}
			}
			
			// 4. 初始化中止控制器
			if (this.abortController) {
				this.abortController.abort()
			}
			this.abortController = new AbortController()
			
			// 5. 设置各组件的统一终止检查器
			const stopChecker = () => {
				return this.buildStateTracer.isPaused() || this.abortController?.signal.aborted || false
			}
			this.rootAnalyzer.setPauseChecker(stopChecker)
			this.fileSummarizer.setPauseChecker(stopChecker)
			this.directorySummarizer.setPauseChecker(stopChecker)
			
			// 6. 创建新的构建任务（此时状态已是 RUNNING）
			this.currentBuildPromise = this.executeBuild(workspacePath, options)
				.catch(async (error) => {
					await this.handleBuildError(error)
					throw error
				})
				.finally(() => {
					// 任务完成后清理
					this.currentBuildPromise = null
					this.abortController = null
				})
			
			this.logger.info("[GraphBuilder] 构建任务已创建并启动")
		} finally {
			// 确保锁被释放
			this.buildMutex.unlock()
		}
		
		// ========== 原子区域结束 ==========
		
		// 在锁外等待任务完成
		return this.currentBuildPromise!
	}

	/**
	 * 暂停构建
	 * ✅ 增强版：使用原子操作确保状态一致性
	 */
	async pause(workspacePath: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot pause.")
		}
		
		// ✅ 原子性检查并暂停
		const canPause = await this.buildStateTracer.atomicCheckAndPause()
		if (!canPause) {
			const currentStatus = this.buildStateTracer.getCurrentState()?.status
			this.logger.warn(`[GraphBuilder] 当前状态 ${currentStatus} 不支持暂停操作`)
			throw new Error(`当前状态 ${currentStatus} 不允许暂停`)
		}

		// 中断当前正在进行的耗时操作
		if (this.abortController) {
			this.abortController.abort()
			this.abortController = null
		}

		this.logger.info("[GraphBuilder] 构建已暂停")
	}

	/**
	 * 继续构建
	 * ✅ 增强版：使用原子操作和互斥锁确保状态一致性
	 */
	async resume(workspacePath: string): Promise<void> {
		// ========== 原子区域：检查和任务恢复 ==========
		await this.buildMutex.lock()
		
		try {
			if (!workspacePath) {
				throw new Error("workspacePath is null, cannot resume.")
			}
			
			// 防止重复恢复
			if (this.currentBuildPromise) {
				this.logger.warn("[GraphBuilder] 构建任务已在执行中，忽略恢复请求")
				this.buildMutex.unlock()
				return this.currentBuildPromise
			}
			
			// ✅ 原子性检查并恢复
			const canResume = await this.buildStateTracer.atomicCheckAndResume()
			if (!canResume) {
				const currentStatus = this.buildStateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许继续构建`)
			}

			// 初始化中止控制器
			if (this.abortController) {
				this.abortController.abort()
			}
			this.abortController = new AbortController()

			// 设置各组件的统一终止检查器
			const stopChecker = () => {
				return this.buildStateTracer.isPaused() || this.abortController?.signal.aborted || false
			}
			this.rootAnalyzer.setPauseChecker(stopChecker)
			this.fileSummarizer.setPauseChecker(stopChecker)
			this.directorySummarizer.setPauseChecker(stopChecker)

			// 启动恢复任务
			this.logger.info(`[GraphBuilder] 启动恢复构建任务：${workspacePath}`)
			this.currentBuildPromise = this.executeBuild(workspacePath, { resumeFromPrevious: true })
				.catch(async (error) => {
					await this.handleBuildError(error)
					throw error
				})
				.finally(() => {
					this.currentBuildPromise = null
					this.abortController = null
				})
		} finally {
			// 确保锁被释放
			this.buildMutex.unlock()
		}
		
		// ========== 原子区域结束 ==========
		
		// 在锁外等待任务完成
		return this.currentBuildPromise!
	}

	/**
	 * 清除知识图谱
	 * ✅ 增强版：使用互斥锁确保不会与其他操作冲突
	 */
	async clear(workspacePath: string): Promise<void> {
		// ========== 原子区域：检查和清除操作 ==========
		await this.buildMutex.lock()
		
		try {
			if (!workspacePath) {
				throw new Error("workspacePath is null, cannot clear.")
			}

			if (this.isClearing) {
				this.logger.info("清除操作已在进行中")
				return
			}

			// 检查状态是否允许清除
			if (!this.buildStateTracer.canClear()) {
				const currentStatus = this.buildStateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许清除。请先暂停构建后再清除。`)
			}

			this.isClearing = true
			
			try {
				// 中断当前正在进行的耗时操作
				if (this.abortController) {
					this.abortController.abort()
					this.abortController = null
				}

				// 如果有暂停的任务，先取消它
				if (this.currentBuildPromise) {
					this.logger.info("[GraphBuilder] 取消暂停的构建任务")
					this.currentBuildPromise = null
				}

				// 清除所有存储
				await this.buildStateTracer.clear()
				await this.rootAnalyzer.clear()
				await this.fileSummarizer.clear()
				await this.directorySummarizer.clear()

				this.logger.info("[GraphBuilder] 知识图谱存储已清除")
			} finally {
				this.isClearing = false
			}
		} finally {
			// 确保锁被释放
			this.buildMutex.unlock()
		}
		
		// ========== 原子区域结束 ==========
	}
	
	/**
	 * 执行构建流程
	 */
	private async executeBuild(workspacePath: string, options: BuildOptions): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspace is null")
		}
		if (!this.fileService) {
			throw new Error("fileService not initialized")
		}
		this.logger.info(`[GraphBuilder] 开始构建知识图谱，工作区：${workspacePath}`)
		// 重置性能跟踪器
		this.progressTracer.reset()

		// 检查是否已中止
		if (this.abortController?.signal.aborted) return

		// 获取项目文件 - 文件收集阶段
		this.progressTracer.start('fileCollection')
		const allFiles = await this.fileService.getProjectFilteredFiles(workspacePath)
		const fileCollectionDuration = this.progressTracer.end('fileCollection')
		
		// 检查暂停/中止状态
		if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
			this.logger.info("[GraphBuilder] 构建已暂停/中止 (文件收集后)")
			return
		}

		const totalFiles = allFiles.length
		this.logger.info(`[GraphBuilder] 项目源码文件数量: ${totalFiles}, 文件收集耗时: ${ProgressTracer.formatDuration(fileCollectionDuration)}`)

		// 分析文件变更
		const incrementalResult = await this.buildStateTracer.resolveFileList(allFiles)
		this.logger.info(`[GraphBuilder] 本轮文件变更: 新增${incrementalResult.added.length}, 修改${incrementalResult.modified.length}, 删除${incrementalResult.deleted.length}`)

		// 检查暂停/中止状态
		if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
			this.logger.info("[GraphBuilder] 构建已暂停/中止 (文件变更分析后)")
			return
		}

		// 处理已删除或修改的文件：从摘要库中移除旧摘要
		// 注意：修改的文件也需要先移除旧摘要，否则追加写入会导致重复
		const pathsToRemove = [
			...incrementalResult.deleted.map(f => f.path),
			...incrementalResult.modified.map(f => f.path)
		]
		
		if (pathsToRemove.length > 0) {
			await this.fileSummarizer.removeSummaries(pathsToRemove)
			this.logger.info(`[GraphBuilder] 已清理 ${pathsToRemove.length} 个待更新/已删除文件的旧摘要`)
		}

		// 根据文件摘要（路径+核心功能关键词(或者核心导出函数)），重新全量生成目录摘要。

		let needDoFileSummary = true
		let needDoDirectorySummary = true

		// 检查是否有文件变更
		const hasFileChanges = incrementalResult.added.length > 0 || incrementalResult.modified.length > 0
		const hasDeletions = incrementalResult.deleted.length > 0

		if (!hasFileChanges) {
			needDoFileSummary = false
			if (!hasDeletions) {
				needDoDirectorySummary = false
			}
		}

		// 如果强制重建，则必须执行
		if (options.forceRebuild) {
			needDoFileSummary = true
			needDoDirectorySummary = true
		}

		if (!needDoDirectorySummary && !needDoFileSummary && !options.forceRebuild) {
			this.logger.info("[GraphBuilder] 无需更新，构建完成")
			await this.buildStateTracer.updateBuildState({
				phase: "completed",
				status: KNOWLEDGE_GRAPH_STATUS.COMPLETED,
				failedFiles: 0,
				error: ""
			})
			return
		}

		// 修正：totalFilesToProcess 应该是总文件数，以反映整体进度
		// 增量更新时，processedFiles 从 unchangedCount 开始
		const totalFilesToProcess = totalFiles
		const initialProcessedFiles = incrementalResult.unchangedCount || 0

		// 初始化构建
		if (!options.resumeFromPrevious) {
			await this.buildStateTracer.initializeBuildState(workspacePath, totalFiles, totalFilesToProcess, initialProcessedFiles)
		} else {
			this.logger.info("[GraphBuilder] 恢复构建，跳过状态初始化")
			// 更新可能变化的文件统计信息
			await this.buildStateTracer.updateBuildState({
				totalFiles: totalFiles,
				totalFilesToProcess: totalFiles,
				processedFiles: initialProcessedFiles
			})
		}

		// 获取当前状态以决定从哪里开始
		const currentState = this.buildStateTracer.getCurrentState()
		const currentPhase = currentState?.phase || KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS
		const phases = [KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.DEPENDENCY_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.COMPLETED]
		const currentPhaseIndex = phases.indexOf(currentPhase)

		// 2. 根目录分析
		let rootInfo: any
		
		if (!options.resumeFromPrevious || currentPhaseIndex <= phases.indexOf(KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS)) {
			this.progressTracer.start('rootAnalysis')
			
			if (!this.rootAnalyzer) {
				throw new Error("根分析器未初始化")
			}

			rootInfo = await this.rootAnalyzer.analyzeRoot(workspacePath, allFiles)
			const rootAnalysisDuration = this.progressTracer.end('rootAnalysis')

			this.logger.info(`[GraphBuilder] 根目录分析完成，耗时: ${ProgressTracer.formatDuration(rootAnalysisDuration)}`)
			await this.buildStateTracer.updateBuildState({
				phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
				error: "根目录分析完成"
			})
			await this.buildStateTracer.updatePhaseProgress(KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS, 1, 1, 'completed')
		} else {
			this.logger.info("[GraphBuilder] 跳过根目录分析 (已完成)")
			rootInfo = await this.rootAnalyzer.getRootInfo()
			if (!rootInfo) {
				this.logger.warn("[GraphBuilder] 无法加载根目录信息，重新分析")
				rootInfo = await this.rootAnalyzer.analyzeRoot(workspacePath, allFiles)
			}
		}

		// 检查暂停/中止状态
		if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
			this.logger.info("[GraphBuilder] 构建已暂停/中止 (根目录分析后)")
			return
		}

		// 文件摘要
		if (needDoFileSummary) {
			// 检查暂停状态或清除状态
			if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
				this.logger.info("[GraphBuilder] 构建已暂停，停止文件摘要")
				return
			}
			
			this.progressTracer.start('fileSummary')
			this.logger.info(`[GraphBuilder] 开始文件摘要: ${totalFilesToProcess}个文件`)

			if (!this.fileSummarizer) {
				throw new Error("文件分析器未初始化")
			}
			await this.fileSummarizer.summarizeFiles(
				rootInfo,
				allFiles,
				[...incrementalResult.added, ...incrementalResult.modified],
				workspacePath,
				async (progress: BuildProgress) => {
					// 如果正在清除，停止更新状态
					if (this.isClearing) return

					const batchSize = progress.batchProcessedFilePaths.length
					const batchDuration = progress.batchDuration || 0
					
					// 记录批次统计
					this.progressTracer.recordBatch('fileSummary', batchSize, batchDuration)
					
					this.logger.info(`[GraphBuilder] 文件摘要: 批次大小: ${batchSize}, 耗时: ${ProgressTracer.formatDuration(batchDuration)}，进度：${progress.totalProcessedFiles}/${progress.filesToProcess}`)
					
					// 计算累计已处理文件数 (初始已完成 + 本次新增已完成)
					const currentTotalProcessed = initialProcessedFiles + progress.totalProcessedFiles

					// 使用统一的 updateBuildState 方法
					await this.buildStateTracer.updateBuildState({
						phase: KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS,
						processedFiles: currentTotalProcessed,
						failedFiles: progress.batchFailedFiles,
						error: progress.message
					}, progress.batchProcessedFilePaths, "success")

					// 更新阶段进度
					await this.buildStateTracer.updatePhaseProgress(KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS, currentTotalProcessed, totalFilesToProcess, 'running')
				},
			)
			
			// 检查是否因暂停或清除而中断
			if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
				this.logger.info("[GraphBuilder] 文件摘要阶段被暂停")
				return
			}
			
			// 标记文件分析阶段完成
			await this.buildStateTracer.updatePhaseProgress(KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS, totalFilesToProcess, totalFilesToProcess, 'completed')
			
			const fileSummaryDuration = this.progressTracer.end('fileSummary')
			const batchStats = this.progressTracer.getBatchStats('fileSummary')
			
			this.logger.info(`[GraphBuilder] 文件摘要完成，总耗时: ${ProgressTracer.formatDuration(fileSummaryDuration)}, 总批次: ${batchStats.totalBatches}, 平均每批次: ${batchStats.averageItemsPerBatch}个文件, 平均批次耗时: ${ProgressTracer.formatDuration(batchStats.averageBatchDuration)}`)
		} else {
			this.logger.info("[GraphBuilder] 跳过文件摘要 (无变更)")
		}

		// 检查暂停状态
		if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
			this.logger.info("[GraphBuilder] 构建已暂停")
			return
		}

		// 目录摘要
		if (needDoDirectorySummary) {
			// 检查暂停状态
			if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
				this.logger.info("[GraphBuilder] 构建已暂停，停止目录摘要")
				return
			}
			
			this.progressTracer.start('directorySummary')
			await this.buildStateTracer.updateBuildState({
				phase: KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS,
				failedFiles: 0,
				error: "分析目录结构..."
			})
			
			// 重置目录分析阶段的进度
			await this.buildStateTracer.updatePhaseProgress(KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS, 0, 0, 'running')

			if (!this.directorySummarizer) {
				throw new Error("目录分析器未初始化")
			}
			await this.directorySummarizer.summarizeDirectories(
				rootInfo,
				allFiles,
				async (progress: BuildProgress) => {
					// 使用统一的 updateBuildState 方法
					await this.buildStateTracer.updateBuildState({
						phase: KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS,
						totalFilesToProcess: progress.filesToProcess,
						processedFiles: progress.totalProcessedFiles,
						failedFiles: progress.batchFailedFiles,
						error: progress.message
					})

					// 更新阶段进度
					await this.buildStateTracer.updatePhaseProgress(KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS, progress.totalProcessedFiles, progress.filesToProcess, 'running')
				},
				incrementalResult // 传递增量变更信息
			)
			
			// 检查是否因暂停而中断
			if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
				this.logger.info("[GraphBuilder] 目录摘要阶段被暂停")
				return
			}
			
			// 标记目录分析阶段完成
			const finalState = this.buildStateTracer.getCurrentState()
			const totalDirs = finalState?.phaseProgress?.directory_analysis?.total || 0
			await this.buildStateTracer.updatePhaseProgress(KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS, totalDirs, totalDirs, 'completed')

			const directorySummaryDuration = this.progressTracer.end('directorySummary')
			this.logger.info(`[GraphBuilder] 目录摘要完成，耗时: ${ProgressTracer.formatDuration(directorySummaryDuration)}`)
		}
		
		// 最终检查是否因暂停而中断
		if (this.buildStateTracer.isPaused() || this.abortController?.signal.aborted) {
			this.logger.info("[GraphBuilder] 构建在最终阶段被暂停")
			return
		}
		
		// 完成构建
		await this.buildStateTracer.updateBuildState({
			phase: KNOWLEDGE_GRAPH_PHASE.COMPLETED,
			status: KNOWLEDGE_GRAPH_STATUS.COMPLETED,
			failedFiles: 0,
			error: "构建完成"
		})
		
		// 生成性能报告
		const performanceReport = this.progressTracer.generateReport()
		performanceReport.forEach(log => this.logger.info(log))
		
		this.logger.info("[GraphBuilder] 构建完成")
	}

	/**
	 * 处理构建错误
	 */
	private async handleBuildError(error: unknown): Promise<void> {
		const errorMessage = error instanceof Error ? error.message : "构建失败"
		this.logger.error(`[GraphBuilder] 构建错误: ${errorMessage}`)
		
		// 清理状态
		await this.buildStateTracer.updateBuildState({
			status: KNOWLEDGE_GRAPH_STATUS.ERROR,
			error: errorMessage
		})
	}

	/**
	 * 状态修复：检查Build_state为running但实际没有正在运行的任务
	 * 主要处理插件关闭后状态还是running的情况
	 */
	public async repairBuildState(): Promise<void> {
		if (!this.buildStateTracer) {
			return
		}

		try {
			const currentState = this.buildStateTracer.getCurrentState()
			if (!currentState) {
				return
			}

			// 如果Build_state显示为running，但实际没有正在运行的任务
			if (currentState.status === "running") {
				// 检查是否有正在执行的任务（检查currentBuildPromise）
				const hasRunningTask = this.currentBuildPromise !== null
				
				if (!hasRunningTask) {
					this.logger.warn("[GraphBuilder] 检测到状态不一致：Build_state为running但无实际运行任务，修复为paused")
					
					// 将状态修复为paused，用户可以选择继续或清空
					await this.buildStateTracer.updateBuildState({
						status: KNOWLEDGE_GRAPH_STATUS.PAUSED,
						error: "检测到异常中断，已自动修复状态"
					})
					
					this.logger.info("[GraphBuilder] 状态修复完成：running -> paused")
				}
			}
		} catch (error) {
			this.logger.error(`[GraphBuilder] 状态修复失败: ${error}`)
			// 状态修复失败不应该阻止初始化
		}
	}

}
