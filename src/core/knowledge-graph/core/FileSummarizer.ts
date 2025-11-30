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
import { PathUtils } from "../tools/PathUtils"
import { ILogger } from "../../../utils/logger"
import { countTokens } from "../../../utils/countTokens"
import { IStorage } from "../storage/IStorage"
import { SchemaDefinitions } from "../storage/SchemaDefinitions"

const FILE_SUMMARIES_FILE = "file_summaries.jsonl"

export class FileSummarizer {
	private llmClient: LLMClient
	private storage: IStorage
	private config: KnowledgeGraphConfig
	private logger: ILogger
	private currentAllFilePaths: string[] = [] // 当前批次的所有文件路径，用于依赖解析

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
			
			// 存储到类成员变量，供 validateAndCleanFileSummary 使用
			this.currentAllFilePaths = allFilePaths

			// TODO 文件列表token数控制
			let basePrompt = buildPrompt(FILE_ANALYSIS_PROMPT, {
				rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
				fileList: formatFileList(allFilePaths),
			})
			const basePromptToken = await countTokens(stringToContentBlocks(basePrompt))
			
			// ✅ 使用配置的上下文窗口阈值
			// 修正：确保 (基础提示词 + 文件内容) <= 总窗口 * 阈值
			const contextWindow = this.llmClient.getContextWindow()
			const thresholdPercent = this.config.contextWindowThreshold || 50
			const maxPromptTokens = Math.floor(contextWindow * (thresholdPercent / 100))
			const fileContentsWindow = maxPromptTokens - basePromptToken
			
			// ✅ 调试日志：打印窗口计算信息
			this.logger.info(`[FileSummarizer] ========== 上下文窗口计算 ==========`)
			this.logger.info(`[FileSummarizer] 模型上下文窗口: ${contextWindow} tokens`)
			this.logger.info(`[FileSummarizer] 基础提示词 (rootInfo + fileList): ${basePromptToken} tokens`)
			this.logger.info(`[FileSummarizer] 上下文窗口阈值: ${thresholdPercent}%`)
			this.logger.info(`[FileSummarizer] 最大提示词限制: ${maxPromptTokens} tokens`)
			this.logger.info(`[FileSummarizer] 文件内容可用窗口: ${fileContentsWindow} tokens (= ${maxPromptTokens} - ${basePromptToken})`)
			this.logger.info(`[FileSummarizer] ================================================`)
			
			// 2. 分批分析文件

			// 优化内存占用：延迟读取文件内容，串行处理批次
			let batchFilePaths: string[] = []
			let batchToken = 0
			let processedCount = 0

			for (let i = 0; i < filesToAnalyze.length; i++) {
				// 检查终止状态
				if (this.shouldPause()) {
					this.logger.info("[FileSummarizer] 分析被停止")
					break
				}

				const filePath = filesToAnalyze[i].path
				const fullPath = path.join(workspacePath, filePath)
				
				// 延迟读取：先检查文件大小和token数，避免无效读取
				let content: string | null = null
				let currentToken = 0
				
				try {
					content = await safeReadFile(fullPath, this.config.fileSizeLimit)
					if (content == null) {
						this.logger.warn(`[FileSummarizer] 文件内容为空: ${filePath}`)
						continue
					}
					
					currentToken = await countTokens(stringToContentBlocks(content))
					
					// 检查单个文件是否超过窗口限制
					if (currentToken > fileContentsWindow) {
						this.logger.warn(`[FileSummarizer] 文件过大跳过: ${filePath} (${currentToken} tokens)`)
						continue
					}
				} catch (error) {
					this.logger.warn(`[FileSummarizer] 读取文件失败: ${filePath}`, error)
					continue
				}

				// 如果当前批次加上新文件会超过限制，先处理当前批次
				if (batchFilePaths.length > 0 && batchToken + currentToken > fileContentsWindow) {
					// 串行处理批次：读取内容并处理
					await this.processBatchByPaths(
						batchFilePaths,
						workspacePath,
						basePrompt,
						rootInfo,
						onProgress,
						processedCount,
						filesToAnalyze.length,
					)
					
					// 检查终止状态（在批处理后）
					if (this.shouldPause()) break

					processedCount += batchFilePaths.length

					// 清理批次数据，防止内存泄漏
					batchFilePaths = []
					batchToken = 0
				}

				// 添加当前文件路径到批次（只存储路径，不存储内容）
				batchFilePaths.push(filePath)
				batchToken += currentToken
			}

