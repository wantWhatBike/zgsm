import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"
import { LLMClient } from "./llm/LLMClient"
import { RootAnalyzer } from "./core/RootAnalyzer"
import { FileSummarizer } from "./core/FileSummarizer"
import { DirectorySummarizer } from "./core/DirectorySummarizer"
import { Exporter } from "./core/Exporter"
import {
	KnowledgeGraphConfig,
	KnowledgeGraphBuildState,
	ExportFormat,
	ExportResult,
	BuildOptions,
	RootInfo,
	SearchQuery,
} from "./types"
import { DEFAULT_CONFIG, DEFAULT_BUILD_STATE } from "./constants"
import { API_PROVIDER, KNOWLEDGE_GRAPH_STATUS } from "@roo-code/types"
import { ILogger } from "../../utils/logger"
import { FileService } from "./core/FileService"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { FileFilter } from "./tools/FileUtils"
import { GraphBuilder } from "./core/GraphBuilder"
import { GraphRetriever } from "./core/GraphRetriever"
import { BuildStateTracer } from "./core/BuildStateTracer"
import { StorageFactory } from "./storage/StorageFactory"
import { IStorage } from "./storage/IStorage"
import { ErrorHandler } from "./errors/ErrorHandler"
import { ProgressTracer } from "./tools/ProgressTracer"
import { isKnowledgeGraphSupported, getKnowledgeGraphEnabledState } from "./utils"
import { Mutex } from "./utils/Mutex"
import { AutoRebuildScheduler } from "./AutoRebuildScheduler"

/**
 * 激活知识图谱功能
 */
export async function activateKnowledgeGraph(
	context: vscode.ExtensionContext,
	clineProvider: ClineProvider,
): Promise<void> {
	const logger = createLogger(Package.outputChannel)

	try {
		// 设置日志和提供者
		knowledgeGraphManager.setLogger(logger)
		knowledgeGraphManager.setProvider(clineProvider)

		// 初始化知识图谱管理器
		await knowledgeGraphManager.initialize()
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "激活知识图谱功能失败"
		logger.error(`[KnowledgeGraphManager] 激活失败: ${errorMessage}`)
		// 不再弹出错误提示给用户，只记录日志
	}
}

/**
 * 停用知识图谱功能
 */
export async function deactivateKnowledgeGraph(): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	logger.info("[KnowledgeGraphManager] 停用知识图谱功能")
	try {
		await knowledgeGraphManager.dispose()
		logger.info("[KnowledgeGraphManager] 知识图谱功能停用完成")
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "停用知识图谱功能失败"
		logger.error(`[KnowledgeGraphManager] 停用失败: ${errorMessage}`)
	}
}

/**
 * 知识图谱管理器实现类（单例模式）
 * 增强版本：集成智能重试、增量更新、进度跟踪等功能
 */
export class KnowledgeGraphManager {
	public static instance: KnowledgeGraphManager
	private logger: ILogger | undefined
	private clineProvider: ClineProvider | undefined
	private isInitialized: boolean = false
	private isEnabled: boolean = false  // 新增：区分"已初始化"和"已启用"
	private graphBuilder: GraphBuilder | undefined
	private stateTracer: BuildStateTracer | undefined
	private graphRetriever: GraphRetriever | undefined
	private exporter: Exporter | undefined

	// 存储实例
	private fileStorage?: IStorage      // 用于根信息和状态
	private sqliteStorage?: IStorage    // 用于文件摘要和目录摘要

	// ✅ LLM 客户端实例（用于设置暂停检查器）
	private llmClient?: LLMClient

	// ✅ 全局操作互斥锁：确保同一时间只有一个操作在执行
	private operationMutex = new Mutex()
	private currentOperationType: "build" | "pause" | "resume" | "clear" | "auto-build" | null = null

	// 配置缓存
	private config: KnowledgeGraphConfig = { ...DEFAULT_CONFIG }

	// 自动构建调度器
	private autoRebuildScheduler?: AutoRebuildScheduler

	/**
	 * 私有构造函数确保单例模式
	 */
	private constructor() {
		// ✅ AutoRebuildScheduler 延迟初始化（在 setLogger 之后）
	}

	/**
	 * 获取单例实例
	 */
	public static getInstance(): KnowledgeGraphManager {
		if (!KnowledgeGraphManager.instance) {
			KnowledgeGraphManager.instance = new KnowledgeGraphManager()
		}
		return KnowledgeGraphManager.instance
	}

	/**
	 * 设置日志提供者
	 */
	public setLogger(logger: ILogger): void {
		this.logger = logger
	}

