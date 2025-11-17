/**
 * 文件分析器 - 分析项目文件
 */

import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { FILE_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { FileSummary, RootInfo, KnowledgeGraphError, BuildProgress, KnowledgeGraphConfig, FileInfo } from "../types"
import { ERROR_CODES } from "../constants"
import { safeReadFile, stringToContentBlocks } from "../tools/FileUtils"
import { createLogger, ILogger } from "../../../utils/logger"
import { countTokens } from "../../../utils/countTokens"
import { FileStorage } from "../storage/FileStorage"
import { IStorage } from "../storage/StorageInterface"

export class FileAnalyzer {
	private llmClient: LLMClient
	private storage: IStorage
	private config: KnowledgeGraphConfig
	private logger: ILogger

	constructor(llmClient: LLMClient, storage: IStorage, config: KnowledgeGraphConfig, logger: ILogger) {
		this.llmClient = llmClient
		this.storage = storage
		this.config = config
		this.logger = logger
	}

	/**
	 * 分析项目文件
	 */
	async analyzeFiles(
		rootInfo: RootInfo,
		filesToAnalyze: FileInfo[],
		workspacePath: string,
		onProgress?: (progress: BuildProgress) => void,
		onFileSummary?: (summary: FileSummary[]) => Promise<void>,
	): Promise<void> {
		try {
			const fileList = await this.storage.getFilesList()
			const allFilePaths: string[] = Object.keys(fileList)

			// TODO 文件列表token数控制
			let basePrompt = buildPrompt(FILE_ANALYSIS_PROMPT, {
				rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
				fileList: formatFileList(allFilePaths),
			})
			const basePromptToken = await countTokens(stringToContentBlocks(basePrompt))
			// 2. 分批分析文件
			const summaries: FileSummary[] = []

			let batchFiles: Array<{ path: string; content: string }> = []
			let batchToken = 0
			// 去除非文件内容提示词后的剩余窗口的95%
			const fileContentsWindow = (this.llmClient.getContextWindow() - basePromptToken) * 0.95

			for (let i = 0; i < filesToAnalyze.length; i++) {
				// 检查是否应该暂停（在处理每个批次前检查）
				if (this.shouldAbortAnalysis()) {
					this.logger.info("[FileAnalyzer] 分析被暂停，停止文件批次处理")
					break
				}
				// 收集批次文件内容

				// 根据上下文窗口大小，动态拼接文件内容
				const filePath = filesToAnalyze[i].path
				const fullPath = path.join(workspacePath, filePath)
				const content = await safeReadFile(fullPath, this.config.fileSizeLimit)
				if (content == null) {
					this.logger.warn(`[FileAnalyzer] read file content is null`)
					continue
				}

				const currentToken = await countTokens(stringToContentBlocks(content))

				if (batchToken + currentToken <= fileContentsWindow) {
					batchFiles.push({
						path: filePath,
						content,
					})
					// 继续累加
					continue
				}

				if (batchFiles.length === 0) {
					continue
				}

				// 构建提示词
				const prompt = buildPrompt(basePrompt, {
					rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "无项目背景信息",
					fileContents: formatFileContents(batchFiles),
				})

				// 发送LLM请求
				const response = await this.llmClient.sendStructuredRequest<FileSummary[]>(
					prompt,
					this.getFileSummarySchema(),
				)

				if (!response.success || !response.data) {
					// 跳过当前文件
					this.logger.error(`[FileAnalyzer] batch analyze files err: ${response}`)
					continue
				}

				// 验证和清理数据
				let batchSummaries = response.data.map((summary: FileSummary) =>
					this.validateAndCleanFileSummary(summary),
				)
				// 如果提供了增量保存回调，立即保存每个文件摘要
				if (onFileSummary) {
					await onFileSummary(batchSummaries)
				}

				const progress = {
					phase: "file_analysis" as const,
					current: i,
					total: allFilePaths.length,
					message: `已分析 ${i}/${allFilePaths.length} 个文件`,
					percentage: Math.round((i / allFilePaths.length) * 100),
				}

				onProgress?.(progress)

				// 重置批次

				// 当前文件超过窗口，则跳过当前文件
				if (currentToken > fileContentsWindow) {
					batchFiles = []
					batchSummaries = []
					batchToken = currentToken
					this.logger.warn(
						`[FileAnalyzer] file ${filePath} token ${currentToken} exceeds context remaining window ${fileContentsWindow}, skip it.`,
					)
					continue
				}
				batchFiles = [
					{
						path: filePath,
						content,
					},
				]
				batchSummaries = []
				batchToken = currentToken
			}
		} catch (error) {
			if (error instanceof KnowledgeGraphError) {
				throw error
			}

			throw new KnowledgeGraphError(
				`文件分析失败: ${error instanceof Error ? error.message : String(error)}`,
				ERROR_CODES.NETWORK_ERROR,
				true,
				true,
			)
		}
	}

	// 2. 修改函数签名：支持动态字段选择
	public async getFileSummaries<K extends keyof FileSummary = keyof FileSummary>(
		fields: K[], // 参数：指定需要返回的字段（动态个数）
	): Promise<Array<Pick<FileSummary, K>>> {
		// 返回类型：Pick从基础接口中“拾取”指定字段K，生成只包含这些字段的对象数组

		// 3. 内部实现思路（示例）：
		// - 先获取完整的文件摘要数据（包含所有字段）
		const fullSummaries: FileSummary[] = await this.storage.getAllFileSummaries()
		// - 根据fields过滤，只保留指定字段
		return fullSummaries.map((summary) => {
			const picked: Partial<FileSummary> = {}
			fields.forEach((field) => {
				picked[field] = summary[field]
			})
			return picked as Pick<FileSummary, K>
		})
	}



	/**
	 * 验证和清理文件摘要
	 */
	private validateAndCleanFileSummary(summary: FileSummary): FileSummary {
		const now = new Date().toISOString()

		return {
			path: summary.path || "",
			type: this.validateFileType(summary.type),
			description: summary.description || "未提供描述",
			keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 10) : [],
			core_functions: typeof summary.core_functions === "object" ? summary.core_functions : {},
			dependencies: Array.isArray(summary.dependencies) ? summary.dependencies : [],
			timestamp: summary.timestamp || now,
			size: summary.size || 0,
			lastModified: summary.lastModified || Date.now(),
		}
	}

	/**
	 * 验证文件类型
	 */
	private validateFileType(type: string): "source" | "config" | "document" | "test" {
		if (["source", "config", "document", "test"].includes(type)) {
			return type as any
		}
		return "source"
	}

	/**
	 * 获取文件摘要模式
	 */
	private getFileSummarySchema(): any {
		return {
			type: "array",
			items: {
				type: "object",
				properties: {
					path: { type: "string" },
					type: {
						type: "string",
						enum: ["source", "config", "document", "test"],
					},
					description: { type: "string" },
					keywords: {
						type: "array",
						items: { type: "string" },
						maxItems: 10,
					},
					core_functions: {
						type: "object",
						additionalProperties: { type: "string" },
					},
					dependencies: {
						type: "array",
						items: { type: "string" },
					},
				},
				required: ["path", "type", "description", "keywords", "core_functions", "dependencies"],
			},
		}
	}

	/**
	 * 设置暂停检查回调
	 */
	private pauseChecker?: () => boolean

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
}