			// 处理最后一个批次（如果有剩余文件）
			if (batchFilePaths.length > 0 && !this.shouldPause()) {
				await this.processBatchByPaths(
					batchFilePaths,
					workspacePath,
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
	 * 处理文件批次 - 优化内存版本：延迟读取文件内容
	 */
	private async processBatchByPaths(
		batchFilePaths: string[],
		workspacePath: string,
		basePrompt: string,
		rootInfo: RootInfo,
		onProgress?: (progress: BuildProgress) => void,
		processedCount: number = 0,
		totalFiles: number = 0,
	): Promise<void> {
		if (this.shouldPause()) return

		this.logger.info(`[FileSummarizer] ========== 批次处理开始 ==========`)
		this.logger.info(`[FileSummarizer] 批次大小: ${batchFilePaths.length} 文件`)
		this.logger.info(`[FileSummarizer] 进度: ${processedCount}/${totalFiles}`)
		const batchStartTime = Date.now()
		
		// 延迟读取：只在需要时读取文件内容
		const batchFiles: Array<{ path: string; content: string }> = []
		
		for (const filePath of batchFilePaths) {
			// 检查终止状态
			if (this.shouldPause()) {
				this.logger.info("[FileSummarizer] 批次处理被停止")
				return
			}
			
			try {
				const fullPath = path.join(workspacePath, filePath)
				const content = await safeReadFile(fullPath, this.config.fileSizeLimit)
				
				if (content != null) {
					batchFiles.push({ path: filePath, content })
				} else {
					this.logger.warn(`[FileSummarizer] 批次处理时文件内容为空: ${filePath}`)
				}
			} catch (error) {
				this.logger.warn(`[FileSummarizer] 批次处理时读取文件失败: ${filePath}`, error)
			}
		}
		
		// 如果没有有效文件，直接返回
		if (batchFiles.length === 0) {
			this.logger.warn("[FileSummarizer] 批次中没有有效文件")
			return
		}

		const prompt = buildPrompt(basePrompt, {
			fileContents: formatFileContents(batchFiles),
		})
		
		// ✅ 调试日志：打印批次 token 统计
		const promptTokens = await (async () => {
			try {
				return await (await import("../../../utils/countTokens")).countTokens(
					(await import("../tools/FileUtils")).stringToContentBlocks(prompt)
				)
			} catch {
				return 0
			}
		})()
		this.logger.info(`[FileSummarizer] 批次提示词 tokens: ${promptTokens}`)
		this.logger.info(`[FileSummarizer] 发送 LLM 请求...`)

		// 发送LLM请求
		const response = await this.llmClient.sendStructuredRequest<FileSummary[]>(prompt, SchemaDefinitions.getLLMSchema('file_summaries'))

		// 请求返回后再次检查终止状态，避免写入
		if (this.shouldPause()) return

		const batchDuration = Date.now() - batchStartTime

		if (response.success && response.data) {
			// 验证和清理数据（包括依赖路径解析）
			let batchSummaries = response.data.map((summary: FileSummary) => 
				this.validateAndCleanFileSummary(summary)
			)

			await this.updateSummaries(batchSummaries)
			
			// ✅ 调试日志：打印批次统计
			this.logger.info(`[FileSummarizer] ✅ 批次处理成功`)
			this.logger.info(`[FileSummarizer] 处理文件数: ${batchSummaries.length}`)
			this.logger.info(`[FileSummarizer] 耗时: ${batchDuration}ms`)
			if (response.usage) {
				this.logger.info(`[FileSummarizer] Token 用量 - 输入: ${response.usage.inputTokens}, 输出: ${response.usage.outputTokens}, 成本: ${response.usage.cost}`)
			}
			this.logger.info(`[FileSummarizer] ================================================`)

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
			this.logger.error(`[FileSummarizer] ❌ 批量分析失败: ${response.error}`)
			this.logger.info(`[FileSummarizer] ================================================`)
		}
		
		// 显式清理内存
		batchFiles.length = 0
	}

	/**
	 * 更新文件摘要（智能处理）
	 * - SQLite: 使用 UPSERT，自动覆盖旧数据
	 * - JSONL: 先删除旧数据再插入新数据
	 */
	async updateSummaries(summaries: FileSummary[]): Promise<void> {
		try {
			await this.storage.updateBatch(FILE_SUMMARIES_FILE, summaries)
			this.logger.info(`[FileSummarizer] 已更新 ${summaries.length} 个文件摘要`)
		} catch (error) {
			this.logger.error(`[FileSummarizer] 更新摘要失败: ${error}`)
			throw error
		}
	}

	/**
	 * 删除指定文件的摘要
	 */
	async deleteSummaries(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) return

		try {
			await this.storage.deleteBatch(FILE_SUMMARIES_FILE, filePaths)
			this.logger.info(`[FileSummarizer] 已删除 ${filePaths.length} 个文件的摘要`)
		} catch (error) {
			this.logger.error(`[FileSummarizer] 删除摘要失败: ${error}`)
			throw error
		}
	}

	// 支持动态字段选择
	public async getFileSummaries<K extends keyof FileSummary = keyof FileSummary>(
		fields: K[] | undefined = undefined, // 参数：指定需要返回的字段（动态个数）
	): Promise<Array<Pick<FileSummary, K>> | undefined> {
		// 返回类型：Pick从基础接口中“拾取”指定字段K，生成只包含这些字段的对象数组
		// 3. 内部实现思路：
		// - 先获取完整的文件摘要数据（包含所有字段）
		// 优化：虽然这里仍然是一次性加载，但在解析时直接提取字段，减少中间对象的内存占用
		// TODO: 对于超大文件，建议后续改为流式读取
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
	 * 验证和清理文件摘要
	 * ✅ 路径标准化：LLM 可能返回不同格式的路径分隔符，统一标准化为 Unix 风格
	 * ✅ 依赖路径解析：在数据写入时就解析路径（相对路径、模块路径等），确保数据一致性
	 * ✅ 工程化字段自动生成：timestamp、size、lastModified 由代码生成，不依赖 LLM
	 */
	private validateAndCleanFileSummary(summary: FileSummary): FileSummary {
		const now = new Date().toISOString()
		
		// 标准化文件路径
		const normalizedPath = PathUtils.normalizePathSeparators(summary.path || "")
		
		// 解析和标准化依赖路径（单一数据源原则：写入时处理，查询时直接使用）
		const resolvedDependencies: string[] = []
		if (Array.isArray(summary.dependencies)) {
			for (const depPath of summary.dependencies) {
				// 使用 PathUtils 解析依赖路径
				const resolved = PathUtils.resolveDependencyPath(
					depPath,
					normalizedPath,
					this.currentAllFilePaths
				)
				
				if (resolved) {
					// 解析成功，添加到结果
					resolvedDependencies.push(resolved)
				} else {
					// 解析失败，记录日志但不影响流程（防御性编程）
					this.logger?.debug(`[FileSummarizer] 无法解析依赖路径: ${depPath} (from ${normalizedPath})`)
				}
			}
		}

		return {
			// ✅ 标准化路径：确保 LLM 返回的路径与系统中存储的路径格式一致
			path: normalizedPath,
			type: this.validateFileType(summary.type),
			summary: summary.summary || "",  // ✅ 新增：核心功能描述
			description: summary.description || "",
			keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 10) : [],
			functions: typeof summary.functions === "object" ? summary.functions : {},
			// ✅ 使用解析后的依赖路径
			dependencies: resolvedDependencies,
			// ✅ 工程化字段：自动生成，不依赖 LLM
			timestamp: now,
			size: summary.size || 0,
			lastModified: summary.lastModified || Date.now(),
		}
	}

	/**
	 * 验证文件类型（二分类：source | test）
	 */
	private validateFileType(type: string): "source" | "test" {
		if (type === "test") {
			return "test"
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