	/**
	 * 设置提供者
	 */
	public setProvider(clineProvider: ClineProvider): void {
		this.clineProvider = clineProvider
	}

	/**
	 * 初始化知识图谱服务 - 重构版本，简化逻辑
	 * @param forceInit 强制初始化，跳过状态检查
	 */
	public async initialize(forceInit: boolean = false): Promise<void> {
		if (this.isInitialized && !forceInit) {
			this.logger?.info("[KnowledgeGraphManager] 知识图谱服务已经初始化，跳过")
			return
		}

		try {
			// 1. 验证前置条件
			this.validatePrerequisites()

			// 2. 检查启用状态（非强制模式）
			if (!forceInit && !(await this.isKnowledgeGraphEnabled())) {
				this.logger?.info("[KnowledgeGraphManager] 知识图谱功能未启用")
				return
			}

			// 3. 加载配置
			await this.loadUserConfig()

			// 4. 初始化组件
			const workspacePath = this.getWorkspacePath()!
			await this.initializeComponents(workspacePath)

			// 5. 修复构建状态
			await this.repairBuildStateIfNeeded()

			this.isInitialized = true
			this.isEnabled = true  // 新增：初始化完成即为启用状态
			
			// 6. ✅ 如果自动构建已启用，启动定时器
			if (this.config.autoRebuildEnabled) {
				this.autoRebuildScheduler?.start(this.config.autoRebuildIntervalMinutes || 5)
			}
			
			this.logger?.info("[KnowledgeGraphManager] 知识图谱服务初始化完成")
		} catch (error) {
			await this.handleInitializationError(error)
			throw error
		}
	}

	/**
	 * 验证初始化前置条件
	 */
	private validatePrerequisites(): void {
		if (!this.clineProvider) {
			throw ErrorHandler.wrapError(new Error("ClineProvider not set"), "验证前置条件")
		}

		const workspacePath = this.getWorkspacePath()
		if (!workspacePath) {
			this.logger?.warn("[KnowledgeGraphManager] workspace path is empty, skipping initialization")
			throw ErrorHandler.wrapError(new Error("Workspace path is empty"), "验证前置条件")
		}
	}

	/**
	 * 修复构建状态（如果需要）
	 */
	private async repairBuildStateIfNeeded(): Promise<void> {
		if (this.graphBuilder) {
			try {
				await this.graphBuilder.repairBuildState()
			} catch (error) {
				this.logger?.warn(`[KnowledgeGraphManager] 构建状态修复失败: ${ErrorHandler.formatError(error)}`)
				// 状态修复失败不应该阻止初始化
			}
		}
	}

	/**
	 * 处理初始化错误
	 */
	private async handleInitializationError(error: any): Promise<void> {
		const wrappedError = ErrorHandler.wrapError(error, "初始化知识图谱服务")
		this.logger?.error(`[KnowledgeGraphManager] 初始化失败: ${ErrorHandler.formatError(wrappedError)}`)

		// 重置状态并清理组件
		this.isInitialized = false
		await this.cleanupComponents()
	}

	/**
	 * 加载用户配置 - 简化版本，使用配置映射表
	 * 修复 #8: 使用类型安全的方式处理配置映射
	 */
	/**
	 * 从 GlobalState 加载配置（单一数据源）
	 * 配置存储在 GlobalState["knowledgeGraphConfig"] 中
	 * 
	 * ⚠️ 重要：使用 Object.assign 更新配置，保持对象引用不变
	 */
	private async loadUserConfig(): Promise<void> {
		const provider = this.clineProvider
		if (!provider) return

		// ✅ 从单一的 GlobalState key 读取配置
		const savedConfig = provider.contextProxy?.getValue("knowledgeGraphConfig" as any) as Partial<KnowledgeGraphConfig> | undefined

		// ✅ 修复：使用 Object.assign 合并配置，保持对象引用
		// 先清空当前配置，再填充默认值，最后应用用户配置
		Object.keys(this.config).forEach(key => delete (this.config as any)[key])
		Object.assign(this.config, DEFAULT_CONFIG, savedConfig || {})

		this.logger?.info(`[KnowledgeGraphManager] ========== 用户配置已加载 ==========`)
		this.logger?.info(`[KnowledgeGraphManager] 模型: ${this.config.model}`)
		this.logger?.info(`[KnowledgeGraphManager] 上下文窗口大小: ${this.config.contextWindowSize || 128000}`)
		this.logger?.info(`[KnowledgeGraphManager] 上下文窗口阈值: ${this.config.contextWindowThreshold || 50}%`)
		this.logger?.info(`[KnowledgeGraphManager] LLM超时时间: ${(this.config.llmTimeoutMs || 300000) / 60000}分钟`)
		this.logger?.info(`[KnowledgeGraphManager] LLM重试次数: ${this.config.llmMaxRetries || 5}次`)
		this.logger?.info(`[KnowledgeGraphManager] 最大文件数: ${this.config.maxFiles}`)
		this.logger?.info(`[KnowledgeGraphManager] 文件大小限制: ${this.config.fileSizeLimit} bytes`)
		this.logger?.info(`[KnowledgeGraphManager] 包含测试文件: ${this.config.includeTestFiles ? '是' : '否'}`)
		this.logger?.info(`[KnowledgeGraphManager] 最大可视化文件数: ${this.config.maxVisualizationFiles || 200}`)
		this.logger?.info(`[KnowledgeGraphManager] 自动构建: ${this.config.autoRebuildEnabled ? '启用' : '禁用'}`)
		if (this.config.autoRebuildEnabled) {
			this.logger?.info(`[KnowledgeGraphManager] 自动构建间隔: ${this.config.autoRebuildIntervalMinutes || 5}分钟`)
		}
		this.logger?.info(`[KnowledgeGraphManager] ===================================`)
	}

