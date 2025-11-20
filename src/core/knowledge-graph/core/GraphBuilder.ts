import { KnowledgeGraphConfig, BuildOptions, KnowledgeGraphBuildState, BuildProgress } from "../types"
import { RootAnalyzer } from "./RootAnalyzer"
import { FileSummarizer } from "./FileSummarizer"
import { DirectorySummarizer } from "./DirectorySummarizer"
import { FileService } from "../tools/FileService"
import { ILogger } from "../../../utils/logger"
import { BuildStateTracer } from "./BuildStateTracer"
import { ProgressTracer } from "../tools/ProgressTracer"

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
	
	// 任务控制：防止重复执行
	private currentBuildPromise: Promise<void> | null = null

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
	 */
	async start(workspacePath: string, options: BuildOptions = {}): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot build.")
		}
		
		// 如果已有任务在执行，直接返回该任务
		if (this.currentBuildPromise) {
			this.logger.info("构建任务已在进行中，等待完成")
			return this.currentBuildPromise
		}
		
		// 允许重新构建已完成的知识图谱
		if (this.buildStateTracer.isCompleted() && !options.forceRebuild) {
			this.logger.info("知识图谱已完成构建")
			return
		}

		// 创建新的构建任务
		this.currentBuildPromise = this.executeBuild(workspacePath, options)
			.catch(async (error) => {
				await this.handleBuildError(error)
				throw error
			})
			.finally(() => {
				// 任务完成后清理
				this.currentBuildPromise = null
			})

		return this.currentBuildPromise
	}

	/**
	 * 暂停构建
	 */
	async pause(workspacePath: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot pause.")
		}
		if (!this.buildStateTracer.isRunning()) {
			return
		}

		this.buildStateTracer.updateBuildState({
			status: "paused",
		})

		this.logger.info("[GraphBuilder] 构建已暂停")
	}

	/**
	 * 继续构建
	 */
	async resume(workspacePath: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot resume.")
		}
		if (!this.buildStateTracer.isPaused()) {
			throw new Error("构建任务未处于暂停状态")
		}

		// 如果已有任务在执行，不能继续
		if (this.currentBuildPromise) {
			this.logger.warn("已有构建任务在执行，无法继续")
			return
		}

		await this.buildStateTracer.updateBuildState({
			status: "running",
		})

		this.logger.info(`[GraphBuilder] 构建已恢复：${workspacePath}`)

		// 恢复构建 - 继续之前未完成的任务
		this.currentBuildPromise = this.executeBuild(workspacePath, { resumeFromPrevious: true })
			.catch(async (error) => {
				await this.handleBuildError(error)
			})
			.finally(() => {
				this.currentBuildPromise = null
			})

		return this.currentBuildPromise
	}

	async clear(workspacePath: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot clear.")
		}
		
		// 如果有正在执行的任务，先暂停再清除
		if (this.currentBuildPromise) {
			this.logger.info("检测到正在执行的构建任务，先暂停后清除")
			await this.buildStateTracer.updateBuildState({ status: "paused" })
			
			// 设置超时等待，避免死锁
			const timeoutPromise = new Promise<void>((_, reject) => {
				setTimeout(() => reject(new Error("清除操作超时")), 10000) // 10秒超时
			})
			
			try {
				await Promise.race([this.currentBuildPromise, timeoutPromise])
			} catch (error) {
				// 忽略任务执行错误或超时，继续清除
				this.logger.warn("构建任务执行出错或超时，继续清除操作")
			}
			
			// 强制清理当前任务引用
			this.currentBuildPromise = null
		}
		
		await this.buildStateTracer.clear()
		await this.rootAnalyzer.clear()
		await this.fileSummarizer.clear()
		await this.directorySummarizer.clear()

		this.logger.info("知识图谱存储已清除")
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

		// 获取项目文件 - 文件收集阶段
		this.progressTracer.start('fileCollection')
		const allFiles = await this.fileService.getProjectFilteredFiles(workspacePath)
		const fileCollectionDuration = this.progressTracer.end('fileCollection')
		
		const totalFiles = allFiles.length
		this.logger.info(`[GraphBuilder] 项目源码文件数量: ${totalFiles}, 文件收集耗时: ${ProgressTracer.formatDuration(fileCollectionDuration)}`)

		// 分析文件变更
		const incrementalResult = await this.buildStateTracer.resolveFileList(allFiles)
		this.logger.info(`[GraphBuilder] 本轮文件变更: 新增${incrementalResult.added.length}, 修改${incrementalResult.modified.length}, 删除${incrementalResult.deleted.length}`)

		// 根据文件摘要（路径+核心功能关键词(或者核心导出函数)），重新全量生成目录摘要。TODO 增量

		let needDoFileSummary = true
		let needDoDirectorySummary = true

		if (incrementalResult.added.length == 0 && incrementalResult.modified.length == 0) {
			needDoFileSummary = false
			if (incrementalResult.deleted.length == 0) {
				needDoDirectorySummary = false
			}
		}
		if (!needDoDirectorySummary && !needDoFileSummary) {
			this.logger.info("[GraphBuilder] 无需更新，构建完成")
			await this.buildStateTracer.updateBuildState({
				phase: "completed",
				failedFiles: totalFiles,
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
		const currentPhase = currentState?.phase || "root_analysis"
		const phases = ["root_analysis", "file_analysis", "directory_analysis", "completed"]
		const currentPhaseIndex = phases.indexOf(currentPhase)

		// 2. 根目录分析
		let rootInfo: any
		
		if (!options.resumeFromPrevious || currentPhaseIndex <= phases.indexOf("root_analysis")) {
			this.progressTracer.start('rootAnalysis')
			
			if (!this.rootAnalyzer) {
				throw new Error("根分析器未初始化")
			}

			rootInfo = await this.rootAnalyzer.analyzeRoot(workspacePath, allFiles)
			const rootAnalysisDuration = this.progressTracer.end('rootAnalysis')

			this.logger.info(`[GraphBuilder] 根目录分析完成，耗时: ${ProgressTracer.formatDuration(rootAnalysisDuration)}`)
			await this.buildStateTracer.updateBuildState({
				phase: "root_analysis",
				error: "根目录分析完成"
			})
			await this.buildStateTracer.updatePhaseProgress('root_analysis', 1, 1, 'completed')
		} else {
			this.logger.info("[GraphBuilder] 跳过根目录分析 (已完成)")
			rootInfo = await this.rootAnalyzer.getRootInfo()
			if (!rootInfo) {
				this.logger.warn("[GraphBuilder] 无法加载根目录信息，重新分析")
				rootInfo = await this.rootAnalyzer.analyzeRoot(workspacePath, allFiles)
			}
		}

		// 文件摘要
		if (needDoFileSummary) {
			// 检查暂停状态
			if (this.buildStateTracer.isPaused()) {
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
					const batchSize = progress.batchProcessedFilePaths.length
					const batchDuration = progress.batchDuration || 0
					
					// 记录批次统计
					this.progressTracer.recordBatch('fileSummary', batchSize, batchDuration)
					
					this.logger.info(`[GraphBuilder] 文件摘要: 批次大小: ${batchSize}, 耗时: ${ProgressTracer.formatDuration(batchDuration)}，进度：${progress.totalProcessedFiles}/${progress.filesToProcess}`)
					
					// 计算累计已处理文件数 (初始已完成 + 本次新增已完成)
					const currentTotalProcessed = initialProcessedFiles + progress.totalProcessedFiles

					// 使用统一的 updateBuildState 方法
					await this.buildStateTracer.updateBuildState({
						phase: "file_analysis",
						processedFiles: currentTotalProcessed,
						failedFiles: progress.batchFailedFiles,
						error: progress.message
					}, progress.batchProcessedFilePaths, "success")

					// 更新阶段进度
					await this.buildStateTracer.updatePhaseProgress('file_analysis', currentTotalProcessed, totalFilesToProcess, 'running')
				},
			)
			// 标记文件分析阶段完成
			await this.buildStateTracer.updatePhaseProgress('file_analysis', totalFilesToProcess, totalFilesToProcess, 'completed')
			
			const fileSummaryDuration = this.progressTracer.end('fileSummary')
			const batchStats = this.progressTracer.getBatchStats('fileSummary')
			
			this.logger.info(`[GraphBuilder] 文件摘要完成，总耗时: ${ProgressTracer.formatDuration(fileSummaryDuration)}, 总批次: ${batchStats.totalBatches}, 平均每批次: ${batchStats.averageItemsPerBatch}个文件, 平均批次耗时: ${ProgressTracer.formatDuration(batchStats.averageBatchDuration)}`)
		} else {
			this.logger.info("[GraphBuilder] 跳过文件摘要 (无变更)")
		}

		// 检查暂停状态
		if (this.buildStateTracer.isPaused()) {
			this.logger.info("[GraphBuilder] 构建已暂停")
			return
		}

		// 目录摘要
		if (needDoDirectorySummary) {
			// 检查暂停状态
			if (this.buildStateTracer.isPaused()) {
				this.logger.info("[GraphBuilder] 构建已暂停，停止目录摘要")
				return
			}
			
			this.progressTracer.start('directorySummary')
			await this.buildStateTracer.updateBuildState({
				phase: "directory_analysis",
				failedFiles: 0,
				error: "分析目录结构..."
			})
			
			// 重置目录分析阶段的进度
			await this.buildStateTracer.updatePhaseProgress('directory_analysis', 0, 0, 'running')

			if (!this.directorySummarizer) {
				throw new Error("目录分析器未初始化")
			}
			await this.directorySummarizer.summarizeDirectories(
				rootInfo,
				allFiles,
				async (progress: BuildProgress) => {
					
					// 使用统一的 updateBuildState 方法
					await this.buildStateTracer.updateBuildState({
						phase: "directory_analysis",
						totalFilesToProcess: progress.filesToProcess,
						processedFiles: progress.totalProcessedFiles,
						failedFiles: progress.batchFailedFiles,
						error: progress.message
					})

					// 更新阶段进度
					await this.buildStateTracer.updatePhaseProgress('directory_analysis', progress.totalProcessedFiles, progress.filesToProcess, 'running')
				},
				incrementalResult // 传递增量变更信息
			)
			
			// 标记目录分析阶段完成
			const finalState = this.buildStateTracer.getCurrentState()
			const totalDirs = finalState?.phaseProgress?.directory_analysis?.total || 0
			await this.buildStateTracer.updatePhaseProgress('directory_analysis', totalDirs, totalDirs, 'completed')

			const directorySummaryDuration = this.progressTracer.end('directorySummary')
			this.logger.info(`[GraphBuilder] 目录摘要完成，耗时: ${ProgressTracer.formatDuration(directorySummaryDuration)}`)
		}
		// 完成构建
		await this.buildStateTracer.updateBuildState({
			phase: "completed",
			failedFiles: totalFiles,
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
			status: "error",
			error: errorMessage
		})
	}

}
