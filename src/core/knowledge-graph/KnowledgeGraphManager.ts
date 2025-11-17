/**
 * 知识图谱管理器
 * 重构版本：集成智能重试、增量更新、进度跟踪等增强功能
 * 基于现有组件，最小侵入性修改
 */

import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"
import { LLMClient } from "./llm/LLMClient"
import { RootAnalyzer } from "./builder/RootAnalyzer"
import { FileAnalyzer } from "./builder/FileAnalyzer"
import { DirectoryAnalyzer } from "./builder/DirectoryAnalyzer"
import { Exporter } from "./export/Exporter"
import { KnowledgeGraphConfig, KnowledgeGraphBuildState, ExportFormat, ExportResult, BuildOptions, RootInfo } from "./types"
import { DEFAULT_CONFIG } from "./constants"
import { ILogger } from "../../utils/logger"
import { FileService } from "./tools/FileService"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { FileFilter } from "./tools/FileUtils"
import { GraphBuilder } from "./builder/GraphBuilder"
import { GraphRetriever } from "./builder/GraphRetriever"
import { BuildStateKeeper } from "./builder/BuildStateKeeper"
import { StorageFactory } from "./storage/StorageFactory"

/**
 * 激活知识图谱功能
 */
export async function activateKnowledgeGraph(
	context: vscode.ExtensionContext,
	clineProvider: ClineProvider,
): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	logger.info("[KnowledgeGraphExtension] 激活知识图谱功能")

	try {
		// 初始化知识图谱
		const logger = createLogger(Package.outputChannel)
		// 设置日志和提供者
		knowledgeGraphManager.setLogger(logger)
		knowledgeGraphManager.setProvider(clineProvider)

		// 初始化知识图谱管理器
		await knowledgeGraphManager.initialize()

		logger.info("[KnowledgeGraphExtension] 知识图谱功能激活完成")
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "激活知识图谱功能失败"
		logger.error(`[KnowledgeGraphExtension] ${errorMessage}`)

		// 显示错误提示
		vscode.window.showErrorMessage(`知识图谱功能激活失败: ${errorMessage}`)
	}
}

/**
 * 停用知识图谱功能
 */
export async function deactivateKnowledgeGraph(): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	logger.info("[KnowledgeGraphExtension] 停用知识图谱功能")
	try {
		await knowledgeGraphManager.dispose()
		logger.info("[KnowledgeGraphExtension] 知识图谱功能停用完成")
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "停用知识图谱功能失败"
		logger.error(`[KnowledgeGraphExtension] ${errorMessage}`)
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
	private graphRetriever: GraphRetriever | undefined;

	// 配置缓存
	private config: KnowledgeGraphConfig | undefined = { ...DEFAULT_CONFIG }

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
			this.logger?.info("知识图谱服务已经初始化，跳过")
			return
		}
		const workspacePath = this.getWorkspacePath()
		if (!workspacePath) {
			throw new Error("workspace path is empty, initialize knowledge-graph failed.")
		}

		try {
			
			this.logger?.info("开始初始化知识图谱服务")

			// 检查是否启用了知识图谱功能
			if (!(await this.isKnowledgeGraphEnabled())) {
				this.logger?.info("知识图谱功能未启用")
				return
			}
			const fileService = new FileService(new FileFilter())
			const storage = StorageFactory.createStorage({type: this.config!.storageType, 
				path: StorageFactory.getWorkspaceStoragePath(workspacePath) })

			const llmClient = new LLMClient(this.config!.model)
				// 初始化分析器
			const rootAnalyzer = new RootAnalyzer(llmClient, storage, this.config!, this.logger!)
			const fileAnalyzer = new FileAnalyzer(llmClient, storage, this.config!, this.logger!)
			const directoryAnalyzer = new DirectoryAnalyzer(
				llmClient,
				fileAnalyzer,
				storage,
				this.config!,
				this.logger!
			)
			const stateKeeper = new BuildStateKeeper(storage, this.logger!)

			this.graphBuilder = new GraphBuilder(this.config!, {
					rootAnalyzer: rootAnalyzer,
					fileAnalyzer: fileAnalyzer,
					directoryAnalyzer: directoryAnalyzer,
					fileService: fileService,
					buildStateKeeper: stateKeeper,
					logger: this.logger!,
			})

			// 初始化搜索引擎和导出器
			this.graphRetriever = new GraphRetriever(this.logger!, storage, new Exporter(storage, this.logger!))

			rootAnalyzer.setPauseChecker(() => this.graphBuilder!.getState().isPaused)
			fileAnalyzer.setPauseChecker(() => this.graphBuilder!.getState().isPaused)
			directoryAnalyzer.setPauseChecker(() => this.graphBuilder!.getState().isPaused)

			this.isInitialized = true
			this.logger?.info("知识图谱服务初始化成功", "info", "initialize")

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "初始化知识图谱服务时发生未知错误"
			this.logger?.info(errorMessage, "error", "initialize")
			throw new Error(errorMessage)
		}
	}


	/**
	 * 检查知识图谱是否启用
	 */
	private async isKnowledgeGraphEnabled(): Promise<boolean> {
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
			return state.knowledgeGraphEnabled === true
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
		this.logger?.info("停止知识图谱服务", "info", "stop")

		// 清理所有组件
		this.cleanupComponents()

		this.isInitialized = false
	}

	
	/**
	 * 销毁管理器
	 */
	public async dispose(): Promise<void> {
		// 暂停构建
		await this.graphBuilder?.pause()

		await this.stopService()
	}

	/**
	 * 清理组件
	 */
	private cleanupComponents(): void {
	    this.clineProvider = undefined
	    this.graphBuilder= undefined
	    this.graphRetriever= undefined
	    this.config = undefined
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
	public getBuildStatus(): KnowledgeGraphBuildState {
		return this.graphBuilder!.getState()
	}

	
		/**
	 * 构建知识图谱
	 */
	public async startBuild(options: Partial<BuildOptions> = {}): Promise<void> {
		return await this.graphBuilder!.start(options)
	}

	/**
	 * 暂停构建 - 修复暂停逻辑
	 */
	public async pauseBuild(): Promise<void> {
		return await this.graphBuilder!.pause()
	}

	/**
	 * 继续构建 - 修复恢复逻辑
	 */
	public async resumeBuild(): Promise<void> {
		return await this.graphBuilder!.resume()
	}

	/**
	 * 清除知识图谱 - 修复清除逻辑
	 */
	public async clearKnowledgeGraph(): Promise<void> {
		return await this.graphBuilder!.clear()
	}

		/**
	 * 搜索知识图谱
	 */
	public async search(query: string): Promise<any[]> {
		return await this.graphRetriever!.search(query)
	}

	/**
	 * 导出知识图谱
	 */
	public async export(format: ExportFormat, outputPath: string): Promise<ExportResult> {

		return await this.graphRetriever!.export({ format, outputPath })
	}

	public async  getRootInfo(): Promise<RootInfo|null> {
    	return this.graphRetriever!.getRootInfo()
  }
}

/**
 * 知识图谱管理器单例实例
 */
export const knowledgeGraphManager = KnowledgeGraphManager.getInstance()
