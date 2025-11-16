/**
 * 知识图谱管理器
 * 重构版本：集成智能重试、增量更新、进度跟踪等增强功能
 * 基于现有组件，最小侵入性修改
 */
import * as os from "os"
import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"
import * as path from "path"
import { LLMClient } from "./llm/LLMClient"
import { RootAnalyzer } from "./analyzers/RootAnalyzer"
import { FileAnalyzer } from "./analyzers/FileAnalyzer"
import { DirectoryAnalyzer } from "./analyzers/DirectoryAnalyzer"
import { DependencyAnalyzer } from "./analyzers/DependencyAnalyzer"
import { SearchEngine } from "./search/SearchEngine"
import { Exporter } from "./export/Exporter"
import { ProgressTracker } from "./tools/ProgressTracker"
import { FileStorage } from "./storage/FileStorage"
import { StorageConfig } from "./storage/StorageInterface"
import {
	KnowledgeGraphConfig,
	KnowledgeGraphBuildStatus,
	BuildProgress,
	ExportFormat,
	ExportResult,
	BuildOptions,
	FileSummary,
} from "./types"
import { DEFAULT_CONFIG } from "./constants"
import { ILogger } from "../../utils/logger"
import { createHash } from "crypto"
import { FileService } from "./tools/FileService"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { FileFilter } from "./tools/FileUtils"

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
		logger.info("[KnowledgeGraphLifecycle] 开始初始化知识图谱功能")
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
	private logger: ILogger | null = null
	private clineProvider: ClineProvider | null = null
	private isInitialized: boolean = false
	private storage: FileStorage | null = null
	private llmClient: LLMClient | null = null
	private rootAnalyzer: RootAnalyzer | null = null
	private fileAnalyzer: FileAnalyzer | null = null
	private directoryAnalyzer: DirectoryAnalyzer | null = null
	private searchEngine: SearchEngine | null = null
	private exporter: Exporter | null = null
	private progressTracker: ProgressTracker | null = null
	private fileService: FileService | null = null

	// 构建状态监控
	private buildStatus: KnowledgeGraphBuildStatus = {
		enabled: false,
		isRunning: false,
		isPaused: false,
		progress: 0,
		totalFiles: 0,
		processedFiles: 0,
		failedFiles: 0,
		currentFile: "",
		phase: "root_analysis",
		status: "idle",
		lastUpdateTime: "",
		totalDuration: 0,
		totalFilesToProcess: 0
	}

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
	 * 内部日志方法
	 */
	private log(message: string, type: "info" | "error" = "info", id: string = ""): void {
		if (this.logger?.[type]) {
			this.logger[type](`[KnowledgeGraphManager] ${id ? `[${id}] ` : ""}${message}`)
		} else {
			const logMessage = `[${new Date().toLocaleString()}] [${type}]${id ? ` [${id}] ` : ""} ${message}`
			console.log(logMessage)
		}
	}

	/**
	 * 初始化知识图谱服务
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			this.log("知识图谱服务已经初始化，跳过", "info", "initialize")
			return
		}

		try {
			this.log("开始初始化知识图谱服务", "info", "initialize")

			// 检查是否启用了知识图谱功能
			if (!(await this.isKnowledgeGraphEnabled())) {
				this.log("知识图谱功能未启用", "info", "initialize")
				return
			}

			// 初始化核心组件
			await this.initializeCoreComponents()

			this.isInitialized = true
			this.log("知识图谱服务初始化成功", "info", "initialize")
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "初始化知识图谱服务时发生未知错误"
			this.log(errorMessage, "error", "initialize")
			throw new Error(errorMessage)
		}
	}

	/**
	 * 初始化核心组件
	 */
	private async initializeCoreComponents(): Promise<void> {
		// 文件
		this.fileService = new FileService(new FileFilter())

		// 初始化存储
		this.storage = this.createStorage()

		// 初始化LLM客户端
		this.llmClient = new LLMClient(this.config.model)

		// 初始化分析器
		this.initializeAnalyzers()

		// 初始化搜索引擎和导出器
		this.searchEngine = new SearchEngine(this.storage)
		this.exporter = new Exporter(this.storage)
		this.progressTracker = new ProgressTracker()
	}

	/**
	 * 创建存储实例
	 */
	private createStorage(): FileStorage {
		const storageConfig: StorageConfig = {
			type: this.config.storageType,
			path: this.getStoragePath(),
		}
		return new FileStorage(storageConfig)
	}

	/**
	 * 初始化分析器
	 */
	private initializeAnalyzers(): void {
		let workspacePath = this.getWorkspacePath()
		if (workspacePath == null) {
			throw new Error("workspace is null")
		}
		this.rootAnalyzer = new RootAnalyzer(this.llmClient!, workspacePath, this.config)
		this.fileAnalyzer = new FileAnalyzer(this.llmClient!,this.storage!, workspacePath, this.config)
		this.directoryAnalyzer = new DirectoryAnalyzer(this.llmClient!,this.fileAnalyzer, workspacePath, this.config)

		// 设置暂停检查器
		if (this.fileAnalyzer) {
			this.fileAnalyzer.setPauseChecker(() => this.buildStatus.isPaused)
		}
		if (this.directoryAnalyzer) {
			this.directoryAnalyzer.setPauseChecker(() => this.buildStatus.isPaused)
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
	 * 获取存储路径
	 */
	private getStoragePath(): string {
		const workspacePath = this.getWorkspacePath() || ""
		const projectName = path.basename(workspacePath)
		const projectHash = createHash("sha256").update(workspacePath).digest("hex").substring(0, 8)

		return path.join(os.homedir(), ".costrict", "cache", "knowledge-graph", `${projectName}-${projectHash}`)
	}

	/**
	 * 构建知识图谱
	 */
	public async buildKnowledgeGraph(options: Partial<BuildOptions> = {}): Promise<void> {
		this.validateBuildPrerequisites()

		try {
			this.log("开始构建知识图谱", "info", "build")

			// 执行构建
			await this.executeBuild(options)

			this.log("知识图谱构建完成", "info", "build")
		} catch (error) {
			await this.handleBuildError(error)
		} finally {
			await this.finalizeBuild()
		}
	}

	/**
	 * 验证构建前提条件
	 */
	private validateBuildPrerequisites(): void {
		if (!this.isInitialized) {
			throw new Error("知识图谱服务未初始化")
		}

		if (this.buildStatus.isRunning) {
			throw new Error("知识图谱构建已在进行中")
		}
	}

	/**
	 * 初始化构建状态
	 */
	private async initializeBuildState(totalFiles: number, totalFilesToProcess: number): Promise<void> {
		if (!this.storage) throw new Error("存储未初始化")

		// 初始化存储文件
		await this.storage.initializeStorage()

		// 获取工作空间文件数量进行统计
		const workspacePath = this.getWorkspacePath()
		if (workspacePath == null) {
			throw new Error("workspace is empty")
		}

		try {
			const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
			const startTime = new Date().toLocaleDateString()

			let taskState: KnowledgeGraphBuildStatus = {
				isRunning: true,
				isPaused: false,
				taskId,
				phase: "root_analysis",
				progress: 0,
				startTime,
				lastUpdateTime: startTime,
				totalRequests: 0,
				totalDuration: 0,
				totalTokens: { input: 0, output: 0 },
				status: "running",
				totalFiles,
				processedFiles: 0,
				failedFiles: 0,
				currentFile: "",
				enabled: true,
				totalFilesToProcess: totalFilesToProcess
			}

			await this.storage.updateBuildStatus(taskState)
			this.log(`[FileStorage] 任务状态初始化完成: ${taskId}, 总文件数: ${totalFiles}`)

			this.log(`初始化新的构建任务: ${taskId}`, "info", "build")

			// 更新内部状态
			this.buildStatus = taskState
		} catch (error) {
			throw new Error(`初始化任务状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}


	/**
	 * 構建
	 */
	private async executeBuild(options: Partial<BuildOptions>): Promise<void> {
		this.log("开始构建知识图谱...")

		const workspacePath = this.getWorkspacePath()
		if (!this.storage) {
			throw new Error("存储未初始化")
		}
		if (workspacePath == null) {
			throw new Error("workspace is null")
		}
		if (!this.fileService) {
			throw new Error("fileService not initialized")
		}
		// TODO 1. 文件列表收集，并作为任务上下文信息进行传递。
		let totalFiles = 0
		let fileList = []
		// 调用文件列表服务获取实际文件数量
		fileList = await this.fileService.getProjectFilteredFiles(workspacePath)
		totalFiles = fileList.length
		this.log(`获取到项目待分析文件数量: ${totalFiles}`, "info", "build")

		// 1. 收集并分析文件变更
		this.log(`开始增量更新分析，当前文件数: ${fileList.length}`, "info", "build")
		const incrementalResult = await this.storage.initializeFileRecords(fileList)

		this.log(
			`文件增量分析结果: 新增${incrementalResult.added.length}, 修改${incrementalResult.modified.length}, 删除${incrementalResult.deleted.length}`,
			"info",
			"build",
		)

		// 根据文件摘要（路径+核心功能关键词(或者核心导出函数)），重新全量生成目录摘要。TODO 增量

		let needDoFileSummary = true
		let needDoDirectorySummary = true

		if (incrementalResult.added.length == 0 && incrementalResult.modified.length == 0) {
			// 无新增、修改，则文件摘要无需变更
			needDoFileSummary = false
			this.log("没有新增、修改文件，不进行文件摘要")
			// 没有删除，则目录也无需变更
			if (incrementalResult.deleted.length == 0) {
				needDoDirectorySummary = false
				this.log("没有新增、修改、删除文件，不进行目录摘要")
			}
		}
		if (!needDoDirectorySummary && !needDoFileSummary) {
			this.log("无需进行文件、目录摘要,退出任务。")
			this.updateProgress("completed", totalFiles, totalFiles, "无需执行文件、目录摘要")
			return
		}

		const totalFilesToProcess = incrementalResult.added.length + incrementalResult.modified.length
		this.buildStatus.totalFilesToProcess = totalFilesToProcess
		// 初始化构建
		this.initializeBuildState(totalFiles, totalFilesToProcess)

		// 2. 根目录分析

		if (!this.rootAnalyzer) {
			throw new Error("根分析器未初始化")
		}

		const rootInfo = await this.rootAnalyzer.analyzeRoot(fileList)
		await this.storage.saveRootInfo(rootInfo)
		await this.updateProgress("root_analysis", 1, totalFilesToProcess, "根目录分析完成")

		// 增量文件摘要
		if (needDoFileSummary) {
			this.log(`开始执行文件摘要: 待处理文件数 ${totalFilesToProcess}`, "info", "build")

			let fileSummaries: FileSummary[] = []

			// 5. 文件分析 - 只处理需要更新的文件
			if (!this.fileAnalyzer) throw new Error("文件分析器未初始化")

			let processedCount = 0

			await this.fileAnalyzer.analyzeFiles(
				rootInfo,
				[...incrementalResult.added, ...incrementalResult.modified],
				workspacePath,
				async (progress: any) => {
					await this.updateProgress("file_analysis", processedCount, totalFilesToProcess, progress.message)
				},
				async (summaries: FileSummary[]) => {
					// 批量保存回调
					try {
						await this.storage!.saveFileSummaries(summaries)
						await this.storage!.incrementProcessedFiles()
						this.buildStatus.processedFiles += summaries.length

						this.log(
							`文件摘要处理进度: (${this.buildStatus.processedFiles}/${totalFilesToProcess})`,
							"info",
							"build",
						)
					} catch (error) {
						await this.storage!.incrementFailedFiles()
						this.log(`保存文件摘要失败: ${summaries.map((s) => s.path)}, ${error}`, "error", "build")
					}
				},
			)

			this.log(`文件分析完成，处理了 ${processedCount} 个文件`, "info", "build")
		}

		// 3. 目录分析 - 检查暂停状态
		if (this.isCurrentlyPaused()) {
			this.log("构建已暂停，停止目录分析", "info", "build")
			return
		}

		// 目录摘要。TODO 增量
		if (needDoDirectorySummary) {
			await this.updateProgress("directory_analysis", totalFiles, totalFiles, "分析目录结构...")
			if (!this.directoryAnalyzer) {
				throw new Error("目录分析器未初始化")
			}
			await this.directoryAnalyzer.analyzeDirectories(
				rootInfo,
				fileList,
				async (progress: any) => {
					await this.updateProgress("directory_analysis", progress.current, progress.total, progress.message)
				},
				async (summary: any) => {
					// 增量保存目录摘要
					try {
						await this.storage!.saveDirectorySummaries(summary)
						this.log(`已保存目录摘要: ${summary.path}`, "info", "build")
					} catch (error) {
						this.log(`保存目录摘要失败: ${summary.path}, ${error}`, "error", "build")
					}
				},
			)
		}
		// 6. 完成构建 - 修复构建完成状态
		await this.updateProgress("completed", totalFiles, totalFiles, "知识图谱构建完成")

		// 更新内部状态
		this.updateBuildStatus({
			isRunning: false,
			isPaused: false,
			progress: 100,
			status: "completed",
			currentFile: "知识图谱构建完成",
		})

		this.log("知识图谱构建完全完成", "info", "build")
	}

	/**
	 * 处理构建错误
	 */
	private async handleBuildError(error: unknown): Promise<void> {
		const errorMessage = error instanceof Error ? error.message : "构建知识图谱时发生未知错误"
		this.log(errorMessage, "error", "build")

		// 修复：正确设置错误状态
		this.updateBuildStatus({
			isRunning: false,
			isPaused: false,
			status: "error",
			error: errorMessage,
		})

		// 保存错误状态到存储
		if (this.storage) {
			try {
				await this.storage.updateBuildStatus({
					status: "error",
					error: errorMessage,
					progress: this.buildStatus.progress, // 保持现有进度
				})
			} catch (saveError) {
				this.log(`保存错误状态失败: ${saveError}`, "error", "handleBuildError")
			}
		}
		throw new Error(errorMessage)
	}

	/**
	 * 完成构建
	 */
	private async finalizeBuild(): Promise<void> {
		this.buildStatus.isRunning = false
		this.buildStatus.isPaused = false

		// 更新最终状态
		this.updateBuildStatus({
			isRunning: false,
			isPaused: false,
			status: this.buildStatus.error ? "error" : "completed",
		})

		// 更新现有状态
		await this.storage?.updateBuildStatus({
			progress: this.buildStatus.progress,
			processedFiles: this.buildStatus.processedFiles,
			failedFiles: this.buildStatus.failedFiles,
			currentFile: this.buildStatus.currentFile,
			status: this.buildStatus.status,
			error: this.buildStatus.error,
		})
	
		this.log("构建状态已保存", "info", "build")
	}

	/**
	 * 更新构建状态
	 */
	private updateBuildStatus(updates: Partial<KnowledgeGraphBuildStatus>): void {
		this.buildStatus = {
			...this.buildStatus,
			...updates,
			lastUpdated: new Date().toISOString(),
		}
	}

	/**
	 * 更新进度
	 */
	private async updateProgress(
		phase: BuildProgress["phase"],
		current: number,
		total: number,
		message: string,
	): Promise<void> {
		const percentage = total > 0 ? Math.round((current / total) * 100) : 0

		const progress: BuildProgress = {
			phase,
			current,
			total,
			message,
			percentage,
		}

		if (this.progressTracker) {
			await this.progressTracker.update(progress)
		}

		// 更新构建状态
		this.updateBuildStatus({
			progress: percentage,
			currentFile: message,
			phase: phase,
		})
	}

	/**
	 * 重启服务
	 */
	public async restartService(): Promise<void> {
		try {
			await this.stopService()
			this.isInitialized = false
			await this.initialize()
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "重启知识图谱服务时发生未知错误"
			this.log(errorMessage, "error", "restart")
			throw new Error(errorMessage)
		}
	}

	/**
	 * 停止服务
	 */
	public async stopService(): Promise<void> {
		this.log("停止知识图谱服务", "info", "stop")

		// 清理所有组件
		this.cleanupComponents()

		this.isInitialized = false
	}

	/**
	 * 清理组件
	 */
	private cleanupComponents(): void {
		this.storage = null
		this.llmClient = null
		this.rootAnalyzer = null
		this.fileAnalyzer = null
		this.directoryAnalyzer = null
		this.searchEngine = null
		this.exporter = null
		this.progressTracker = null
	}

	// 其他公共方法保持不变...

	/**
	 * 获取构建状态
	 */
	public getBuildStatus(): KnowledgeGraphBuildStatus {
		return { ...this.buildStatus }
	}

	/**
	 * 获取构建进度
	 */
	public getBuildProgress(): BuildProgress | null {
		if (!this.progressTracker) return null
		return this.progressTracker.getCurrentProgress()
	}

	/**
	 * 检查管理器是否已初始化
	 */
	public isManagerInitialized(): boolean {
		return this.isInitialized
	}

	/**
	 * 检查是否正在构建
	 */
	public isCurrentlyBuilding(): boolean {
		return this.buildStatus.isRunning
	}

	/**
	 * 检查是否已暂停
	 */
	public isCurrentlyPaused(): boolean {
		return this.buildStatus.isPaused
	}

	/**
	 * 暂停构建 - 修复暂停逻辑
	 */
	public async pauseBuild(): Promise<void> {
		if (!this.buildStatus.isRunning) {
			throw new Error("没有正在进行的构建任务")
		}

		this.buildStatus.isPaused = true
		this.updateBuildStatus({
			isPaused: true,
			isRunning: false,
			status: "paused",
		})

		// 保存暂停状态到存储
		if (this.storage) {
			await this.storage.updateBuildStatus({
				status: "paused",
			})
		}

		this.log("构建已暂停", "info", "pause")
	}

	/**
	 * 继续构建 - 修复恢复逻辑
	 */
	public async resumeBuild(): Promise<void> {
		if (!this.buildStatus.isPaused) {
			throw new Error("构建任务未处于暂停状态")
		}

		this.buildStatus.isPaused = false
		this.updateBuildStatus({
			isPaused: false,
			isRunning: true,
			status: "running",
		})

		this.log("知识图谱构建已恢复", "info", "resume")

		// 恢复构建 - 继续之前未完成的任务
		try {
			await this.buildKnowledgeGraph({ resumeFromPrevious: true })
		} catch (error) {
			await this.handleBuildError(error)
		}
	}

	/**
	 * 清除知识图谱 - 修复清除逻辑
	 */
	public async clearKnowledgeGraph(): Promise<void> {
		if (this.buildStatus.isRunning) {
			throw new Error("构建进行中，无法清除")
		}
		if (this.storage) {
			await this.storage.clear()
		}

		this.log("知识图谱已清除", "info", "clear")
	}

	/**
	 * 获取知识图谱状态
	 */
	public async getKnowledgeGraphStatus(): Promise<{
		exists: boolean
		info: any
		rootInfo: any
		buildState: any
	}> {
		if (!this.storage) {
			return { exists: false, info: null, rootInfo: null, buildState: null }
		}

		try {
			const exists = await this.storage.exists()
			if (!exists) {
				return { exists: false, info: null, rootInfo: null, buildState: null }
			}

			const info = await this.storage.getStorageInfo()
			const rootInfo = await this.storage.getRootInfo()
			const buildState = await this.storage.getBuildStatus()

			return { exists: true, info, rootInfo, buildState }
		} catch (error) {
			this.log(`获取知识图谱状态失败: ${error}`, "error", "status")
			return { exists: false, info: null, rootInfo: null, buildState: null }
		}
	}

	/**
	 * 搜索知识图谱
	 */
	public async searchKnowledgeGraph(query: string): Promise<any[]> {
		if (!this.searchEngine) {
			throw new Error("搜索引擎未初始化")
		}

		return await this.searchEngine.search(query)
	}

	/**
	 * 导出知识图谱
	 */
	public async exportKnowledgeGraph(format: ExportFormat, outputPath: string): Promise<ExportResult> {
		if (!this.exporter) {
			throw new Error("导出器未初始化")
		}

		return await this.exporter.export({ format, outputPath })
	}

	/**
	 * 销毁管理器
	 */
	public async dispose(): Promise<void> {
		await this.stopService()
	}
}

/**
 * 知识图谱管理器单例实例
 */
export const knowledgeGraphManager = KnowledgeGraphManager.getInstance()
