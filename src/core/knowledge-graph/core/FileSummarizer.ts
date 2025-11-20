/**
 * 文件分析器 - 分析项目文件
 */

import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { FILE_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { FileSummary, RootInfo, BuildProgress, KnowledgeGraphConfig, FileInfo } from "../types"
import { LLM_LANGUAGE } from "../constants"
import { ErrorHandler } from "../errors/ErrorHandler"
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
	private isAborted: boolean = false

	constructor(llmClient: LLMClient, storage: IStorage, config: KnowledgeGraphConfig, logger: ILogger) {
		this.llmClient = llmClient
		this.storage = storage
		this.config = config
		this.logger = logger
	}

	/**
	 * 中止当前任务
	 */
	public abort(): void {
		this.isAborted = true
	}

	/**
	 * 重置中止状态
	 */
	public reset(): void {
		this.isAborted = false
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
			
			// 去除非文件内容提示词后的剩余窗口的60%
			const fileContentsWindow = (this.llmClient.getContextWindow() - basePromptToken) * 0.60

			for (let i = 0; i < filesToAnalyze.length; i++) {
				// 检查中止状态
				if (this.isAborted) {
					this.logger.info("[FileSummarizer] 分析被中止")
					break
				}

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
					await this.processBatch(
						batchFiles,
						basePrompt,
						rootInfo,
						onProgress,
						processedCount,
						filesToAnalyze.length,
					)
					
					// 检查中止状态（在批处理后）
					if (this.isAborted) break

					processedCount += batchFiles.length

					// 清理批次数据，防止内存泄漏
					batchFiles = []
					batchToken = 0
				}

				// 添加当前文件到批次
				// TODO: batchFiles 可能会占用较大内存，特别是当文件数量多且内容大时。虽然有 token 限制，但仍需注意。
				batchFiles.push({
					path: filePath,
					content,
				})
				batchToken += currentToken
			}

			// 处理最后一个批次（如果有剩余文件）
			if (batchFiles.length > 0 && !this.isAborted) {
				await this.processBatch(
					batchFiles,
					basePrompt,
					rootInfo,
					onProgress,
					processedCount,
					filesToAnalyze.length,
				)
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
		totalFiles: number = 0,
	): Promise<void> {
		if (this.isAborted) return

		this.logger.info(`[FileSummarizer] start to process batch, batch size: ${batchFiles.length}`)
		const batchStartTime = Date.now()
		const prompt = buildPrompt(basePrompt, {
			rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
			fileContents: formatFileContents(batchFiles),
		})

		// 发送LLM请求
		const response = await this.llmClient.sendStructuredRequest<FileSummary[]>(prompt, this.getFileSummarySchema())

		// 请求返回后再次检查中止状态，避免写入
		if (this.isAborted) return

		const batchDuration = Date.now() - batchStartTime

		if (response.success && response.data) {
			// 验证和清理数据
			let batchSummaries = response.data.map((summary: FileSummary) => this.validateAndCleanFileSummary(summary))

			await this.saveSummaries(batchSummaries)

			const progress: BuildProgress = {
				phase: "file_analysis" as const,
				batchProcessedFilePaths: batchSummaries.map((s) => s.path),
				totalProcessedFiles: processedCount + batchFiles.length,
				totalFiles: totalFiles,
				message: "",
				filesToProcess: totalFiles,
				batchFailedFiles: 0,
				batchDuration: batchDuration,
			}

			onProgress?.(progress)
		} else {
			this.logger.error(`[FileSummarizer] 批量分析失败: ${response.error}`)
		}
	}

	async saveSummaries(summaries: FileSummary[]): Promise<void> {
		// 批量保存回调
		try {
			// 批量写入到JSONL文件
			await this.storage!.addBatch(FILE_SUMMARIES_FILE, summaries)
			this.logger.info(`[FileSummarizer] 保存文件摘要: ${summaries.length}个`)
		} catch (error) {
			this.logger.error(`[FileSummarizer] 保存摘要失败: ${error}`)
		}
	}

	/**
	 * 移除指定文件的摘要
	 */
	async removeSummaries(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) return

		try {
			const pathsToRemove = new Set(filePaths)
			await this.storage.deleteItems(FILE_SUMMARIES_FILE, (item: any) => {
				return pathsToRemove.has(item.path)
			})
			this.logger.info(`[FileSummarizer] 已移除 ${filePaths.length} 个文件的摘要`)
		} catch (error) {
			this.logger.error(`[FileSummarizer] 移除摘要失败: ${error}`)
			throw error
		}
	}

	// 支持动态字段选择
	public async getFileSummaries<K extends keyof FileSummary = keyof FileSummary>(
		fields: K[] | undefined = undefined, // 参数：指定需要返回的字段（动态个数）
	): Promise<Array<Pick<FileSummary, K>> | undefined> {
		// 返回类型：Pick从基础接口中“拾取”指定字段K，生成只包含这些字段的对象数组
		// 3. 内部实现思路（示例）：
		// - 先获取完整的文件摘要数据（包含所有字段）
		// TODO: 一次性加载所有文件摘要可能会导致内存溢出，建议改为流式读取或分页读取。
		const content = await this.storage.load(FILE_SUMMARIES_FILE)
		if (!content) {
			return undefined
		}
		
		// 修复：正确解析 JSONL 格式
		const lines = content.trim().split('\n').filter(line => line.trim())
		
		// 优化：在 map 过程中直接提取字段，减少中间对象的内存占用
		const results: Array<Pick<FileSummary, K>> = []
		
		for (const line of lines) {
			try {
				const summary = JSON.parse(line) as FileSummary
				
				// 如果没有指定字段，返回完整对象
				if (!fields) {
					results.push(summary as unknown as Pick<FileSummary, K>)
					continue
				}

				// 提取指定字段
				const picked: Partial<FileSummary> = {}
				fields.forEach((field) => {
					picked[field] = summary[field]
				})
				results.push(picked as Pick<FileSummary, K>)
			} catch {
				// 忽略解析错误
				continue
			}
		}

		return results
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
	 * 获取文件摘要模式
	 */
	private getFileSummarySchema(): any {
		return [
			{
				path: "本文件路径",
				type: "source|test|config",
				description: `150字左右，突出核心业务逻辑和架构角色（${LLM_LANGUAGE}）`,
				keywords: [`3-5个关键词，按重要性排序（${LLM_LANGUAGE}）`],
				functions: {
					function_name1: `功能描述，50~100字，突出函数功能、业务价值（${LLM_LANGUAGE}）`,
					funciton_name2: `功能描述，50~100字，突出函数功能、业务价值（${LLM_LANGUAGE}）`,
				},
				dependencies: ["本文将依赖的项目内依赖文件路径"],
			},
		]
	}

	/**
	 * 验证和清理文件摘要
	 */
	private validateAndCleanFileSummary(summary: FileSummary): FileSummary {
		const now = new Date().toISOString()

		return {
			path: summary.path || "",
			type: this.validateFileType(summary.type),
			description: summary.description || "",
			keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 10) : [],
			functions: typeof summary.functions === "object" ? summary.functions : {},
			dependencies: Array.isArray(summary.dependencies) ? summary.dependencies : [],
			timestamp: summary.timestamp || now,
			size: summary.size || 0,
			lastModified: summary.lastModified || Date.now(),
		}
	}

	/**
	 * 验证文件类型
	 */
	private validateFileType(type: string): "source" | "config" | "test" {
		if (["source", "config", "test"].includes(type)) {
			return type as any
		}
		return "source"
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
