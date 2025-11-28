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
	 * 检测并修复假状态
	 * 
	 * 假状态：状态机显示 RUNNING，但 currentBuildPromise 为 null
	 * 常见原因：
	 * 1. VSCode 崩溃/关闭后重启（最常见）
	 * 2. 插件重新加载
	 * 3. 异常导致任务创建失败但状态已更新
	 * 4. 系统资源耗尽导致进程终止
	 * 
	 * @returns true 如果检测到假状态并已修复
	 */
	private async detectAndRepairGhostState(): Promise<boolean> {
		const currentState = this.buildStateTracer.getCurrentState()
		
		// 只有 RUNNING 状态才需要检测
		if (currentState?.status !== KNOWLEDGE_GRAPH_STATUS.RUNNING) {
			return false
		}
		
		// 检查是否有活跃任务
		const hasActiveTask = this.currentBuildPromise !== null
		
		if (!hasActiveTask) {
			// ❌ 假状态：状态是 RUNNING，但没有任务
			this.logger.warn("[GraphBuilder] ========== 检测到假状态 ==========")
			this.logger.warn("[GraphBuilder] 状态: RUNNING, 但 currentBuildPromise = null")
			this.logger.warn("[GraphBuilder] 可能原因: VSCode崩溃、插件重载、或异常中断")
			
			// 修复为 PAUSED，让用户决定继续或清空
			await this.buildStateTracer.updateBuildState({
				status: KNOWLEDGE_GRAPH_STATUS.PAUSED,
				error: "检测到异常中断，已自动修复状态。可以继续构建或清空重来。"
			})
			
			this.logger.info("[GraphBuilder] 状态已修复: RUNNING → PAUSED")
			this.logger.info("[GraphBuilder] ========================================")
			return true  // 已修复
		}
		
		return false  // 无需修复
	}

	/**
	 * 开始构建知识图谱
	 * ✅ 增强版：使用互斥锁和原子操作确保同一时间只有一个构建任务
	 * ✅ 修复：立即返回，不等待构建完成，避免 Mutex lock timeout
	 * ✅ 假状态检测：自动修复异常中断导致的假状态
	 */
	async start(workspacePath: string, options: BuildOptions = {}): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot build.")
		}

		// 1. 检查清除状态
		if (this.isClearing) {
			throw new Error("正在清除知识图谱，请稍后重试")
		}
		
		// ✅ 2. 检测并修复假状态（在锁外，避免阻塞）
		await this.detectAndRepairGhostState()
		
		// 3. 检查是否已有任务（双重检查）- 在锁外检查，避免重复任务
		if (this.currentBuildPromise) {
			this.logger.info("[GraphBuilder] 构建任务已在运行中，忽略重复请求")
			return // ✅ 立即返回，不等待
		}
		
		// ========== 原子区域：检查和任务创建 ==========
		await this.buildMutex.lock()
		
		try {
			// 4. 再次检查是否已有任务（双重检查模式）
			if (this.currentBuildPromise) {
				this.logger.info("[GraphBuilder] 构建任务已在运行中（双重检查），忽略重复请求")
				return // ✅ 立即返回，不等待
			}
			
			// 5. 检查是否可以启动（只读检查，假状态已被修复）
			const canStart = this.buildStateTracer.canStartBuildNow()
			if (!canStart) {
				const currentStatus = this.buildStateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许启动构建。请先清空知识图谱后再重新构建。`)
			}
			
		// ✅ 6. 立即更新状态为 RUNNING（快速响应，供 UI 显示）
		// 注意：必须同时重置 phaseProgress，避免使用旧数据导致进度计算错误
		await this.buildStateTracer.updateBuildState({
			status: KNOWLEDGE_GRAPH_STATUS.RUNNING,
			phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
			progress: 0,  // ✅ 重置进度为 0%
			processedFiles: 0,  // ✅ 重置已处理文件数
			totalFiles: 0,  // ✅ 重置总文件数
			failedFiles: 0,  // ✅ 重置失败文件数
			error: "正在启动构建...",
			// ✅ 重置阶段进度，避免使用旧的 phaseProgress 导致显示错误进度（如 98.5%）
			phaseProgress: {
				root_analysis: { processed: 0, total: 1, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
				file_analysis: { processed: 0, total: 0, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
				directory_analysis: { processed: 0, total: 0, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
			}
		})
		this.logger.info("[GraphBuilder] 状态已更新为 RUNNING，进度已重置为 0%")
			
			// 7. 初始化中止控制器
			if (this.abortController) {
				this.abortController.abort()
			}
			this.abortController = new AbortController()
			
			// 8. 设置各组件的统一终止检查器
			const stopChecker = () => {
				return this.buildStateTracer.isPaused() || this.abortController?.signal.aborted || false
			}
			this.rootAnalyzer.setPauseChecker(stopChecker)
			this.fileSummarizer.setPauseChecker(stopChecker)
			this.directorySummarizer.setPauseChecker(stopChecker)
			
			// 9. 创建新的构建任务（此时状态已是 RUNNING）
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
		
		// ✅ 立即返回，不等待 currentBuildPromise 完成
		// 这样可以避免占用 operationMutex 锁过长时间，防止 Mutex lock timeout
	}

	/**
	 * 暂停构建
	 * ✅ 增强版：使用原子操作确保状态一致性
	 */
	async pause(workspacePath: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot pause.")
		}
		
		// ✅ 使用状态机暂停（自动检查状态）
		try {
			await this.buildStateTracer.pauseBuild()
		} catch (error) {
			const currentStatus = this.buildStateTracer.getCurrentState()?.status
			this.logger.warn(`[GraphBuilder] 暂停失败: ${error instanceof Error ? error.message : String(error)}`)
			throw error
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
	 * ✅ 方案 A（取消暂停）：
	 *    - 如果任务还在（等待 LLM），取消暂停标志，任务继续执行
	 *    - 如果任务已退出，创建新任务
	 * ✅ 假状态检测：自动修复异常中断导致的假状态
	 * ✅ 资源利用：快速"暂停-继续"不浪费 LLM 请求
	 */
	async resume(workspacePath: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot resume.")
		}
		
		this.logger.info("[GraphBuilder] 收到恢复请求，准备分析场景")
		
		// ✅ 检测并修复假状态（理论上已在初始化时修复，但防御性检查）
		const wasGhostState = await this.detectAndRepairGhostState()
		if (wasGhostState) {
			this.logger.info("[GraphBuilder] 检测到假状态，已修复，将创建新任务")
		}
		
		// ========== 原子区域：检查和任务恢复 ==========
		await this.buildMutex.lock()
		
		try {
			// 状态检查（只有 PAUSED 状态才能恢复）
			if (!this.buildStateTracer.canResume()) {
				const currentStatus = this.buildStateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许恢复`)
			}
			
			// 🔑 核心判断：任务是否还在运行
			if (this.currentBuildPromise) {
				// ===== 场景 A：快速继续（任务还在，取消暂停）=====
				
				this.logger.info("[GraphBuilder] ========================================")
				this.logger.info("[GraphBuilder] 场景 A: 快速继续（取消暂停）")
				this.logger.info("[GraphBuilder] 检测到任务仍在执行（可能在等待 LLM 响应）")
				this.logger.info("[GraphBuilder] 操作: 取消暂停标志，任务将继续执行")
				this.logger.info("[GraphBuilder] 优势: 不浪费已发送的 LLM 请求")
				
				// 1. 更新状态为 RUNNING
				await this.buildStateTracer.resumeBuild()
				this.logger.info("[GraphBuilder] 状态已更新: PAUSED → RUNNING")
				
				// 2. 🔑 重置 abortController（关键！）
				if (this.abortController) {
					this.abortController.abort()  // 先中止旧的
					this.logger.debug("[GraphBuilder] 旧的 abortController 已中止")
				}
				this.abortController = new AbortController()  // 创建新的
				this.logger.info("[GraphBuilder] 已创建新的 abortController")
				
				// 3. 🔑 重新设置 stopChecker（使用新的 abortController）
				const stopChecker = () => {
					return this.buildStateTracer.isPaused() || this.abortController?.signal.aborted || false
				}
				this.rootAnalyzer.setPauseChecker(stopChecker)
				this.fileSummarizer.setPauseChecker(stopChecker)
				this.directorySummarizer.setPauseChecker(stopChecker)
				this.logger.debug("[GraphBuilder] stopChecker 已更新")
				
				this.logger.info("[GraphBuilder] 暂停已取消，任务将在下一个检查点继续执行")
				this.logger.info("[GraphBuilder] ========================================")
				return  // ✅ 不创建新任务，当前任务继续
				
			} else {
				// ===== 场景 B：长时间继续（任务已退出，创建新任务）=====
				
				this.logger.info("[GraphBuilder] ========================================")
				this.logger.info("[GraphBuilder] 场景 B: 长时间继续（启动新任务）")
				this.logger.info("[GraphBuilder] 任务已退出（等待 LLM 后已完成检查点退出）")
				this.logger.info("[GraphBuilder] 操作: 创建新的恢复任务")
				
				// 1. 更新状态为 RUNNING
				await this.buildStateTracer.resumeBuild()
				this.logger.info("[GraphBuilder] 状态已更新: PAUSED → RUNNING")
				
				// 2. 初始化 abortController
				this.abortController = new AbortController()
				this.logger.info("[GraphBuilder] 已创建 abortController")
				
				// 3. 设置 stopChecker
				const stopChecker = () => {
					return this.buildStateTracer.isPaused() || this.abortController?.signal.aborted || false
				}
				this.rootAnalyzer.setPauseChecker(stopChecker)
				this.fileSummarizer.setPauseChecker(stopChecker)
				this.directorySummarizer.setPauseChecker(stopChecker)
				
				// 4. 创建新任务
				this.currentBuildPromise = this.executeBuild(workspacePath, { resumeFromPrevious: true })
					.catch(async (error) => {
						await this.handleBuildError(error)
						throw error
					})
					.finally(() => {
						this.currentBuildPromise = null
						this.abortController = null
						this.logger.info("[GraphBuilder] 恢复任务已完成并清理")
					})
					
				this.logger.info("[GraphBuilder] 恢复任务已创建并启动")
				this.logger.info("[GraphBuilder] ========================================")
			}
			
		} finally {
			// 确保锁被释放
			this.buildMutex.unlock()
		}
		
		// ========== 原子区域结束 ==========
	}

	/**
	 * 清除知识图谱
	 * ✅ 增强版：使用互斥锁确保不会与其他操作冲突
	 * ✅ 详细日志：记录每个清除步骤，便于问题排查
	 */
	async clear(workspacePath: string): Promise<void> {
		this.logger.info("[GraphBuilder] ================================================")
		this.logger.info("[GraphBuilder] ========== 收到清空请求 ==========")
		this.logger.info("[GraphBuilder] 工作区: " + workspacePath)
		
		// ========== 原子区域：检查和清除操作 ==========
		this.logger.info("[GraphBuilder] 尝试获取 buildMutex 锁...")
		await this.buildMutex.lock()
		this.logger.info("[GraphBuilder] ✓ buildMutex 锁已获取")
		
		try {
			// 1. 参数校验
			if (!workspacePath) {
				this.logger.error("[GraphBuilder] ✗ workspacePath 为空，清空失败")
				throw new Error("workspacePath is null, cannot clear.")
			}
			this.logger.info("[GraphBuilder] ✓ 参数校验通过")

			// 2. 检查是否正在清除
			if (this.isClearing) {
				this.logger.warn("[GraphBuilder] ⚠ 清除操作已在进行中，忽略重复请求")
				return
			}
			this.logger.info("[GraphBuilder] ✓ 无重复清除操作")

			// 3. 状态检查
			const currentState = this.buildStateTracer.getCurrentState()
			this.logger.info(`[GraphBuilder] 当前状态: ${currentState?.status || 'null'}`)
			
			if (!this.buildStateTracer.canClear()) {
				const currentStatus = currentState?.status
				this.logger.error(`[GraphBuilder] ✗ 当前状态 ${currentStatus} 不允许清除`)
				throw new Error(`当前状态 ${currentStatus} 不允许清除。请先暂停构建后再清除。`)
			}
			this.logger.info("[GraphBuilder] ✓ 状态检查通过，允许清除")

			// 4. 开始清除
			this.isClearing = true
			this.logger.info("[GraphBuilder] ------------------------------------------")
			this.logger.info("[GraphBuilder] 开始清除流程...")
			
			try {
				// 5. 中断当前操作
				if (this.abortController) {
					this.logger.info("[GraphBuilder] [1/6] 中止控制器已存在，正在中断...")
					this.abortController.abort()
					this.abortController = null
					this.logger.info("[GraphBuilder] ✓ 中止控制器已中断并清理")
				} else {
					this.logger.info("[GraphBuilder] [1/6] 无需中断（中止控制器为空）")
				}

				// 6. 清理构建任务引用
				if (this.currentBuildPromise) {
					this.logger.info("[GraphBuilder] [2/6] 检测到暂停的构建任务，正在清理...")
					this.currentBuildPromise = null
					this.logger.info("[GraphBuilder] ✓ 构建任务引用已清理")
				} else {
					this.logger.info("[GraphBuilder] [2/6] 无需清理（构建任务引用为空）")
				}

				// 7. 清除各组件存储（按顺序）
				this.logger.info("[GraphBuilder] [3/6] 清除构建状态...")
				await this.buildStateTracer.clear()
				this.logger.info("[GraphBuilder] ✓ 构建状态已清除")
				
				this.logger.info("[GraphBuilder] [4/6] 清除根目录分析结果...")
				await this.rootAnalyzer.clear()
				this.logger.info("[GraphBuilder] ✓ 根目录分析结果已清除")
				
				this.logger.info("[GraphBuilder] [5/6] 清除文件摘要...")
				await this.fileSummarizer.clear()
				this.logger.info("[GraphBuilder] ✓ 文件摘要已清除")
				
				this.logger.info("[GraphBuilder] [6/6] 清除目录摘要...")
				await this.directorySummarizer.clear()
				this.logger.info("[GraphBuilder] ✓ 目录摘要已清除")

				this.logger.info("[GraphBuilder] ------------------------------------------")
				this.logger.info("[GraphBuilder] ========== 清空完成 ==========")
				this.logger.info("[GraphBuilder] ================================================")
			} catch (error) {
				this.logger.error("[GraphBuilder] ✗ 清除过程中发生错误:")
				this.logger.error("[GraphBuilder] 错误详情: " + (error instanceof Error ? error.message : String(error)))
				if (error instanceof Error && error.stack) {
					this.logger.error("[GraphBuilder] 错误堆栈:\n" + error.stack)
				}
				throw error
			} finally {
				this.isClearing = false
				this.logger.info("[GraphBuilder] isClearing 标志已重置为 false")
			}
		} finally {
			// 确保锁被释放
			this.buildMutex.unlock()
			this.logger.info("[GraphBuilder] buildMutex 锁已释放")
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
		
		this.logger.info(`[GraphBuilder] ================================================`)
		this.logger.info(`[GraphBuilder] ========== 开始知识图谱构建 ==========`)
		this.logger.info(`[GraphBuilder] 工作区: ${workspacePath}`)
		this.logger.info(`[GraphBuilder] 模式: ${options.resumeFromPrevious ? '恢复构建' : '新建构建'}`)
		this.logger.info(`[GraphBuilder] ================================================`)
		
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

		// ✅ 只删除真正被删除的文件摘要
		// 修改的文件通过 update 接口处理（SQLite 用 UPSERT，JSONL 自动先删后加）
		if (incrementalResult.deleted.length > 0) {
			const deletedPaths = incrementalResult.deleted.map(f => f.path)
			await this.fileSummarizer.deleteSummaries(deletedPaths)
			this.logger.info(`[GraphBuilder] 已删除 ${deletedPaths.length} 个文件的摘要`)
		} else {
			this.logger.info(`[GraphBuilder] 无需删除文件摘要（没有文件被删除）`)
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

		if (!needDoDirectorySummary && !needDoFileSummary) {
			this.logger.info("[GraphBuilder] 无需更新，构建完成")
			await this.buildStateTracer.updateBuildState({
				phase: "completed",
				status: KNOWLEDGE_GRAPH_STATUS.COMPLETED,
				totalFiles: totalFiles,           // ✅ 设置实际文件总数
				processedFiles: totalFiles,       // ✅ 所有文件都已处理
				totalFilesToProcess: totalFiles,  // ✅ 保持一致性
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
			this.logger.info(`[GraphBuilder] ================================================`)
			this.logger.info(`[GraphBuilder] ========== 开始文件摘要阶段 ==========`)
			this.logger.info(`[GraphBuilder] 总文件数: ${totalFiles}`)
			this.logger.info(`[GraphBuilder] 需处理: ${incrementalResult.added.length + incrementalResult.modified.length} 个文件`)
			this.logger.info(`[GraphBuilder] 未变更: ${incrementalResult.unchangedCount} 个文件`)
			this.logger.info(`[GraphBuilder] 新增: ${incrementalResult.added.length}, 修改: ${incrementalResult.modified.length}`)
			this.logger.info(`[GraphBuilder] ================================================`)

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
			
			this.logger.info(`[GraphBuilder] ================================================`)
			this.logger.info(`[GraphBuilder] ========== 文件摘要阶段完成 ==========`)
			this.logger.info(`[GraphBuilder] 总耗时: ${ProgressTracer.formatDuration(fileSummaryDuration)}`)
			this.logger.info(`[GraphBuilder] 总批次: ${batchStats.totalBatches}`)
			this.logger.info(`[GraphBuilder] 平均每批次: ${batchStats.averageItemsPerBatch} 个文件`)
			this.logger.info(`[GraphBuilder] 平均批次耗时: ${ProgressTracer.formatDuration(batchStats.averageBatchDuration)}`)
			this.logger.info(`[GraphBuilder] ================================================`)
		} else {
			this.logger.info("[GraphBuilder] 跳过文件摘要阶段 (无文件变更)")
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
			this.logger.info(`[GraphBuilder] ================================================`)
			this.logger.info(`[GraphBuilder] ========== 开始目录摘要阶段 ==========`)
			this.logger.info(`[GraphBuilder] ================================================`)
			
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
					// 如果正在清除，停止更新状态
					if (this.isClearing) return
					
					// 🔑 记录目录摘要进度（每个目录完成时）
					// 计算目录摘要阶段对总进度的贡献（目录摘要阶段占总进度 10%）
					const phaseContribution = progress.filesToProcess > 0 
						? ((progress.totalProcessedFiles / progress.filesToProcess) * 10).toFixed(1)
						: '0.0'
					this.logger.info(
						`[GraphBuilder] 目录摘要进度: ${progress.totalProcessedFiles}/${progress.filesToProcess} 目录 ` +
						`(目录摘要阶段占总进度 10%，当前贡献 ${phaseContribution}%)`
					)
					
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
			this.logger.info(`[GraphBuilder] ================================================`)
			this.logger.info(`[GraphBuilder] ========== 目录摘要阶段完成 ==========`)
			this.logger.info(`[GraphBuilder] 总目录数: ${totalDirs}`)
			this.logger.info(`[GraphBuilder] 总耗时: ${ProgressTracer.formatDuration(directorySummaryDuration)}`)
			this.logger.info(`[GraphBuilder] ================================================`)
		} else {
			this.logger.info("[GraphBuilder] 跳过目录摘要阶段 (无目录变更)")
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
		
		this.logger.info(`[GraphBuilder] ================================================`)
		this.logger.info(`[GraphBuilder] ========== 知识图谱构建完成 ==========`)
		this.logger.info(`[GraphBuilder] ================================================`)
		
		// 生成性能报告
		const performanceReport = this.progressTracer.generateReport()
		performanceReport.forEach(log => this.logger.info(log))
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
	 * 状态修复：处理插件初始化时的假状态
	 * 主要场景：VSCode 崩溃/关闭后重启，状态文件还是 RUNNING 但内存已清空
	 */
	public async repairBuildState(): Promise<void> {
		if (!this.buildStateTracer) {
			return
		}

		try {
			this.logger.info("[GraphBuilder] 执行初始化状态修复检查...")
			
			// ✅ 使用统一的假状态检测方法
			const wasRepaired = await this.detectAndRepairGhostState()
			
			if (wasRepaired) {
				this.logger.info("[GraphBuilder] ✓ 初始化时检测到假状态并已自动修复")
			} else {
				this.logger.info("[GraphBuilder] ✓ 状态正常，无需修复")
			}
		} catch (error) {
			this.logger.error(`[GraphBuilder] 状态修复失败: ${error}`)
			// 状态修复失败不应该阻止初始化
		}
	}

}
