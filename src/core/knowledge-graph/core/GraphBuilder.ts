import { KnowledgeGraphConfig, BuildOptions, KnowledgeGraphBuildState, BuildProgress } from "../types"
import { RootAnalyzer } from "./RootAnalyzer"
import { FileSummarizer } from "./FileSummarizer"
import { DirectorySummarizer } from "./DirectorySummarizer"
import { FileService } from "../tools/FileService"
import { ILogger } from "../../../utils/logger"
import { BuildStateTracer } from "./BuildStateTracer"

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

	constructor(config: KnowledgeGraphConfig, dependencies: GraphBuilderDependencies) {
		this.config = config
		this.rootAnalyzer = dependencies.rootAnalyzer
		this.fileSummarizer = dependencies.fileAnalyzer
		this.directorySummarizer = dependencies.directoryAnalyzer
		this.fileService = dependencies.fileService
		this.logger = dependencies.logger
		this.buildStateTracer = dependencies.buildStateKeeper
	}

	/**
	 * 开始构建知识图谱
	 */
	async start(workspacePath: string, options: BuildOptions = {}): Promise<void> {
		if (!workspacePath) {
			throw new Error("workspacePath is null, cannot build.")
		}
		if (this.buildStateTracer.isRunning()) {
			throw new Error("知识图谱构建已在进行中")
		}
		
		// 允许重新构建已完成的知识图谱
		if (this.buildStateTracer.isCompleted() && !options.forceRebuild) {
			this.logger.info("知识图谱已完成构建")
			return
		}

		try {
			this.logger.info(`开始构建知识图谱, 工作区：${workspacePath}`)
			await this.executeBuild(workspacePath, options)
		} catch (error) {
			await this.handleBuildError(error)
			throw error
		}
	}

	/**
	 * 暂停构建
	 */
	async pause(workapcePath: string): Promise<void> {
		if (!workapcePath) {
			throw new Error("workspacePath is null, cannot pause.")
		}
		if (!this.buildStateTracer.isRunning()) {
			return
		}

		this.buildStateTracer.updateBuildState({
			isPaused: true,
			isRunning: false,
			status: "paused",
		})

		this.logger.info("构建已暂停")
	}

	/**
	 * 继续构建
	 */
	async resume(workapcePath: string): Promise<void> {
		if (!workapcePath) {
			throw new Error("workspacePath is null, cannot resume.")
		}
		if (!this.buildStateTracer.isPaused()) {
			throw new Error("构建任务未处于暂停状态")
		}

		this.buildStateTracer.updateBuildState({
			isPaused: false,
			isRunning: true,
			status: "running",
		})

		this.logger.info("构建已恢复")

		// 恢复构建 - 继续之前未完成的任务
		try {
			await this.executeBuild(workapcePath, { resumeFromPrevious: true })
		} catch (error) {
			await this.handleBuildError(error)
		}
	}

	async clear(workapcePath: string): Promise<void> {
		if (!workapcePath) {
			throw new Error("workspacePath is null, cannot clear.")
		}
		if (this.buildStateTracer.isRunning()) {
			throw new Error("构建进行中，无法清除")
		}
        await this.buildStateTracer.clear()
        await this.rootAnalyzer.clear()
        await this.fileSummarizer.clear()
        await this.directorySummarizer.clear()

		this.logger.info("知识图谱存储已清除")
	}

	/**
	 * 获取构建状态
	 */
	public getState(): KnowledgeGraphBuildState|undefined {
		return this.buildStateTracer.getCurrentState()
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

		// 获取项目文件
		const allFiles = await this.fileService.getProjectFilteredFiles(workspacePath)
		const totalFiles = allFiles.length
		this.logger.info(`项目源码文件数量: ${totalFiles}`)

		// 分析文件变更
		const incrementalResult = await this.buildStateTracer.initializeFileRecords(allFiles)
		this.logger.info(`文件变更: 新增${incrementalResult.added.length}, 修改${incrementalResult.modified.length}, 删除${incrementalResult.deleted.length}`)

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
			this.logger.info("无需更新，构建完成")
			this.buildStateTracer.updateProgress("completed", undefined, totalFiles, "无需执行文件、目录摘要")
			return
		}

		const totalFilesToProcess = incrementalResult.added.length + incrementalResult.modified.length

		// 初始化构建
		this.buildStateTracer.initializeBuildState(workspacePath, totalFiles, totalFilesToProcess)

		// 2. 根目录分析

		if (!this.rootAnalyzer) {
			throw new Error("根分析器未初始化")
		}

		const rootInfo = await this.rootAnalyzer.analyzeRoot(workspacePath, allFiles)

		await this.buildStateTracer.updateProgress("root_analysis", undefined, totalFilesToProcess, "根目录分析完成")

		// 文件摘要
		if (needDoFileSummary) {
			this.logger.info(`开始文件摘要: ${totalFilesToProcess}个文件`)

			if (!this.fileSummarizer) {
				throw new Error("文件分析器未初始化")
			}
			await this.fileSummarizer.summarizeFiles(
				rootInfo,
				allFiles,
				[...incrementalResult.added, ...incrementalResult.modified],
				workspacePath,
				async (progress: BuildProgress) => {
					await this.buildStateTracer.updateProgress(
						"file_analysis",
						progress.processedFilePaths,
						progress.failedFiles,
						progress.message,
					)
				},
			)
			this.logger.info(`文件摘要完成`)
		}

		// 检查暂停状态
		if (this.buildStateTracer.isPaused()) {
			this.logger.info("构建已暂停")
			return
		}

		// 目录摘要。
        // TODO: 增量
		if (needDoDirectorySummary) {
			await this.buildStateTracer.updateProgress("directory_analysis", undefined, 0, "分析目录结构...")
			if (!this.directorySummarizer) {
				throw new Error("目录分析器未初始化")
			}
			await this.directorySummarizer.summarizeDirectories(
				rootInfo,
				allFiles,
				async (progress: BuildProgress) => {
					await this.buildStateTracer.updateProgress(
						"directory_analysis",
						progress.processedFilePaths,
						progress.failedFiles,
						progress.message,
					)
				}
			)
		}
		// 完成构建
		await this.buildStateTracer.updateProgress("completed", undefined, totalFiles, "构建完成")
		this.logger.info("构建完成")
	}

	/**
	 * 处理构建错误
	 */
	private async handleBuildError(error: unknown): Promise<void> {
		const errorMessage = error instanceof Error ? error.message : "构建失败"
		this.logger.error(`构建错误: ${errorMessage}`)
		
		// 清理状态
		await this.buildStateTracer.updateBuildState({
			status: "error",
			error: errorMessage,
			isRunning: false,
			isPaused: false
		})
	}

}
