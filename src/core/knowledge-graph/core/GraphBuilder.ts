import { KnowledgeGraphConfig, BuildOptions, KnowledgeGraphBuildState, BuildProgress, FileChanges } from "../types"
import { KNOWLEDGE_GRAPH_STATUS, KNOWLEDGE_GRAPH_PHASE } from "@roo-code/types"
import { RootAnalyzer } from "./RootAnalyzer"
import { FileSummarizer } from "./FileSummarizer"
import { DirectorySummarizer } from "./DirectorySummarizer"
import { FileService } from "./FileService"
import { ILogger } from "../../../utils/logger"
import { BuildStateTracer } from "./BuildStateTracer"
import { ProgressTracer } from "../tools/ProgressTracer"
import { Mutex } from "../utils/Mutex"
import { AbortedError } from "../errors/KnowledgeGraphError"
import { LOG_CONFIG } from "../constants"

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
	// ✅ 启用状态检查函数：用于检测知识图谱是否被禁用
	private isEnabledCheck: (() => boolean) | null = null

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
	 * ✅ 设置启用状态检查函数
	 * 用于在构建过程中检测知识图谱是否被禁用
	 */
	public setIsEnabledCheck(isEnabledCheck: () => boolean): void {
		this.isEnabledCheck = isEnabledCheck
	}

	/**
	 * ✅ 统一的停止检查方法
	 * 检查是否应该停止构建：暂停 || 中止 || 禁用
	 * 
	 * @returns true 表示应该停止构建
	 */
	private shouldStop(): boolean {
		return this.buildStateTracer.isPaused() || 
		       this.abortController?.signal.aborted || 
		       (this.isEnabledCheck !== null && !this.isEnabledCheck())
	}

	/**
	 * ✅ 统一设置停止检查器（DRY 原则）
	 * 给所有组件设置相同的停止检查函数
	 */
	private setupStopCheckers(): void {
		const checker = () => this.shouldStop()
		this.rootAnalyzer.setPauseChecker(checker)
		this.fileSummarizer.setPauseChecker(checker)
		this.directorySummarizer.setPauseChecker(checker)
	}

	/**
	 * ✅ 检查并处理停止状态
	 * 如果应该停止，记录日志并更新状态
	 * 
	 * @param checkpointName 检查点名称（用于日志）
	 * @returns true 表示已停止，调用者应该 return
	 */
	private async checkAndHandleStop(checkpointName: string): Promise<boolean> {
		if (!this.shouldStop()) {
			return false
		}

		// 判断停止原因
		if (this.isEnabledCheck && !this.isEnabledCheck()) {
			this.logger.info(`[GraphBuilder] 构建已停止 (${checkpointName}): 知识图谱已禁用`)
			await this.buildStateTracer.updateBuildState({
				status: KNOWLEDGE_GRAPH_STATUS.INTERRUPTED,
				error: "知识图谱已禁用"
			})
		} else if (this.buildStateTracer.isPaused()) {
			this.logger.info(`[GraphBuilder] 构建已暂停 (${checkpointName})`)
		} else {
			this.logger.info(`[GraphBuilder] 构建已中止 (${checkpointName})`)
		}

		return true
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
	 * 修复策略：
	 * - 修复为 INTERRUPTED（中断）状态
	 * - 用户可以点击"继续"恢复构建
	 * - 自动构建不受影响（区别于用户主动的 PAUSED）
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
			
			// ✅ 修复为 INTERRUPTED（被动中断）
			// 区别于 PAUSED（用户主动暂停）：
			// - INTERRUPTED 不阻止自动构建
			// - 用户可以点击"继续"恢复
			await this.buildStateTracer.updateBuildState({
				status: KNOWLEDGE_GRAPH_STATUS.INTERRUPTED,
				error: "检测到异常中断（可能是程序崩溃或重启）。可以点击继续恢复构建。"
			})
			
			this.logger.info(`[GraphBuilder] 状态已修复: RUNNING → INTERRUPTED`)
			this.logger.info(`[GraphBuilder] 用户可点击"继续"恢复，自动构建不受影响`)
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
		// 保持现有 phaseProgress，稍后根据 files.json 智能恢复（单一数据源原则）
		await this.buildStateTracer.updateBuildState({
			status: KNOWLEDGE_GRAPH_STATUS.RUNNING,
			phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
			error: "正在分析文件变更...",
		})
		this.logger.info("[GraphBuilder] 状态已更新为 RUNNING，正在分析文件变更...")
			
			// 7. 初始化中止控制器
			if (this.abortController) {
				this.abortController.abort()
			}
			this.abortController = new AbortController()
			
			// 8. ✅ 设置各组件的统一终止检查器（使用抽取的方法）
			this.setupStopCheckers()
			
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
				
				// 3. 🔑 重新设置 stopChecker（使用抽取的方法）
				this.setupStopCheckers()
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
				
				// 3. ✅ 设置 stopChecker（使用抽取的方法）
				this.setupStopCheckers()
				
				// 4. 创建新任务
				this.currentBuildPromise = this.executeBuild(workspacePath, { resumeFromPrevious: true })
					.catch(async (error) => {
						await this.handleBuildError(error)
						throw error
					})
					.finally(() => {
						this.currentBuildPromise = null
						this.abortController = null
						this.logger.info("[GraphBuilder] 任务已完成并清理")
					})
					
				this.logger.info("[GraphBuilder] 任务已创建并启动")
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
		
		// ✅ 检查停止状态
		if (await this.checkAndHandleStop("文件收集后")) {
			return
		}

		const totalFiles = allFiles.length
		this.logger.info(`[GraphBuilder] 项目源码文件数量: ${totalFiles}, 文件收集耗时: ${ProgressTracer.formatDuration(fileCollectionDuration)}`)

		// 分析文件变更
		const incrementalResult = await this.buildStateTracer.resolveFileList(allFiles)
		this.logger.info(`[GraphBuilder] 本轮文件变更: 新增${incrementalResult.added.length}, 修改${incrementalResult.modified.length}, 删除${incrementalResult.deleted.length}`)
		this.logger.info(`[GraphBuilder] 已成功处理: ${incrementalResult.successCount}/${totalFiles} (来自 files.json)`)

		// ✅ 检查关键文件是否变更（如 package.json, tsconfig.json 等）
		const oldRootInfo = await this.rootAnalyzer.getRootInfo()
		const keyFilesChanged = await this.rootAnalyzer.shouldReanalyzeRoot(workspacePath, oldRootInfo)
		
		if (keyFilesChanged && oldRootInfo) {
			this.logger.info("================================================")
			this.logger.info("[GraphBuilder] ⚠️ 检测到关键文件变更，将清空并重新构建知识图谱")
			this.logger.info("[GraphBuilder] 关键文件变更会影响项目结构和依赖关系")
			this.logger.info("================================================")
			
			// 清空所有已处理的数据
			await this.fileSummarizer.clear()
			await this.directorySummarizer.clear()
			await this.rootAnalyzer.clear()
			// 注意：不清空 BuildStateTracer，保留任务ID和状态
			
			this.logger.info("[GraphBuilder] 已清空旧数据，将从头开始构建")
			
			// 重置 incrementalResult，将所有文件标记为新增
			incrementalResult.added = allFiles
			incrementalResult.modified = []
			incrementalResult.deleted = []
			incrementalResult.successCount = 0
			incrementalResult.unchangedCount = 0
		}

		// ✅ 检查停止状态
		if (await this.checkAndHandleStop("文件变更分析后")) {
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
				totalFiles: totalFiles,
				processedFiles: 0,
				totalFilesToProcess: 0,
				failedFiles: 0,
				error: "",
				addedFiles: incrementalResult.added.length,
				modifiedFiles: incrementalResult.modified.length,
				deletedFiles: incrementalResult.deleted.length,
				// ✅ 清空本次LLM统计（本次无LLM调用）
				llmStatistics: {
					totalInputTokens: 0,
					totalOutputTokens: 0,
					totalTokens: 0,
					totalRequests: 0,
					successfulRequests: 0,
					failedRequests: 0,
					totalDuration: 0,
				},
				// ✅ 清空本次阶段耗时（本次无处理）
				phaseDurations: {
					fileCollection: 0,
					rootAnalysis: 0,
					fileSummary: 0,
					directorySummary: 0,
				},
			})
			return
		}

		// 修正：totalFilesToProcess 应该是总文件数，以反映整体进度
		const totalFilesToProcess = totalFiles

		// 初始化构建
		if (!options.resumeFromPrevious) {
			// 场景：全新构建（从 PENDING 或 COMPLETED 启动）
			await this.buildStateTracer.initializeBuildState(workspacePath, totalFiles, totalFilesToProcess, incrementalResult.successCount)
			
			// ✅ 记录增量统计
			await this.buildStateTracer.updateBuildState({
				addedFiles: incrementalResult.added.length,
				modifiedFiles: incrementalResult.modified.length,
				deletedFiles: incrementalResult.deleted.length,
			})
		} else {
			// 场景：恢复构建（从 PAUSED 继续）
			this.logger.info("[GraphBuilder] 恢复构建，跳过状态初始化")
			
			// ✅ 更新文件统计
			await this.buildStateTracer.updateBuildState({
				totalFiles: totalFiles,
				totalFilesToProcess: totalFiles,
				addedFiles: incrementalResult.added.length,
				modifiedFiles: incrementalResult.modified.length,
				deletedFiles: incrementalResult.deleted.length,
			})
		}

		// ✅ 智能恢复三阶段进度（基于 files.json 单一数据源）
		// 注意：必须在 initializeBuildState 之后调用，避免进度被重置
		const currentState = this.buildStateTracer.getCurrentState()
		await this.restorePhaseProgress(currentState, incrementalResult, totalFiles)

		// 获取当前状态以决定从哪里开始
		const currentPhase = currentState?.phase || KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS
		const phases = [KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.DEPENDENCY_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.COMPLETED]
		const currentPhaseIndex = phases.indexOf(currentPhase)

		// 2. 根目录分析
		let rootInfo: any
		
		// ✅ 智能判断是否需要重新分析 root
		// 注意：如果关键文件变更已经清空了数据，getRootInfo() 会返回 undefined
		const currentRootInfo = await this.rootAnalyzer.getRootInfo()
		const shouldReanalyze = !options.resumeFromPrevious || 
		                        currentPhaseIndex <= phases.indexOf(KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS) ||
		                        !currentRootInfo  // 数据已被清空
		
		if (shouldReanalyze) {
			this.progressTracer.start('rootAnalysis')
			
			if (!this.rootAnalyzer) {
				throw new Error("根分析器未初始化")
			}

			this.logger.info("[GraphBuilder] 开始根目录分析（首次构建或关键文件变更）")
			rootInfo = await this.rootAnalyzer.analyzeRoot(workspacePath, allFiles)
			const rootAnalysisDuration = this.progressTracer.end('rootAnalysis')

			this.logger.info(`[GraphBuilder] 根目录分析完成，耗时: ${ProgressTracer.formatDuration(rootAnalysisDuration)}`)
			await this.buildStateTracer.updateBuildState({
				phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
				error: "根目录分析完成"
			})
			await this.buildStateTracer.updatePhaseProgress(KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS, 1, 1, 'completed')
		} else {
			this.logger.info("[GraphBuilder] 跳过根目录分析（使用缓存，关键文件未变更）")
			rootInfo = currentRootInfo
			if (!rootInfo) {
				this.logger.warn("[GraphBuilder] 无法加载根目录信息，重新分析")
				rootInfo = await this.rootAnalyzer.analyzeRoot(workspacePath, allFiles)
			}
		}

		// ✅ 检查停止状态
		if (await this.checkAndHandleStop("根目录分析后")) {
			return
		}

		// 文件摘要
		if (needDoFileSummary) {
			// ✅ 检查停止状态
			if (await this.checkAndHandleStop("文件摘要开始前")) {
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
					
					// ✅ 计算累计已处理文件数（基于 files.json 的 successCount + 本批次增量）
					const currentTotalProcessed = incrementalResult.successCount + progress.totalProcessedFiles

					// ✅ 更新阶段进度（file_analysis），总进度由 calculateProgress 自动计算
					await this.buildStateTracer.updatePhaseProgress(
						KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS, 
						currentTotalProcessed, 
						totalFilesToProcess, 
						'running'
					)

					// 使用统一的 updateBuildState 方法（不再手动传入 progress）
					await this.buildStateTracer.updateBuildState({
						phase: KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS,
						failedFiles: progress.batchFailedFiles,
						error: progress.message
					}, progress.batchProcessedFilePaths, "success")
				},
			)
			
			// ✅ 检查停止状态
			if (await this.checkAndHandleStop("文件摘要完成后")) {
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

		// ✅ 检查停止状态
		if (await this.checkAndHandleStop("文件摘要阶段后")) {
			return
		}

		// 目录摘要
		if (needDoDirectorySummary) {
			// ✅ 检查停止状态
			if (await this.checkAndHandleStop("目录摘要开始前")) {
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
			
			// ✅ 检查停止状态
			if (await this.checkAndHandleStop("目录摘要完成后")) {
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
		
		// ✅ 最终检查停止状态
		if (await this.checkAndHandleStop("最终阶段")) {
			return
		}
		
		// 收集 LLM 统计数据和阶段耗时
		const llmStats = this.progressTracer.getLLMStats()
		const phaseDurations = {
			fileCollection: this.progressTracer.getDuration('fileCollection'),
			rootAnalysis: this.progressTracer.getDuration('rootAnalysis'),
			fileSummary: this.progressTracer.getDuration('fileSummary'),
			directorySummary: this.progressTracer.getDuration('directorySummary'),
		}
		
		// 计算总耗时
		const finalState = this.buildStateTracer.getCurrentState()
		const startTime = finalState?.startTime ? new Date(finalState.startTime).getTime() : Date.now()
		const totalDuration = Date.now() - startTime
		
		// 完成构建
		await this.buildStateTracer.updateBuildState({
			phase: KNOWLEDGE_GRAPH_PHASE.COMPLETED,
			status: KNOWLEDGE_GRAPH_STATUS.COMPLETED,
			failedFiles: 0,
			error: "构建完成",
			totalDuration,
			llmStatistics: {
				totalInputTokens: llmStats.totalInputTokens,
				totalOutputTokens: llmStats.totalOutputTokens,
				totalTokens: llmStats.totalTokens,
				totalRequests: llmStats.totalRequests,
				successfulRequests: llmStats.successfulRequests,
				failedRequests: llmStats.failedRequests,
				totalDuration: llmStats.totalDuration,
			},
			phaseDurations,
		})
		
		this.logger.info(`[GraphBuilder] ================================================`)
		this.logger.info(`[GraphBuilder] ========== 知识图谱构建完成 ==========`)
		this.logger.info(`[GraphBuilder] ================================================`)
		
		// 生成性能报告
		const performanceReport = this.progressTracer.generateReport()
		performanceReport.forEach(log => this.logger.info(log))
	}

	/**
	 * 智能恢复三阶段进度（基于 files.json 单一数据源）
	 * 
	 * 原则：
	 * - files.json 是唯一真相源，记录每个文件的真实状态
	 * - phaseProgress 是派生状态，从 files.json 计算得出
	 * - 不再使用 baseProgress/baseProcessedFiles 双重计算系统
	 * 
	 * 三阶段恢复逻辑：
	 * 1. root_analysis: 根据当前阶段判断是否已完成
	 * 2. file_analysis: 根据 successCount（来自 files.json）恢复
	 * 3. directory_analysis: 根据当前阶段和现有状态恢复
	 */
	private async restorePhaseProgress(
		currentState: KnowledgeGraphBuildState | undefined,
		incrementalResult: FileChanges,
		totalFiles: number
	): Promise<void> {
		const currentPhase = currentState?.phase || KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS
		const successCount = incrementalResult.successCount
		
		this.logger.info(`[GraphBuilder] ========== 恢复三阶段进度 ==========`)
		this.logger.info(`[GraphBuilder] 当前阶段: ${currentPhase}`)
		this.logger.info(`[GraphBuilder] 总文件数: ${totalFiles}`)
		this.logger.info(`[GraphBuilder] 已成功处理: ${successCount} (来自 files.json)`)
		
		// 阶段 1: Root Analysis
		// 判断逻辑：如果有任何文件已成功处理，说明 root 阶段肯定已完成
		const phases = [KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS, KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS]
		const currentPhaseIndex = phases.indexOf(currentPhase as any)
		const rootCompleted = successCount > 0 || currentPhaseIndex > phases.indexOf(KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS)
		
		await this.buildStateTracer.updatePhaseProgress(
			'root_analysis',
			rootCompleted ? 1 : 0,
			1,
			rootCompleted ? 'completed' : 'pending'
		)
		this.logger.info(`[GraphBuilder] - root_analysis: ${rootCompleted ? 'completed (1/1)' : 'pending (0/1)'}`)
		
		// 阶段 2: File Analysis（核心阶段，基于 files.json 的 successCount）
		const fileStatus = successCount > 0 ? 'running' : 'pending'
		await this.buildStateTracer.updatePhaseProgress(
			'file_analysis',
			successCount,
			totalFiles,
			fileStatus as any
		)
		this.logger.info(`[GraphBuilder] - file_analysis: ${fileStatus} (${successCount}/${totalFiles})`)
		
		// 阶段 3: Directory Analysis
		const dirCompleted = currentPhaseIndex >= phases.indexOf(KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS)
		const existingDirProgress = currentState?.phaseProgress?.directory_analysis
		
		if (dirCompleted && existingDirProgress) {
			// 恢复现有的目录分析进度
			await this.buildStateTracer.updatePhaseProgress(
				'directory_analysis',
				existingDirProgress.processed,
				existingDirProgress.total,
				existingDirProgress.status as any
			)
			this.logger.info(`[GraphBuilder] - directory_analysis: 恢复 (${existingDirProgress.processed}/${existingDirProgress.total})`)
		} else {
			// 保持 pending 状态
			await this.buildStateTracer.updatePhaseProgress(
				'directory_analysis',
				0,
				0,
				'pending'
			)
			this.logger.info(`[GraphBuilder] - directory_analysis: pending (0/0)`)
		}
		
		// 计算并显示总进度（由 BuildStateTracer.calculateProgress 自动计算）
		const restoredState = this.buildStateTracer.getCurrentState()
		const restoredProgress = restoredState?.progress || 0
		
		this.logger.info(`[GraphBuilder] 进度已恢复: ${restoredProgress.toFixed(1)}%`)
		this.logger.info(`[GraphBuilder] - Root 贡献: ${rootCompleted ? '5%' : '0%'}`)
		this.logger.info(`[GraphBuilder] - File 贡献: ${((successCount / totalFiles) * 85).toFixed(1)}%`)
		this.logger.info(`[GraphBuilder] ========================================`)
	}


	/**
	 * ✅ 安全截断错误消息（防御性编程）
	 */
	private truncateErrorMessage(message: string): string {
		return message.length > LOG_CONFIG.MAX_ERROR_MESSAGE_LENGTH 
			? message.substring(0, LOG_CONFIG.MAX_ERROR_MESSAGE_LENGTH) + '...' 
			: message
	}

	/**
	 * 处理构建错误
	 * ✅ 优化：使用类型判断替代字符串匹配，尊重 PAUSED 状态
	 * 
	 * 设计原则：
	 * - PAUSED 状态优先级高于 ERROR/INTERRUPTED
	 * - 只有用户主动操作才能覆盖 PAUSED 状态
	 * - 使用 AbortedError 类型判断，避免字符串匹配
	 */
	private async handleBuildError(error: unknown): Promise<void> {
		const errorMessage = error instanceof Error ? error.message : "构建失败"
		const truncatedErrorMsg = this.truncateErrorMessage(errorMessage)
		this.logger.error(`[GraphBuilder] 构建错误: ${truncatedErrorMsg}`)
		
		// ✅ 使用类型判断替代字符串匹配（更可靠）
		if (error instanceof AbortedError) {
			this.logger.info(`[GraphBuilder] 构建被用户中止，保持当前状态`)
			// 不更新状态，因为用户已经暂停了
			return
		}
		
		// ✅ 调用者负责判断：当前状态是否受保护
		if (this.buildStateTracer.isStatusProtected()) {
			this.logger.info(`[GraphBuilder] 当前状态受保护（PAUSED），只记录错误，不改变状态`)
			// 只更新 error 字段，不传 status
			await this.buildStateTracer.updateBuildState({ error: truncatedErrorMsg })
			return
		}
		
		// ✅ 判断是否是中断（清空导致）
		const isInterrupted = errorMessage.includes("was cleared") || 
		                      errorMessage.includes("已清空") ||
		                      errorMessage.includes("interrupted")
		
		// 正常处理：更新为 ERROR 或 INTERRUPTED
		await this.buildStateTracer.updateBuildState({
			status: isInterrupted ? KNOWLEDGE_GRAPH_STATUS.INTERRUPTED : KNOWLEDGE_GRAPH_STATUS.ERROR,
			error: truncatedErrorMsg
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
