/**
 * 目录分析器 - 分析项目目录
 */

import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { DIRECTORY_ANALYSIS_PROMPT, buildPrompt, formatSummaries } from "../llm/PromptTemplates"
import {
	DirectorySummary,
	FileSummary,
	KnowledgeGraphError,
	BuildProgress,
	KnowledgeGraphConfig,
	FileInfo,
	RootInfo,
} from "../types"
import { ERROR_CODES } from "../constants"
import { createLogger, ILogger } from "../../../utils/logger"
import { FileAnalyzer } from "./FileAnalyzer"
import { string } from "zod"

export class DirectoryAnalyzer {
	private llmClient: LLMClient
	private fileAnalyzer: FileAnalyzer
	private workspacePath: string
	private logger: ILogger
	private config: KnowledgeGraphConfig
	private pauseChecker?: () => boolean

	constructor(llmClient: LLMClient, fileAnalyzer: FileAnalyzer, workspacePath: string, config: KnowledgeGraphConfig) {
		this.llmClient = llmClient
		this.fileAnalyzer = fileAnalyzer
		this.workspacePath = workspacePath
		this.logger = createLogger()
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
	private shouldAbortAnalysis(): boolean {
		return this.pauseChecker?.() || false
	}

	/**
	 * 分析目录 - 支持增量落盘
	 */
	async analyzeDirectories(
		rootInfo: RootInfo,
		files: FileInfo[],
		onProgress?: (progress: BuildProgress) => void,
		onDirectorySummary?: (summaries: DirectorySummary[]) => Promise<void>,
	): Promise<void> {
		try {
			if (files.length === 0) {
				this.logger.warn(`[DirectoryAnalyzer] file list is empty, return.`)
				return
			}
			let fileSimpleSummaryList = await this.fileAnalyzer.getFileSummaries(["path", "description"])

			// 构建提示词
			const prompt = buildPrompt(DIRECTORY_ANALYSIS_PROMPT, {
				rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
				fileSimpleSummaryList: this.buildFileSummaries(fileSimpleSummaryList),
			})

			// 发送LLM请求
			const response = await this.llmClient.sendStructuredRequest<DirectorySummary[]>(
				prompt,
				this.getDirectorySummarySchema(),
			)

			if (!response.success || !response.data) {
				this.logger.error(`[DirectoryAnalyzer] 分析目录失败: `, response.error)
				return
			}

			const directorySummaries = response.data.map((summary: DirectorySummary) =>
				this.validateAndCleanDirectorySummary(summary)
			)

			await onDirectorySummary?.(directorySummaries)
		} catch (error) {
			if (error instanceof KnowledgeGraphError) {
				throw error
			}

			throw new KnowledgeGraphError(
				`目录分析失败: ${error instanceof Error ? error.message : String(error)}`,
				ERROR_CODES.NETWORK_ERROR,
				true,
				true,
			)
		}
	}
  
	private buildFileSummaries(fileSimpleSummaryList: Pick<FileSummary, "path" | "description">[]): string {
		// 遍历数组，每个元素转换为 "path: description" 格式，再用换行符拼接
		return fileSimpleSummaryList.map((item) => `${item.path}: ${item.description}`).join("\n")
	}

	/**
	 * 格式化目录输入
	 */
	private formatDirectoryInput(dirFiles: FileSummary[], subDirSummaries: DirectorySummary[]): string {
		const parts: string[] = []

		// 添加文件摘要
		if (dirFiles.length > 0) {
			parts.push("目录下的文件摘要:")
			parts.push(formatSummaries(dirFiles))
		}

		// 添加子目录摘要
		if (subDirSummaries.length > 0) {
			parts.push("子目录摘要:")
			parts.push(formatSummaries(subDirSummaries))
		}

		return parts.join("\n\n")
	}

	/**
	 * 获取项目文件列表
	 */
	private getProjectFileList(fileSummaries: FileSummary[]): string {
		return fileSummaries.map((summary) => summary.path).join("\n")
	}

	/**
	 * 验证和清理目录摘要
	 */
	private validateAndCleanDirectorySummary(summary: DirectorySummary): DirectorySummary {
		const now = new Date().toISOString()

		return {
			path: summary.path,
			type: this.validateDirectoryType(summary.type),
			description: summary.description || "",
			keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 10) : [],
			key_files: Array.isArray(summary.key_files) ? summary.key_files.slice(0, 5) : [],
			upstream: Array.isArray(summary.upstream) ? summary.upstream : [],
			downstream: Array.isArray(summary.downstream) ? summary.downstream : [],
			collaboration: summary.collaboration || "",
			timestamp: summary.timestamp || now,
		}
	}

	/**
	 * 验证目录类型
	 */
	private validateDirectoryType(type: string): "module" | "utils" | "config" | "feature" {
		const validTypes = ["module", "utils", "config", "feature"]
		if (validTypes.includes(type)) {
			return type as any
		}
		return "module"
	}

	/**
	 * 获取目录摘要模式
	 */
	private getDirectorySummarySchema(): any {
		return {
			type: "object",
			properties: {
				path: { type: "string" },
				type: {
					type: "string",
					enum: ["module", "utils", "config", "feature"],
				},
				description: { type: "string" },
				keywords: {
					type: "array",
					items: { type: "string" },
					maxItems: 10,
				},
				key_files: {
					type: "array",
					items: { type: "string" },
					maxItems: 5,
				},
				upstream: {
					type: "array",
					items: { type: "string" },
				},
				downstream: {
					type: "array",
					items: { type: "string" },
				},
				collaboration: { type: "string" },
				timestamp: { type: "string" },
			},
			required: ["path", "type", "description", "keywords", "key_files", "upstream", "downstream"],
		}
	}
}
