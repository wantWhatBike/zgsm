/**
 * 知识图谱管理器
 * 重构版本：集成智能重试、增量更新、进度跟踪等增强功能
 * 基于现有组件，最小侵入性修改
 */

import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"
import { LLMClient } from "./llm/LLMClient"
import { RootAnalyzer } from "./core/RootAnalyzer"
import { FileSummarizer } from "./core/FileSummarizer"
import { DirectorySummarizer } from "./core/DirectorySummarizer"
import { Exporter } from "./core/Exporter"
import { KnowledgeGraphConfig, KnowledgeGraphBuildState, ExportFormat, ExportResult, BuildOptions, RootInfo, SearchQuery } from "./types"
import { DEFAULT_CONFIG } from "./constants"
import { ILogger } from "../../utils/logger"
import { FileService } from "./tools/FileService"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { FileFilter } from "./tools/FileUtils"
import { GraphBuilder } from "./core/GraphBuilder"
import { GraphRetriever } from "./core/GraphRetriever"
import { BuildStateTracer } from "./core/BuildStateTracer"
import { StorageFactory } from "./storage/StorageFactory"
import { ErrorHandler } from "./errors/ErrorHandler"
import { ProgressTracer } from "./tools/ProgressTracer"

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
	private logger: ILogger | undefined;
	private clineProvider: ClineProvider | undefined;
	private isInitialized: boolean = false
	private graphBuilder: GraphBuilder | undefined;
	private stateTracer: BuildStateTracer | undefined;
	private graphRetriever: GraphRetriever | undefined;
	private exporter: Exporter | undefined;
	
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
	 * 初始化知识图谱服务
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			this.logger?.info("[KnowledgeGraphManager] 知识图谱服务已经初始化，跳过")
			return
		}
		const workspacePath = this.getWorkspacePath()
		if (!workspacePath) {
			throw ErrorHandler.wrapError(new Error("workspace path is empty"), "初始化知识图谱服务")
		}

		try {
			
			// 检查是否启用了知识图谱功能
			if (!(await this.isKnowledgeGraphEnabled())) {
				this.logger?.info("[KnowledgeGraphManager] 知识图谱功能未启用")
				return
			}

			// 使用优化后的组件初始化服务，统一传入logger和ProgressTracer
			const progressTracer = new ProgressTracer()
			const fileFilter = new FileFilter(undefined, undefined, undefined, undefined, this.logger!)
			const fileService = new FileService(fileFilter, this.logger!)
			const storage = StorageFactory.createStorage({
				type: this.config.storageType,
				path: StorageFactory.getWorkspaceStoragePath(workspacePath)
			})

			const llmClient = new LLMClient(this.config.model,progressTracer, undefined,  this.logger!)
			
			// 初始化分析器
			const rootAnalyzer = new RootAnalyzer(llmClient, storage, this.config, this.logger!)
			const fileAnalyzer = new FileSummarizer(llmClient, storage, this.config, this.logger!)
			const directoryAnalyzer = new DirectorySummarizer(
				llmClient,
				fileAnalyzer,
				storage,
				this.config,
				this.logger!
			)
			const stateTracer = new BuildStateTracer(storage, this.logger!)
			await stateTracer.init()
			this.stateTracer = stateTracer

			this.graphBuilder = new GraphBuilder(this.config, {
				rootAnalyzer: rootAnalyzer,
				fileAnalyzer: fileAnalyzer,
				directoryAnalyzer: directoryAnalyzer,
				fileService: fileService,
				buildStateKeeper: stateTracer,
				logger: this.logger!,
			})

			// 初始化搜索引擎和导出器
			this.graphRetriever = new GraphRetriever(this.logger!, rootAnalyzer)
			this.exporter = new Exporter(rootAnalyzer, fileAnalyzer, directoryAnalyzer, this.logger!)

			// 设置暂停检查器
			const pauseChecker = () => stateTracer.isPaused() ?? false
			rootAnalyzer.setPauseChecker(pauseChecker)
			fileAnalyzer.setPauseChecker(pauseChecker)
			directoryAnalyzer.setPauseChecker(pauseChecker)
			this.isInitialized = true

		} catch (error) {
			const wrappedError = ErrorHandler.wrapError(error, "初始化知识图谱服务")
			this.logger?.error(`[GraphBuilder] initialize knowledgegraph service failed: ${ErrorHandler.formatError(wrappedError)}`)
			throw wrappedError
		}
	}


	/**
	 * 检查知识图谱是否启用
	 */
	public async isKnowledgeGraphEnabled(): Promise<boolean|undefined> {
		if (!this.clineProvider) {
			return false
		}
		try {
			const state = await this.clineProvider.getState()
			// 检查API提供者是否为zgsm
			if (state.apiConfiguration?.apiProvider !== "zgsm") {
				return false
			}
			// 检查全局设置中是否启用了知识图谱
			return this.stateTracer?.isKnowledgeGraphEnabled()
		} catch {
			return false
		}
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
	 * 清理组件
	 */
	private cleanupComponents(): void {
	    this.clineProvider = undefined
	    this.graphBuilder = undefined
	    this.graphRetriever = undefined
		this.exporter = undefined
	    // 重置配置为默认值而不是 undefined
	    this.config = { ...DEFAULT_CONFIG }
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
	public getBuildStatus(): KnowledgeGraphBuildState|undefined {
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
		* 启用/禁用知识图谱
		*/
	public async enableKnowledgeGraph(enabled: boolean): Promise<void> {
		if (!this.graphBuilder) {
			throw ErrorHandler.wrapError(new Error("GraphBuilder not initialized"), "启用/禁用知识图谱")
		}
		return await this.stateTracer?.enableKnowledgeGraph(enabled)
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
		return await this.exporter.export(workspacePath, {format, outputPath })
	}

	public async getRootInfo(): Promise<RootInfo|undefined> {
		if (!this.graphRetriever) {
			return undefined
		}
		return this.graphRetriever.getRootInfo()
	}
}

/**
 * 知识图谱管理器单例实例
 */
export const knowledgeGraphManager = KnowledgeGraphManager.getInstance()