	/**
	 * 保存配置到 GlobalState（持久化）
	 */
	private async saveConfig(): Promise<void> {
		if (!this.clineProvider?.contextProxy) return
		await this.clineProvider.contextProxy.setValue("knowledgeGraphConfig" as any, this.config)
		this.logger?.debug(`[KnowledgeGraphManager] 配置已保存到 GlobalState`)
	}

	/**
	 * 获取当前配置（供前端调用）
	 */
	public getConfig(): KnowledgeGraphConfig {
		return { ...this.config }
	}

	/**
	 * 初始化核心组件 - 重构版本，模块化组件创建
	 */
	private async initializeComponents(workspacePath: string): Promise<void> {
		try {
			// 1. 创建基础服务（包含两个存储实例）
			const { fileStorage, sqliteStorage, fileService, llmClient, progressTracer } = 
				await this.createBaseServices(workspacePath)

			// 2. 创建分析器（传入两个存储）
			const { rootAnalyzer, fileSummarizer, directorySummarizer } = 
				this.createAnalyzers(llmClient, fileStorage, sqliteStorage)

			// 3. 创建状态跟踪器（使用 JSON 文件存储）
			const stateTracer = await this.createStateTracer(fileStorage)

			// 4. 创建图构建器
			this.graphBuilder = this.createGraphBuilder(stateTracer, {
				rootAnalyzer,
				fileSummarizer,
				directorySummarizer,
				fileService,
			}, progressTracer)
			
			// ✅ 4.1 注入启用状态检查函数
			this.graphBuilder.setIsEnabledCheck(() => this.isEnabled)

			// 5. 创建检索和导出器
			this.graphRetriever = new GraphRetriever(
				this.logger!,
				rootAnalyzer,
				fileSummarizer,
				directorySummarizer,
				workspacePath,
			)
			this.exporter = new Exporter(rootAnalyzer, fileSummarizer, directorySummarizer, this.logger!)

			// 6. ✅ 创建自动构建调度器（和其他组件一样）
			this.autoRebuildScheduler = new AutoRebuildScheduler(
				this.logger!,
				() => this.tryAutoRebuild()
			)

			// 7. 设置统一的暂停检查器
			this.setupPauseCheckers(stateTracer, { rootAnalyzer, fileSummarizer, directorySummarizer, fileService })
		} catch (error) {
			throw ErrorHandler.wrapError(error, "初始化核心组件")
		}
	}

	/**
	 * 创建基础服务
	 */
	private async createBaseServices(workspacePath: string) {
		const progressTracer = new ProgressTracer()
		const fileFilter = new FileFilter(
			undefined,
			undefined,
			this.config.fileSizeLimit,
			this.config.maxFiles,
			this.logger!,
			this.config.includeTestFiles,
		)
		const fileService = new FileService(fileFilter, this.logger!)
		
		// 获取存储路径
		const storagePath = StorageFactory.getWorkspaceStoragePath(workspacePath)
		
		// 创建 JSON 文件存储（用于根信息和状态）
		this.fileStorage = StorageFactory.createStorage({
			type: 'file',
			path: storagePath
		})
		
		// 创建 SQLite 存储（用于文件摘要和目录摘要）
		this.sqliteStorage = StorageFactory.createStorage({
			type: 'database',
			path: storagePath
		})
		
		// 初始化两个存储
		await this.fileStorage.initialize()
		await this.sqliteStorage.initialize()
		
		// ✅ 修复：传入配置对象引用，而不是复制值
		// LLMClient 会持有这个引用，配置更新时自动生效
		const llmClient = new LLMClient(
			this.config.model, 
			progressTracer, 
			undefined, 
			this.logger!,
			this.config  // 直接传入配置对象引用
		)
		
		// ✅ 保存 LLMClient 引用，用于后续设置暂停检查器
		this.llmClient = llmClient

		return { 
			fileStorage: this.fileStorage,
			sqliteStorage: this.sqliteStorage,
			fileService, 
			llmClient, 
			progressTracer 
		}
	}

