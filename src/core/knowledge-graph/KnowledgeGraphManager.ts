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
import { DEFAULT_CONFIG } from "./constants"
import { API_PROVIDER } from "@roo-code/types"
import { ILogger } from "../../utils/logger"
import { FileService } from "./core/FileService"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { FileFilter } from "./tools/FileUtils"
import { GraphBuilder } from "./core/GraphBuilder"
import { GraphRetriever } from "./core/GraphRetriever"
import { BuildStateTracer } from "./core/BuildStateTracer"
import { StorageFactory } from "./storage/StorageFactory"
import { ErrorHandler } from "./errors/ErrorHandler"
import { ProgressTracer } from "./tools/ProgressTracer"
import { isKnowledgeGraphSupported, getKnowledgeGraphEnabledState } from "./utils"

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

		// 显示错误提示
		vscode.window.showErrorMessage(`知识图谱功能激活失败: ${errorMessage}`)
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
	private graphBuilder: GraphBuilder | undefined
	private stateTracer: BuildStateTracer | undefined
	private graphRetriever: GraphRetriever | undefined
	private exporter: Exporter | undefined

	// 配置缓存
	private config: KnowledgeGraphConfig = { ...DEFAULT_CONFIG }

	/**
	 * 私有构造函数确保单例模式
	 */
	private constructor() {}

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
	private async loadUserConfig(): Promise<void> {
		const provider = this.clineProvider
		if (!provider) return
		
		const state = await provider.getState()
		if (!state.knowledgeGraphConfig) {
			return
		}

		const userConfig = state.knowledgeGraphConfig

		// 类型安全的配置映射
		type UserConfigKey = keyof typeof userConfig
		type InternalConfigKey = keyof KnowledgeGraphConfig
		
		const configMapping: Record<string, InternalConfigKey> = {
			knowledgeGraphModel: "model",
			knowledgeGraphMaxConcurrency: "maxConcurrency",
			knowledgeGraphBatchSize: "batchSize",
			knowledgeGraphMaxFiles: "maxFiles",
			knowledgeGraphFileSizeLimit: "fileSizeLimit",
		}

		// 安全地映射配置
		this.config = { ...DEFAULT_CONFIG }
		for (const [userKey, internalKey] of Object.entries(configMapping)) {
			const userValue = userConfig[userKey as UserConfigKey]
			if (userValue !== undefined) {
				// 类型安全的赋值
				(this.config[internalKey] as typeof userValue) = userValue
			}
		}

		this.logger?.info(`[KnowledgeGraphManager] 已加载用户配置: ${JSON.stringify(this.config)}`)
	}

	/**
	 * 初始化核心组件 - 重构版本，模块化组件创建
	 */
	private async initializeComponents(workspacePath: string): Promise<void> {
		try {
			// 1. 创建基础服务
			const { storage, fileService, llmClient, progressTracer } = await this.createBaseServices(workspacePath)

			// 2. 创建分析器
			const { rootAnalyzer, fileSummarizer, directorySummarizer } = this.createAnalyzers(llmClient, storage)

			// 3. 创建状态跟踪器
			const stateTracer = await this.createStateTracer(storage)

			// 4. 创建图构建器
			this.graphBuilder = this.createGraphBuilder(stateTracer, {
				rootAnalyzer,
				fileSummarizer,
				directorySummarizer,
				fileService,
			})

			// 5. 创建检索和导出器
			this.graphRetriever = new GraphRetriever(this.logger!, rootAnalyzer,fileSummarizer, directorySummarizer)
			this.exporter = new Exporter(rootAnalyzer, fileSummarizer, directorySummarizer, this.logger!)

			// 6. 设置统一的暂停检查器
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
		)
		const fileService = new FileService(fileFilter, this.logger!)
		const storage = StorageFactory.createStorage({
			type: this.config.storageType,
			path: StorageFactory.getWorkspaceStoragePath(workspacePath),
		})
		const llmClient = new LLMClient(this.config.model, progressTracer, undefined, this.logger!)

		return { storage, fileService, llmClient, progressTracer }
	}

	/**
	 * 创建分析器
	 */
	private createAnalyzers(llmClient: LLMClient, storage: any) {
		const rootAnalyzer = new RootAnalyzer(llmClient, storage, this.config, this.logger!)
		const fileSummarizer = new FileSummarizer(llmClient, storage, this.config, this.logger!)
		const directorySummarizer = new DirectorySummarizer(
			llmClient,
			fileSummarizer,
			storage,
			this.config,
			this.logger!,
		)

		return { rootAnalyzer, fileSummarizer, directorySummarizer }
	}

	/**
	 * 创建状态跟踪器
	 */
	private async createStateTracer(storage: any): Promise<BuildStateTracer> {
		const stateTracer = new BuildStateTracer(storage, this.logger!)
		await stateTracer.init()
		this.stateTracer = stateTracer
		return stateTracer
	}

	/**
	 * 创建图构建器
	 */
	private createGraphBuilder(stateTracer: BuildStateTracer, components: any): GraphBuilder {
		return new GraphBuilder(this.config, {
			rootAnalyzer: components.rootAnalyzer,
			fileAnalyzer: components.fileSummarizer,
			directoryAnalyzer: components.directorySummarizer,
			fileService: components.fileService,
			buildStateKeeper: stateTracer,
			logger: this.logger!,
		})
	}

	/**
	 * 设置统一的暂停检查器
	 */
	private setupPauseCheckers(stateTracer: BuildStateTracer, components: any): void {
		const pauseChecker = () => stateTracer.isPaused() ?? false
		
		components.rootAnalyzer.setPauseChecker(pauseChecker)
		components.fileSummarizer.setPauseChecker(pauseChecker)
		components.directorySummarizer.setPauseChecker(pauseChecker)
		components.fileService.setPauseChecker(pauseChecker)
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
	 * 停止服务
	 */
	private async stopService(): Promise<void> {
		// 清理所有组件
		this.cleanupComponents()

		this.isInitialized = false
	}

	/**
	 * 销毁管理器
	 */
	public async dispose(): Promise<void> {
		// 暂停构建
		const workspacePath = this.getWorkspacePath()
		if (workspacePath && this.graphBuilder) {
			await this.graphBuilder.pause(workspacePath)
		}

		await this.stopService()
	}

	/**
	 * 清理组件 - 异步版本，确保资源正确释放
	 */
	private async cleanupComponents(): Promise<void> {
		try {
			// 清理存储资源
			if (this.stateTracer) {
				// BuildStateTracer 可能需要清理资源
				this.stateTracer = undefined
			}

			// 清理其他组件
			this.graphBuilder = undefined
			this.graphRetriever = undefined
			this.exporter = undefined

			// 重置配置为默认值
			this.config = { ...DEFAULT_CONFIG }

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
	 * 获取构建状态
	 */
	public getBuildStatus(): KnowledgeGraphBuildState | undefined {
		return this.stateTracer?.getCurrentState()
	}

	/**
	 * 构建知识图谱
	 */
	public async startBuild(options: Partial<BuildOptions> = {}): Promise<void> {
		if (!this.graphBuilder) {
			throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "开始构建")
		}
		return await this.graphBuilder.start(this.getWorkspacePath()!, options)
	}

	/**
	 * 暂停构建 - 修复暂停逻辑
	 */
	public async pauseBuild(): Promise<void> {
		if (!this.graphBuilder) {
			throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "暂停构建")
		}
		return await this.graphBuilder.pause(this.getWorkspacePath()!)
	}

	/**
	 * 继续构建 - 修复恢复逻辑
	 */
	public async resumeBuild(): Promise<void> {
		if (!this.graphBuilder) {
			throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "继续构建")
		}
		return await this.graphBuilder.resume(this.getWorkspacePath()!)
	}

	/**
	 * 清除知识图谱 - 修复清除逻辑
	 */
	public async clearKnowledgeGraph(): Promise<void> {
		if (!this.graphBuilder) {
			throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "清除知识图谱")
		}
		return await this.graphBuilder.clear(this.getWorkspacePath()!)
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

				// 先更新配置，确保 initialize 中的检查能通过（虽然这里用了 forceInit=true，但保持一致性更好）
				await this.clineProvider.setValue("knowledgeGraphEnabled", true)

				// 强制初始化
				await this.initialize(true)
			} else {
				// 禁用知识图谱
				this.logger?.info("[KnowledgeGraphManager] 停止知识图谱服务")

				// 先停止服务
				await this.dispose()

				// 更新配置
				await this.clineProvider.setValue("knowledgeGraphEnabled", false)
			}

			this.logger?.info(`[KnowledgeGraphManager] 知识图谱状态设置成功: ${isEnabled}`)
		} catch (error) {
			// 发生错误时，如果是启用失败，回滚配置
			if (isEnabled) {
				await this.clineProvider.setValue("knowledgeGraphEnabled", false)
				// 确保清理
				await this.dispose()
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
