/**
 * 知识图谱构建器 - 协调整个分析器完成知识图谱构建
 * 采用依赖注入方式设计
 */

import { EventEmitter } from "events"
import {
	KnowledgeGraphConfig,
	BuildOptions,
	KnowledgeGraphBuildState,
	FileSummary,
} from "../types"
import { RootAnalyzer } from "./RootAnalyzer"
import { FileAnalyzer } from "./FileAnalyzer"
import { DirectoryAnalyzer } from "./DirectoryAnalyzer"
import { FileStorage } from "../storage/FileStorage"
import { FileService } from "../tools/FileService"
import { ILogger } from "../../../utils/logger"
import { BuildStateKeeper } from "./BuildStateKeeper"

/**
 * 依赖注入接口
 */
export interface GraphBuilderDependencies {
	rootAnalyzer: RootAnalyzer
	fileAnalyzer: FileAnalyzer
	directoryAnalyzer: DirectoryAnalyzer
	fileService: FileService
	buildStateKeeper: BuildStateKeeper
	logger: ILogger
}

/**
 * 知识图谱构建器
 * 负责协调各个分析器，管理构建流程和状态
 */
export class GraphBuilder extends EventEmitter {
	private config: KnowledgeGraphConfig
	// 依赖组件
	private rootAnalyzer: RootAnalyzer
	private fileAnalyzer: FileAnalyzer
	private directoryAnalyzer: DirectoryAnalyzer
	private fileService: FileService
	private logger: ILogger

	// 构建状态
	private buildStateKeeper: BuildStateKeeper

	constructor(config: KnowledgeGraphConfig, dependencies: GraphBuilderDependencies) {
		super()
		this.config = config
		// 注入依赖
		this.rootAnalyzer = dependencies.rootAnalyzer
		this.fileAnalyzer = dependencies.fileAnalyzer
		this.directoryAnalyzer = dependencies.directoryAnalyzer
		this.fileService = dependencies.fileService
		this.logger = dependencies.logger
		this.buildStateKeeper = dependencies.buildStateKeeper
	}

	/**
	 * 开始构建知识图谱
	 */
	async start(options: BuildOptions = {}): Promise<void> {

		if (this.buildStateKeeper.isRunning()) {
			throw new Error("知识图谱构建已在进行中")
		}
        if (this.buildStateKeeper.isCompleted()) {
            throw new Error("知识图谱已完成构建")
        }

		try {
			this.logger.info("开始构建知识图谱")

			// 执行构建
			await this.executeBuild(options)

			this.logger.info("知识图谱构建完成")
		} catch (error) {
			await this.handleBuildError(error)
		}
	}

	/**
	 * 暂停构建
	 */
	async pause(): Promise<void> {
		if (!this.buildStateKeeper.isRunning()) {
			this.logger.error("knowledge-graph is not building, can not pause.")
            return
		}

		this.buildStateKeeper.updateBuildState({
			isPaused: true,
			isRunning: false,
			status: "paused",
		})

		this.logger.info("构建已暂停")
	}

	/**
	 * 继续构建
	 */
	async resume(): Promise<void> {
		if (!this.buildStateKeeper.isPaused()) {
			throw new Error("构建任务未处于暂停状态")
		}

		this.buildStateKeeper.updateBuildState({
			isPaused: false,
			isRunning: true,
			status: "running",
		})

		this.logger.info("知识图谱构建已恢复", "info", "resume")

		// 恢复构建 - 继续之前未完成的任务
		try {
			await this.start({ resumeFromPrevious: true })
		} catch (error) {
			await this.handleBuildError(error)
		}
	}

    async clear(): Promise<void> {
        if (this.buildStateKeeper.isRunning()) {
			throw new Error("构建进行中，无法清除")
		}
		if (this.storage) {
			await this.storage.clear()
		}

		this.logger.info("知识图谱存储已清除")
    }


    /**
	 * 获取构建状态
	 */
	public getState(): KnowledgeGraphBuildState {
		return this.buildStateKeeper.getCurrentState()
	}