	/**
	 * 创建分析器
	 */
	private createAnalyzers(llmClient: LLMClient, fileStorage: IStorage, sqliteStorage: IStorage) {
		// RootAnalyzer 使用 JSON 文件存储
		const rootAnalyzer = new RootAnalyzer(llmClient, fileStorage, this.config, this.logger!)
		
		// FileSummarizer 使用 SQLite 存储
		const fileSummarizer = new FileSummarizer(llmClient, sqliteStorage, this.config, this.logger!)
		
		// DirectorySummarizer 使用 SQLite 存储
		const directorySummarizer = new DirectorySummarizer(
			llmClient,
			fileSummarizer,
			sqliteStorage,
			this.config,
			this.logger!,
		)

		return { rootAnalyzer, fileSummarizer, directorySummarizer }
	}

	/**
	 * 创建状态跟踪器
	 */
	private async createStateTracer(fileStorage: IStorage): Promise<BuildStateTracer> {
		const stateTracer = new BuildStateTracer(fileStorage, this.logger!)
		await stateTracer.init()
		this.stateTracer = stateTracer
		return stateTracer
	}

	/**
	 * 创建图构建器
	 */
	private createGraphBuilder(stateTracer: BuildStateTracer, components: any, progressTracer: ProgressTracer): GraphBuilder {
		const graphBuilder = new GraphBuilder(this.config, {
			rootAnalyzer: components.rootAnalyzer,
			fileAnalyzer: components.fileSummarizer,
			directoryAnalyzer: components.directorySummarizer,
			fileService: components.fileService,
			buildStateKeeper: stateTracer,
			logger: this.logger!,
		})
		// 设置共享的性能跟踪器
		graphBuilder.setProgressTracer(progressTracer)
		return graphBuilder
	}

	/**
	 * 设置统一的暂停检查器
	 * ✅ 包括 LLMClient，确保重试过程也能响应暂停
	 */
	private setupPauseCheckers(stateTracer: BuildStateTracer, components: any): void {
		const pauseChecker = () => stateTracer.isPaused() ?? false

		components.rootAnalyzer.setPauseChecker(pauseChecker)
		components.fileSummarizer.setPauseChecker(pauseChecker)
		components.directorySummarizer.setPauseChecker(pauseChecker)
		components.fileService.setPauseChecker(pauseChecker)
		
		// ✅ 给 LLMClient 也设置暂停检查器，确保重试过程能响应暂停
		if (this.llmClient) {
			this.llmClient.setPauseChecker(pauseChecker)
		}
	}

	/**
	 * 检查知识图谱是否启用
	 * 使用共享工具函数，避免重复代码
	 */
	public async isKnowledgeGraphEnabled(): Promise<boolean> {
		if (!this.clineProvider) {
			return false
		}
		return await getKnowledgeGraphEnabledState(this.clineProvider)
	}

	/**
	 * 检查API提供者是否支持知识图谱
	 * 使用共享工具函数，避免重复代码
	 */
	public async isApiProviderSupported(): Promise<boolean> {
		if (!this.clineProvider) {
			return false
		}
		return await isKnowledgeGraphSupported(this.clineProvider)
	}

