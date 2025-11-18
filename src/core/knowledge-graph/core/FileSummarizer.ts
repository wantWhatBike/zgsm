/**
 * 文件分析器 - 分析项目文件
 */

import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { FILE_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { FileSummary, RootInfo, BuildProgress, KnowledgeGraphConfig, FileInfo } from "../types"
import { ErrorHandler } from "../errors/KnowledgeGraphError"
import { safeReadFile, stringToContentBlocks } from "../tools/FileUtils"
import { ILogger } from "../../../utils/logger"
import { countTokens } from "../../../utils/countTokens"
import { IStorage } from "../storage/IStorage"
import { StorageUtils } from "../storage/StorageUtils"


const FILE_SUMMARIES_FILE = "file_summaries.jsonl"

export class FileSummarizer {

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
	async summarizeFiles(
		rootInfo: RootInfo,
		allFileList: FileInfo[],
		filesToAnalyze: FileInfo[],
		workspacePath: string,
		onProgress?: (progress: BuildProgress) => void,
	): Promise<void> {
		try {
			const allFilePaths: string[] = allFileList.map((file) => file.path)

			// TODO 文件列表token数控制
			let basePrompt = buildPrompt(FILE_ANALYSIS_PROMPT, {
				rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
				fileList: formatFileList(allFilePaths),
			})
			const basePromptToken = await countTokens(stringToContentBlocks(basePrompt))
			// 2. 分批分析文件

			let batchFiles: Array<{ path: string; content: string }> = []
			let batchToken = 0
			let processedCount = 0
			// 去除非文件内容提示词后的剩余窗口的95%
			const fileContentsWindow = (this.llmClient.getContextWindow() - basePromptToken) * 0.95

			for (let i = 0; i < filesToAnalyze.length; i++) {
				// 检查是否应该暂停（在处理每个批次前检查）
				if (this.shouldPause()) {
					this.logger.info("[FileSummarizer] 分析被暂停")
					break
				}

				// 根据上下文窗口大小，动态拼接文件内容
				const filePath = filesToAnalyze[i].path
				const fullPath = path.join(workspacePath, filePath)
				const content = await safeReadFile(fullPath, this.config.fileSizeLimit)
				if (content == null) {
					this.logger.warn(`[FileSummarizer] 文件内容为空: ${filePath}`)
					continue
				}

				const currentToken = await countTokens(stringToContentBlocks(content))

				// 检查单个文件是否超过窗口限制
				if (currentToken > fileContentsWindow) {
					this.logger.warn(`[FileSummarizer] 文件过大跳过: ${filePath} (${currentToken} tokens)`)
					continue
				}

				// 如果当前批次加上新文件会超过限制，先处理当前批次
				if (batchFiles.length > 0 && batchToken + currentToken > fileContentsWindow) {
					await this.processBatch(batchFiles, basePrompt, rootInfo, onProgress, processedCount, filesToAnalyze.length)
					processedCount += batchFiles.length
					
					// 清理批次数据，防止内存泄漏
					batchFiles = []
					batchToken = 0
				}

				// 添加当前文件到批次
				batchFiles.push({
					path: filePath,
					content,
				})
				batchToken += currentToken
			}

			// 处理最后一个批次（如果有剩余文件）
			if (batchFiles.length > 0) {
				await this.processBatch(batchFiles, basePrompt, rootInfo, onProgress, processedCount, filesToAnalyze.length)
			}
		} catch (error) {
			throw ErrorHandler.wrapError(error, "文件摘要生成")
		}
	}

	/**
	 * 处理文件批次
	 */
	private async processBatch(
		batchFiles: Array<{ path: string; content: string }>,
		basePrompt: string,
		rootInfo: RootInfo,
		onProgress?: (progress: BuildProgress) => void,
		processedCount: number = 0,
		totalFiles: number = 0
	): Promise<void> {
		const prompt = buildPrompt(basePrompt, {
			rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
			fileContents: formatFileContents(batchFiles),
		})

		// 发送LLM请求
		const response = await this.llmClient.sendStructuredRequest<FileSummary[]>(
			prompt,
			this.getFileSummarySchema(),
		)

		if (response.success && response.data) {
			// 验证和清理数据
			let batchSummaries = response.data.map((summary: FileSummary) =>
				this.validateAndCleanFileSummary(summary),
			)

			await this.saveSummaries(batchSummaries)
			
			const progress = {
				phase: "file_analysis" as const,
				processedFilePaths: batchSummaries.map(s => s.path),
				totalFiles: totalFiles,
				message: `已分析 ${processedCount + batchFiles.length}/${totalFiles} 个文件`,
				filesToProcess: totalFiles,
				failedFiles: 0,
			}

			onProgress?.(progress)
		} else {
			this.logger.error(`[FileSummarizer] 批量分析失败: ${response.error}`)
		}
	}

	async saveSummaries(summaries: FileSummary[]): Promise<void> {
		// 批量保存回调
		try {
			// 逐个保存到JSONL文件，确保每个摘要占一行
			for (const summary of summaries) {
				await this.storage!.add(FILE_SUMMARIES_FILE, summary)
			}
			this.logger.info(`[FileSummarizer] 保存文件摘要: ${summaries.length}个`)
		} catch (error) {
			this.logger.error(`[FileSummarizer] 保存摘要失败: ${error}`)
		}
	}


	// 支持动态字段选择
	public async getFileSummaries<K extends keyof FileSummary = keyof FileSummary>(
		fields: K[]|undefined = undefined, // 参数：指定需要返回的字段（动态个数）
	): Promise<Array<Pick<FileSummary, K>> | undefined> {
		// 返回类型：Pick从基础接口中“拾取”指定字段K，生成只包含这些字段的对象数组
		// 3. 内部实现思路（示例）：
		// - 先获取完整的文件摘要数据（包含所有字段）
		const content = await this.storage.load(FILE_SUMMARIES_FILE)
		if (!content) {
			return undefined
		}
		const fullSummaries = StorageUtils.deserialize<FileSummary[]>(content)
		if (!fields) {
			return fullSummaries
		}
		
		// - 根据fields过滤，只保留指定字段
		return fullSummaries.map((summary) => {
			const picked: Partial<FileSummary> = {}
			fields.forEach((field) => {
				picked[field] = summary[field]
			})
			return picked as Pick<FileSummary, K>
		})
	}


	public async clear(): Promise<void> {
		try {
			await this.storage.clear(FILE_SUMMARIES_FILE)
			this.logger.info(`[FileSummarizer] 已清除摘要数据`)
		} catch (error) {
			this.logger.error(`[FileSummarizer] 清除摘要失败: ${error}`)
			throw new Error(`清除文件摘要数据失败: ${error instanceof Error ? error.message : String(error)}`)
		}
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
	private shouldPause(): boolean {
		return this.pauseChecker?.() || false
	}
}