	/**
	 * 执行构建流程
	 */
	private async executeBuild(options: BuildOptions): Promise<void> {
		this.logger.info("开始构建知识图谱...")

		const workspacePath = options.workspacePath
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
		this.logger.info(`获取到项目待分析文件数量: ${totalFiles}`, "info", "build")

		// 1. 收集并分析文件变更
		this.logger.info(`开始增量更新分析，当前文件数: ${fileList.length}`, "info", "build")
		const incrementalResult = await this.storage.initializeFileRecords(fileList)

		this.logger.info(
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
			this.logger.info("没有新增、修改文件，不进行文件摘要")
			// 没有删除，则目录也无需变更
			if (incrementalResult.deleted.length == 0) {
				needDoDirectorySummary = false
				this.logger.info("没有新增、修改、删除文件，不进行目录摘要")
			}
		}
		if (!needDoDirectorySummary && !needDoFileSummary) {
			this.logger.info("无需进行文件、目录摘要,退出任务。")
			this.buildStateKeeper.updateProgress("completed", totalFiles, totalFiles, "无需执行文件、目录摘要")
			return
		}

		const totalFilesToProcess = incrementalResult.added.length + incrementalResult.modified.length
	
		// 初始化构建
		this.buildStateKeeper.initializeBuildState(totalFiles, totalFilesToProcess)

		// 2. 根目录分析

		if (!this.rootAnalyzer) {
			throw new Error("根分析器未初始化")
		}

		const rootInfo = await this.rootAnalyzer.analyzeRoot(fileList)
		await this.storage.saveRootInfo(rootInfo)
		await this.buildStateKeeper.updateProgress("root_analysis", 1, totalFilesToProcess, "根目录分析完成")

		// 增量文件摘要
		if (needDoFileSummary) {
			this.logger.info(`开始执行文件摘要: 待处理文件数 ${totalFilesToProcess}`, "info", "build")

			let fileSummaries: FileSummary[] = []

			// 5. 文件分析 - 只处理需要更新的文件
			if (!this.fileAnalyzer) throw new Error("文件分析器未初始化")


			await this.fileAnalyzer.analyzeFiles(
				rootInfo,
				[...incrementalResult.added, ...incrementalResult.modified],
				workspacePath,
				async (progress: any) => {
					await this.buildStateKeeper.updateProgress("file_analysis", progress.filesProcessed, totalFilesToProcess, progress.message)
				},
				async (summaries: FileSummary[]) => {
					// 批量保存回调
					try {
						await this.storage!.saveFileSummaries(summaries)
						await this.storage!.incrementProcessedFiles()

						this.logger.info(
							`保存文件摘要, 处理进度: (${this.buildStateKeeper.getCurrentState().processedFiles}/${totalFilesToProcess})`,
							"info",
							"build",
						)
					} catch (error) {
						await this.storage!.incrementFailedFiles()
						this.logger.info(`保存文件摘要失败: ${summaries.map((s) => s.path)}, ${error}`, "error", "build")
					}
				},
			)

			this.logger.info(`文件摘要完成`, "info", "build")
		}

		// 3. 目录分析 - 检查暂停状态
		if (this.buildStateKeeper.isPaused()) {
			this.logger.info("构建已暂停，停止目录分析", "info", "build")
			return
		}

		// 目录摘要。TODO 增量
		if (needDoDirectorySummary) {
			await this.buildStateKeeper.updateProgress("directory_analysis", totalFiles, totalFiles, "分析目录结构...")
			if (!this.directoryAnalyzer) {
				throw new Error("目录分析器未初始化")
			}
			await this.directoryAnalyzer.analyzeDirectories(
				rootInfo,
				fileList,
				async (progress: any) => {
					await this.buildStateKeeper.updateProgress("directory_analysis", progress.current, progress.total, progress.message)
				},
				async (summary: any) => {
					// 增量保存目录摘要
					try {
						await this.storage!.saveDirectorySummaries(summary)
						this.logger.info(`已保存目录摘要: ${summary.path}`, "info", "build")
					} catch (error) {
						this.logger.error(`保存目录摘要失败: ${summary.path}, ${error}`, "error", "build")
					}
				},
			)
		}
		// 6. 完成构建 - 修复构建完成状态
		await this.buildStateKeeper.updateProgress("completed", totalFiles, totalFiles, "知识图谱构建完成")

		// 更新内部状态
		this.buildStateKeeper.updateBuildState({
			isRunning: false,
			isPaused: false,
			progress: 100,
			status: "completed",
			currentFile: "知识图谱构建完成",
		})

		this.logger.info("知识图谱构建完全完成")
	}

	/**
	 * 处理构建错误
	 */
	private async handleBuildError(error: unknown): Promise<void> {
		const errorMessage = error instanceof Error ? error.message : "构建知识图谱时发生未知错误"
		this.logger.error(errorMessage, "error", "build")

		// 保存错误状态到存储
		if (this.storage) {
			try {
				await this.buildStateKeeper.updateBuildState({
                    isRunning: false,
			        isPaused: false,
					status: "error",
					error: errorMessage,
				})
			} catch (saveError) {
				this.logger.error(`保存错误状态失败: ${saveError}`, "error", "handleBuildError")
			}
		}
		throw new Error(errorMessage)
	}

	/**
	 * 重置构建器
	 */
	reset(): void {
		this.logger.info("[GraphBuilder] 重置构建器")

		this.isBuilding = false
		this.isPaused = false
		this.buildStartTime = 0
		this.currentPhase = "root_analysis"

		this.progressTracker.reset()
	}

	/**
	 * 销毁构建器
	 */
	dispose(): void {
		this.logger.info("[GraphBuilder] 销毁构建器")

		this.removeAllListeners()
		this.progressTracker.dispose()
		this.reset()
	}
}
