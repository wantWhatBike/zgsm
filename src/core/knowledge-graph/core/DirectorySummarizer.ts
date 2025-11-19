import { LLMClient } from "../llm/LLMClient"
import { DIRECTORY_ANALYSIS_PROMPT, buildPrompt } from "../llm/PromptTemplates"
import { DirectorySummary, FileSummary, BuildProgress, KnowledgeGraphConfig, FileInfo, RootInfo } from "../types"
import { ErrorHandler } from "../errors/ErrorHandler"
import { ILogger } from "../../../utils/logger"
import { FileSummarizer as FileSummarizer } from "./FileSummarizer"
import { IStorage } from "../storage/IStorage"
import { StorageUtils } from "../storage/StorageUtils"

const DIRECTORY_SUMMARIES_FILE = "directory_summaries.jsonl"

export class DirectorySummarizer {
	private llmClient: LLMClient
	private fileAnalyzer: FileSummarizer
	private logger: ILogger
	private storage: IStorage
	private config: KnowledgeGraphConfig
	private pauseChecker?: () => boolean

	constructor(
		llmClient: LLMClient,
		fileAnalyzer: FileSummarizer,
		storage: IStorage,
		config: KnowledgeGraphConfig,
		logger: ILogger,
	) {
		this.llmClient = llmClient
		this.storage = storage
		this.fileAnalyzer = fileAnalyzer
		this.logger = logger
		this.config = config
	}

	/**
	 * 设置暂停检查器
	 */
	setPauseChecker(checker: () => boolean): void {
		this.pauseChecker = checker
	}

	/**
	 * 检查是否应该中止分析（用于暂停功能）
	 */
	private shouldPause(): boolean {
		return this.pauseChecker?.() || false
	}

	/**
	 * 分析目录 - 支持增量落盘
	 */
	async summarizeDirectories(
		rootInfo: RootInfo,
		files: FileInfo[],
		onProgress?: (progress: BuildProgress) => void,
	): Promise<void> {
		try {
			if (files.length === 0) {
				this.logger.warn(`[DirectorySummarizer] 文件列表为空`)
				return
			}
			const fileSimpleSummaryList = await this.fileAnalyzer.getFileSummaries(["path", "description"])
			if (!fileSimpleSummaryList) {
				throw new Error("get file summaries are null, cannot continue.")
			}

			// 构建提示词
			const prompt = buildPrompt(DIRECTORY_ANALYSIS_PROMPT, {
				rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
				fileSimpleSummaryList: this.concatFileSummaries(fileSimpleSummaryList),
			})

			// 发送LLM请求
			const response = await this.llmClient.sendStructuredRequest<DirectorySummary[]>(
				prompt,
				this.getDirectorySummarySchema(),
			)

			if (!response.success || !response.data) {
				this.logger.error(`[DirectorySummarizer] 分析目录失败: ${response.error}`)
				return
			}

			const directorySummaries = response.data.map((summary: DirectorySummary) =>
				this.validateAndCleanDirectorySummary(summary),
			)

			await this.saveSummaries(directorySummaries)
		} catch (error) {
			throw ErrorHandler.wrapError(error, "目录分析")
		}
	}

	private concatFileSummaries(fileSimpleSummaryList: Pick<FileSummary, "path" | "description">[]): string {
		// 遍历数组，每个元素转换为 "path: description" 格式，再用换行符拼接
		return fileSimpleSummaryList.map((item) => `${item.path}: ${item.description}`).join("\n")
	}

	private async saveSummaries(summaries: DirectorySummary[]): Promise<void> {
		// TODO: 增量保存目录摘要
		try {
			await this.storage!.overwrite(DIRECTORY_SUMMARIES_FILE, summaries)
			this.logger.info(`[DirectorySummarizer] 保存目录摘要: ${summaries.length}个`)
		} catch (error) {
			this.logger.error(`[DirectorySummarizer] 保存摘要失败: ${error}`)
		}
	}

	public async getDirectorySummaries(workspacePath: string): Promise<DirectorySummary[] | undefined> {
		try {
			const content = await this.storage!.load(DIRECTORY_SUMMARIES_FILE)
			if (!content) {
				return undefined
			}
			return StorageUtils.deserialize<DirectorySummary[]>(content)
		} catch (error) {
			this.logger.error(`[DirectorySummarizer] 获取摘要失败: ${error}`)
			throw new Error(`get directory summaries failed, err: ${error}`)
		}
	}

	/**
	 * 验证和清理目录摘要
	 */
	private validateAndCleanDirectorySummary(summary: DirectorySummary): DirectorySummary {
		return {
			path: summary.path,
			type: this.validateDirectoryType(summary.type),
			description: summary.description || "",
			keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 10) : [],
			key_files: Array.isArray(summary.key_files) ? summary.key_files.slice(0, 5) : [],
			timestamp: summary.timestamp || "",
		}
	}

	/**
	 * 验证目录类型
	 */
	private validateDirectoryType(type: string): "module" | "utils" | "config" {
		const validTypes = ["module", "utils", "config"]
		if (validTypes.includes(type)) {
			return type as any
		}
		return "module"
	}

	public async clear(): Promise<void> {
		try {
			await this.storage.clear(DIRECTORY_SUMMARIES_FILE)
			this.logger.info(`[DirectorySummarizer] 已清除摘要数据`)
		} catch (error) {
			this.logger.error(`[DirectorySummarizer] 清除摘要失败: ${error}`)
			throw new Error(`清除目录摘要数据失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 获取目录摘要模式
	 */
	private getDirectorySummarySchema(): any {
		return {
			path: "目录路径",
			type: "功能模块/工具集/配置",
			description: "整体定位（150字左右），详细描述目录在项目中的核心功能、架构角色、业务价值和技术特点（简体中文）",
			keywords: ["2-5个核心关键词（简体中文）"],
			key_files: ["1-5个核心文件路径"],
		}
	}
}