	/**
	 * 获取工作空间路径
	 */
	private getWorkspacePath(): string | null {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return null
		}
		return workspaceFolders[0].uri.fsPath
	}

	/**
	 * 禁用服务（但不销毁组件）
	 * 与 dispose() 的区别：
	 * - disable(): 停止服务，保留组件实例和存储连接
	 * - dispose(): 完全清理，用于扩展停用
	 */
	/**
	 * ✅ 禁用知识图谱服务（停止定时器）
	 */
	private async disable(): Promise<void> {
		this.logger?.info("[KnowledgeGraphManager] 禁用知识图谱服务（保留实例）")
		
		// 1. ✅ 停止自动构建定时器
		this.autoRebuildScheduler?.stop()
		
		// 2. 暂停正在运行的构建
		const workspacePath = this.getWorkspacePath()
		if (workspacePath && this.graphBuilder) {
			const currentState = this.getBuildStatus()
			if (currentState?.status === "running") {
				try {
					await this.graphBuilder.pause(workspacePath)
					this.logger?.info("[KnowledgeGraphManager] 构建已暂停")
				} catch (error) {
					this.logger?.warn(`[KnowledgeGraphManager] 暂停构建失败: ${error}`)
				}
			}
		}
		
		// 3. 更新启用状态
		this.isEnabled = false
		
		this.logger?.info("[KnowledgeGraphManager] 知识图谱服务已禁用")
	}

	/**
	 * 停止服务
	 */
	private async stopService(): Promise<void> {
		// 清理所有组件
		this.cleanupComponents()

		this.isInitialized = false
	}

	/**
	 * 销毁管理器（完全清理）
	 * 仅在扩展停用时调用，日常禁用请使用 disable()
	 */
	public async dispose(): Promise<void> {
		// ✅ 清理自动构建调度器
		this.autoRebuildScheduler?.dispose()

		// 暂停构建（仅当正在运行时）
		const workspacePath = this.getWorkspacePath()
		if (workspacePath && this.graphBuilder) {
			const currentState = this.getBuildStatus()
			// 只有在运行状态时才需要暂停
			if (currentState?.status === "running") {
				try {
					await this.graphBuilder.pause(workspacePath)
					this.logger?.info("[KnowledgeGraphManager] 构建已暂停")
				} catch (error) {
					// 暂停失败不应该阻止 dispose
					this.logger?.warn(`[KnowledgeGraphManager] 暂停构建失败: ${error}`)
				}
			}
		}

		await this.stopService()
	}

	/**
	 * ✅ 尝试执行自动构建（非阻塞）
	 * 由 AutoRebuildScheduler 调用
	 * @returns 是否成功执行（true: 成功，false: 跳过）
	 */
	private async tryAutoRebuild(): Promise<boolean> {
		// 1. 尝试获取锁（非阻塞）
		if (!this.operationMutex.tryLock()) {
			this.logger?.warn(`[KnowledgeGraphManager] ⚠️ 自动构建跳过：有操作正在执行`)
			return false // 抢锁失败，跳过本次
		}

		try {
			// 2. 检查是否仍然启用
			if (!this.isEnabled) {
				this.logger?.warn(`[KnowledgeGraphManager] ⚠️ 自动构建跳过：知识图谱已禁用`)
				return false
			}

			// 3. 检查配置是否启用
			if (!this.config.autoRebuildEnabled) {
				this.logger?.warn(`[KnowledgeGraphManager] ⚠️ 自动构建跳过：自动构建已关闭`)
				return false
			}

			// 4. 检查构建器是否初始化
			if (!this.graphBuilder) {
				this.logger?.error(`[KnowledgeGraphManager] ❌ 自动构建失败：GraphBuilder 未初始化`)
				return false
			}

			// 5. 检查是否已有构建在运行（避免重复）
			const currentStatus = this.getBuildStatus()
			if (currentStatus?.status === KNOWLEDGE_GRAPH_STATUS.RUNNING) {
				this.logger?.warn(`[KnowledgeGraphManager] ⚠️ 自动构建跳过：构建任务已在运行中`)
				return false
			}

		// ✅ 6. 如果状态是 PAUSED，跳过自动构建（尊重用户主动暂停意图）
			if (currentStatus?.status === KNOWLEDGE_GRAPH_STATUS.PAUSED) {
			this.logger?.warn(`[KnowledgeGraphManager] ⚠️ 自动构建跳过：用户已主动暂停构建`)
			return false
			}

		// ✅ 7. INTERRUPTED 状态不阻止自动构建（系统被动中断，应该自动恢复）
			if (currentStatus?.status === KNOWLEDGE_GRAPH_STATUS.INTERRUPTED) {
				this.logger?.info(`[KnowledgeGraphManager] 📋 检测到中断状态，自动构建将尝试恢复...`)
			}

			// 8. 执行构建
			this.currentOperationType = "auto-build"
			this.logger?.info(`[KnowledgeGraphManager] 🔨 开始执行自动构建...`)

			await this.graphBuilder.start(this.getWorkspacePath()!, { resumeFromPrevious: false })

			this.logger?.info(`[KnowledgeGraphManager] ✅ 自动构建完成`)
			return true
		} catch (error) {
			this.logger?.error(`[KnowledgeGraphManager] ❌ 自动构建失败: ${ErrorHandler.formatError(error)}`)
			return false
		} finally {
			this.currentOperationType = null
			this.operationMutex.unlock()
		}
	}

	/**
	 * 清理组件 - 异步版本，确保资源正确释放
	 */
	private async cleanupComponents(): Promise<void> {
		try {
			// 清理 SQLite 存储资源
			if (this.sqliteStorage) {
				if (typeof this.sqliteStorage.dispose === 'function') {
					try {
						await this.sqliteStorage.dispose()
						this.logger?.debug("[KnowledgeGraphManager] SQLite 存储资源已释放")
					} catch (disposeError) {
						this.logger?.warn(
							`[KnowledgeGraphManager] 释放 SQLite 存储失败: ${ErrorHandler.formatError(disposeError)}`
						)
					}
				}
				this.sqliteStorage = undefined
			}

			// 清理 JSON 文件存储资源
			if (this.fileStorage) {
				if (typeof this.fileStorage.dispose === 'function') {
					try {
						await this.fileStorage.dispose()
						this.logger?.debug("[KnowledgeGraphManager] 文件存储资源已释放")
					} catch (disposeError) {
						this.logger?.warn(
							`[KnowledgeGraphManager] 释放文件存储失败: ${ErrorHandler.formatError(disposeError)}`
						)
					}
				}
				this.fileStorage = undefined
			}

			// 清理其他组件
			this.stateTracer = undefined
			this.graphBuilder = undefined
			this.graphRetriever = undefined
			this.exporter = undefined

			// ✅ 修复：重置配置为默认值，保持对象引用
			Object.keys(this.config).forEach(key => delete (this.config as any)[key])
			Object.assign(this.config, DEFAULT_CONFIG)

			this.logger?.debug("[KnowledgeGraphManager] 组件清理完成")
		} catch (error) {
			this.logger?.warn(`[KnowledgeGraphManager] 组件清理时发生错误: ${ErrorHandler.formatError(error)}`)
		}
	}

	/**
	 * 检查管理器是否已初始化
	 */
	public isManagerInitialized(): boolean {
		return this.isInitialized
	}

	/**
	 * 检查服务是否已启用
	 */
	public isServiceEnabled(): boolean {
		return this.isEnabled
	}

	/**
	 * 获取构建状态
	 */
	public getBuildStatus(): KnowledgeGraphBuildState | undefined {
		// 如果未启用，返回禁用状态
		if (this.isInitialized && !this.isEnabled) {
			return {
				...DEFAULT_BUILD_STATE,
				status: KNOWLEDGE_GRAPH_STATUS.PENDING,
				lastUpdateTime: new Date().toISOString(),
			}
		}
		
		return this.stateTracer?.getCurrentState()
	}

	/**
	 * ✅ 应用配置变更（唯一的定时器管理入口）
	 * 直接应用配置，并持久化到 GlobalState
	 * 
	 * ⚠️ 重要：直接修改 this.config 对象的属性，而不是创建新对象
	 * 这样可以确保所有持有 config 引用的组件（如 FileSummarizer）都能获取到最新配置
	 */
	public async applyConfigChanges(changes: Partial<KnowledgeGraphConfig>): Promise<void> {
		if (!this.isInitialized || !this.isEnabled) {
			return
		}

		// ✅ 校验并应用配置（保持对象引用不变）
		const validatedConfig: Partial<KnowledgeGraphConfig> = {}
		
		// 布尔类型配置（直接应用）
		if (changes.autoRebuildEnabled !== undefined) {
			validatedConfig.autoRebuildEnabled = changes.autoRebuildEnabled
		}
		if (changes.includeTestFiles !== undefined) {
			validatedConfig.includeTestFiles = changes.includeTestFiles
		}
		
		// 数值类型配置（带校验）
		if (changes.autoRebuildIntervalMinutes !== undefined) {
			validatedConfig.autoRebuildIntervalMinutes = Math.max(1, changes.autoRebuildIntervalMinutes)
		}
		if (changes.maxVisualizationFiles !== undefined) {
			validatedConfig.maxVisualizationFiles = Math.max(10, Math.min(500, changes.maxVisualizationFiles))
		}
		if (changes.contextWindowSize !== undefined) {
			validatedConfig.contextWindowSize = Math.max(1000, changes.contextWindowSize)
		}
		if (changes.contextWindowThreshold !== undefined) {
			validatedConfig.contextWindowThreshold = Math.max(10, Math.min(100, changes.contextWindowThreshold))
		}
		if (changes.llmTimeoutMs !== undefined) {
			validatedConfig.llmTimeoutMs = Math.max(60000, changes.llmTimeoutMs)
		}
		if (changes.llmMaxRetries !== undefined) {
			validatedConfig.llmMaxRetries = Math.max(1, Math.min(10, changes.llmMaxRetries))
		}
		
		// 应用校验后的配置
		Object.assign(this.config, validatedConfig)
		
		// ✅ 立即持久化配置
		await this.saveConfig()
		
		// ✅ 根据配置管理定时器（唯一入口）
		if (this.config.autoRebuildEnabled) {
			this.autoRebuildScheduler?.start(this.config.autoRebuildIntervalMinutes || 5)
		} else {
			this.autoRebuildScheduler?.stop()
		}
		
		// ✅ 打印定时器状态和配置变更
		this.logger?.info("[KnowledgeGraphManager] ✓ 配置已应用")
		this.logger?.info(`[KnowledgeGraphManager] 配置变更:`, changes)
		this.printSchedulerStatus()
	}

	/**
	 * 打印调度器状态（调试用）
	 */
	private printSchedulerStatus(): void {
		if (!this.autoRebuildScheduler) {
			this.logger?.info(`[KnowledgeGraphManager] 📊 定时器状态: 未初始化`)
			return
		}
		
		const isActive = this.autoRebuildScheduler.isActive()
		const nextRebuildTime = this.autoRebuildScheduler.getNextScheduledTime()
		
		this.logger?.info(`[KnowledgeGraphManager] 📊 定时器状态: ${isActive ? '运行中' : '未启动'}`)
		
		if (nextRebuildTime) {
			const nextTime = new Date(nextRebuildTime).toLocaleString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			})
			this.logger?.info(`[KnowledgeGraphManager] ⏰ 下次构建时间: ${nextTime}`)
		}
	}

	/**
	 * ✅ 统一的操作入口，确保互斥
	 * 防止多个操作同时执行导致的竞态条件
	 */
	private async executeOperation<T>(
		operationType: "build" | "pause" | "resume" | "clear",
		operation: () => Promise<T>,
	): Promise<T> {
		return this.operationMutex.withLock(async () => {
			// 检查是否有其他操作正在执行
			if (this.currentOperationType) {
				throw ErrorHandler.wrapError(
					new Error(`操作冲突：${this.currentOperationType} 正在执行，无法执行 ${operationType}`),
					"执行操作",
				)
			}

			this.currentOperationType = operationType
			this.logger?.info(`[KnowledgeGraphManager] 开始执行操作: ${operationType}`)

			try {
				const result = await operation()
				this.logger?.info(`[KnowledgeGraphManager] 操作完成: ${operationType}`)
				return result
			} catch (error) {
				this.logger?.error(`[KnowledgeGraphManager] 操作失败: ${operationType}`, error)
				throw error
			} finally {
				this.currentOperationType = null
			}
		})
	}

	/**
	 * ✅ 构建知识图谱（不再管理定时器）
	 * @param options 构建选项
	 */
	public async startBuild(options: Partial<BuildOptions> = {}): Promise<void> {
		return this.executeOperation("build", async () => {
			if (!this.graphBuilder) {
				throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "开始构建")
			}

			// ✅ 委托给 BuildStateTracer 检查
			if (this.stateTracer && !this.stateTracer.canStartBuild()) {
				const currentStatus = this.stateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许启动构建`)
			}

			// ✅ 直接执行构建，定时器会自动处理竞态
			return await this.graphBuilder.start(this.getWorkspacePath()!, options)
		})
	}

	/**
	 * ✅ 暂停构建（不再管理定时器）
	 */
	public async pauseBuild(): Promise<void> {
		return this.executeOperation("pause", async () => {
			if (!this.graphBuilder) {
				throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "暂停构建")
			}

			// ✅ 委托给 BuildStateTracer 检查
			if (this.stateTracer && !this.stateTracer.canPause()) {
				const currentStatus = this.stateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许暂停`)
			}

			// ✅ 直接执行暂停，定时器会自动处理竞态
			return await this.graphBuilder.pause(this.getWorkspacePath()!)
		})
	}

	/**
	 * 继续构建
	 * ✅ 增强版：通过统一入口确保互斥
	 */
	/**
	 * ✅ 继续构建（不再管理定时器）
	 */
	public async resumeBuild(): Promise<void> {
		return this.executeOperation("resume", async () => {
			if (!this.graphBuilder) {
				throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "继续构建")
			}

			// ✅ 委托给 BuildStateTracer 检查
			if (this.stateTracer && !this.stateTracer.canResume()) {
				const currentStatus = this.stateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许继续`)
			}

			// ✅ 直接执行继续，定时器会自动处理竞态
			return await this.graphBuilder.resume(this.getWorkspacePath()!)
		})
	}

	/**
	 * 清除知识图谱
	 * ✅ 增强版：通过统一入口确保互斥
	 */
	/**
	 * ✅ 清除知识图谱（不再管理定时器）
	 */
	public async clearKnowledgeGraph(): Promise<void> {
		return this.executeOperation("clear", async () => {
			if (!this.graphBuilder) {
				throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "清除知识图谱")
			}

			// ✅ 委托给 BuildStateTracer 检查
			if (this.stateTracer && !this.stateTracer.canClear()) {
				const currentStatus = this.stateTracer.getCurrentState()?.status
				throw new Error(`当前状态 ${currentStatus} 不允许清除`)
			}

			// ✅ 直接执行清空，定时器会自动处理竞态
			return await this.graphBuilder.clear(this.getWorkspacePath()!)
		})
	}

	/**
	 * 搜索知识图谱
	 */
	public async search(query: SearchQuery): Promise<any[]> {
		if (!this.graphRetriever) {
			throw ErrorHandler.wrapError(new Error("GraphRetriever not initialized"), "搜索知识图谱")
		}
		return await this.graphRetriever.search(this.getWorkspacePath()!, query)
	}

	/**
	 * 导出知识图谱
	 */
	public async export(format: ExportFormat, outputPath: string): Promise<ExportResult> {
		if (!this.exporter) {
			throw ErrorHandler.wrapError(new Error("Exporter not initialized"), "导出知识图谱")
		}
		const workspacePath = this.getWorkspacePath()
		if (!workspacePath) {
			throw ErrorHandler.wrapError(new Error("Workspace path not available"), "导出知识图谱")
		}
		return await this.exporter.export(workspacePath, { format, outputPath })
	}

	public async getRootInfo(): Promise<RootInfo | undefined> {
		if (!this.graphRetriever) {
			return undefined
		}
		return this.graphRetriever.getRootInfo()
	}

	/**
	 * 获取图谱检索器
	 */
	public getGraphRetriever(): GraphRetriever | undefined {
		return this.graphRetriever
	}

	/**
	 * 获取最大可视化文件数配置
	 */
	public getMaxVisualizationFiles(): number {
		return this.config.maxVisualizationFiles || 200
	}

	/**
	 * 启用/禁用知识图谱 - 从MessageHandler迁移的核心逻辑
	 * 消除脑裂风险，统一管理状态
	 */
	public async setKnowledgeGraphEnabled(isEnabled: boolean): Promise<void> {
		if (!this.clineProvider) {
			throw ErrorHandler.wrapError(new Error("ClineProvider not set"), "设置知识图谱状态")
		}

		// 检查是否在运行状态，如果是则不能禁用
		if (!isEnabled) {
			const buildState = this.getBuildStatus()
			if (buildState && buildState.status === "running") {
				throw ErrorHandler.wrapError(new Error("知识图谱正在运行中，无法禁用"), "设置知识图谱状态")
			}
		}

		try {
			if (isEnabled) {
				// 启用知识图谱
				this.logger?.info("[KnowledgeGraphManager] 启用知识图谱服务")

				// 先更新配置
				await this.clineProvider.setValue("knowledgeGraphEnabled", true)

				// 如果未初始化，进行初始化；否则只更新启用状态
				if (!this.isInitialized) {
					await this.initialize(true)
				} else {
					// 已初始化，只需更新配置和启用状态
					await this.loadUserConfig()
					this.isEnabled = true
					this.logger?.info("[KnowledgeGraphManager] 知识图谱服务已启用（快速恢复）")
				}

				// ✅ 如果启用了自动构建，启动定时器
				if (this.config.autoRebuildEnabled) {
					this.autoRebuildScheduler?.start(this.config.autoRebuildIntervalMinutes || 5)
				}
			} else {
				// 禁用知识图谱
				this.logger?.info("[KnowledgeGraphManager] 禁用知识图谱服务")

				// 调用 disable() 而不是 dispose()
				await this.disable()

				// 更新配置
				await this.clineProvider.setValue("knowledgeGraphEnabled", false)
			}

			this.logger?.info(`[KnowledgeGraphManager] 知识图谱状态设置成功: ${isEnabled}`)
		} catch (error) {
			// 发生错误时，如果是启用失败，回滚配置
			if (isEnabled) {
				await this.clineProvider.setValue("knowledgeGraphEnabled", false)
				this.isEnabled = false
			}

			const errorMessage = error instanceof Error ? error.message : "设置知识图谱状态失败"
			this.logger?.error(`[KnowledgeGraphManager] 状态设置失败: ${errorMessage}`)
			throw ErrorHandler.wrapError(error, "设置知识图谱状态")
		}
	}
}
/**
 * 知识图谱管理器单例实例
 */
export const knowledgeGraphManager = KnowledgeGraphManager.getInstance()
