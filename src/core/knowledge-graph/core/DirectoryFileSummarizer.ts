/**
 * 目录文件摘要生成器（合并阶段）
 * 一次性为目录及其文件生成摘要，减少LLM调用次数
 */

import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { DIRECTORY_FILE_ANALYSIS_PROMPT, buildPrompt } from "../llm/PromptTemplates"
import { FileSummary, DirectorySummary, RootInfo, BuildProgress, KnowledgeGraphConfig, FileInfo, FileChanges } from "../types"
import { ErrorHandler } from "../errors/ErrorHandler"
import { ILogger } from "../../../utils/logger"
import { IStorage } from "../storage/IStorage"
import { SchemaDefinitions } from "../storage/SchemaDefinitions"
import { CodeOutlineExtractor } from "../tools/CodeOutlineExtractor"
import { PathUtils } from "../tools/PathUtils"

const FILE_SUMMARIES_FILE = "file_summaries.jsonl"
const DIRECTORY_SUMMARIES_FILE = "directory_summaries.jsonl"
const MAX_DIR_DEPTH = 4 // 最大目录深度限制

export interface DirectoryFileSummaryResult {
	directory: DirectorySummary
	files: FileSummary[]
}

/**
 * 合并的目录文件摘要生成器
 * 按目录组织文件，一次LLM调用生成目录摘要和所有文件摘要
 */
export class DirectoryFileSummarizer {
	private llmClient: LLMClient
	private storage: IStorage
	private config: KnowledgeGraphConfig
	private logger: ILogger
	private codeOutlineExtractor: CodeOutlineExtractor
	private pauseChecker?: () => boolean

	constructor(
		llmClient: LLMClient,
		storage: IStorage,
		config: KnowledgeGraphConfig,
		logger: ILogger
	) {
		this.llmClient = llmClient
		this.storage = storage
		this.config = config
		this.logger = logger
		this.codeOutlineExtractor = new CodeOutlineExtractor(
			logger,
			config.maxDefinitionLines || 100
		)
	}

	/**
	 * 设置暂停检查器
	 */
	setPauseChecker(checker: () => boolean): void {
		this.pauseChecker = checker
	}

	/**
	 * 检查是否应该停止分析
	 */
	private shouldPause(): boolean {
		return this.pauseChecker?.() || false
	}

	/**
	 * 分析所有目录和文件（支持增量更新）
	 * @param rootInfo 根信息
	 * @param files 所有文件信息
	 * @param workspacePath 工作区路径
	 * @param onProgress 进度回调
	 * @param changedFiles 文件变更信息（用于增量更新）
	 */
	async summarizeAll(
		rootInfo: RootInfo,
		files: FileInfo[],
		workspacePath: string,
		onProgress?: (progress: BuildProgress) => void,
		changedFiles?: FileChanges
	): Promise<void> {
		try {
			if (files.length === 0) {
				this.logger.warn(`[DirectoryFileSummarizer] 文件列表为空`)
				return
			}

		// 1. 按目录分组文件
		const dirFilesMap = this.groupFilesByDirectory(files)

			if (dirFilesMap.size === 0) {
				this.logger.warn(`[DirectoryFileSummarizer] 没有有效目录（所有文件都在根目录）`)
				return
			}

			// 2. 获取所有目录并过滤（深度限制 + 增量更新）
			const allDirs = Array.from(dirFilesMap.keys())
			const affectedDirs = this.buildAffectedDirsSet(changedFiles)
			// 增量更新条件：有变更信息 且 存在受影响的目录
			const isIncrementalUpdate = changedFiles !== undefined && affectedDirs.size > 0
			
			this.logger.info(
				`[DirectoryFileSummarizer] 更新模式: ${isIncrementalUpdate ? '增量' : '全量'}, ` +
				`总目录数: ${allDirs.length}${isIncrementalUpdate ? `, 受影响目录: ${affectedDirs.size}` : ''}`
			)

			const dirsToProcess = allDirs.filter(dir => {
				// 深度限制
				const depth = dir.split('/').length
				if (depth > MAX_DIR_DEPTH) return false
				
				// 增量更新：只处理受影响的目录
				if (isIncrementalUpdate && !affectedDirs.has(dir)) {
					return false
				}
				
				return true
			})

			this.logger.info(
				`[DirectoryFileSummarizer] 共 ${dirsToProcess.length} 个目录待处理`
			)

			// 3. 逐个处理目录（简化逻辑）
			let processedCount = 0
			const dirSummaries: DirectorySummary[] = []
			const fileSummaries: FileSummary[] = []
			
			for (const dirPath of dirsToProcess) {
				if (this.shouldPause()) {
					this.logger.info("[DirectoryFileSummarizer] 分析被暂停")
					break
				}

				const dirFiles = dirFilesMap.get(dirPath) || []
				const startTime = Date.now()
				
				this.logger.debug(
					`[DirectoryFileSummarizer] 处理目录 ${processedCount + 1}/${dirsToProcess.length}: ${dirPath} (${dirFiles.length} 个文件)`
				)

				// 生成目录和文件摘要
				const result = await this.summarizeDirectory(dirPath, dirFiles, workspacePath, rootInfo)

				if (this.shouldPause()) break

				if (result) {
					dirSummaries.push(result.directory)
					fileSummaries.push(...result.files)
					
					const duration = Date.now() - startTime
					this.logger.debug(
						`[DirectoryFileSummarizer] ✅ 目录 ${dirPath} 处理完成，耗时 ${duration}ms`
					)
				}

				processedCount++

				// 每处理10个目录或处理完成时，批量保存一次
				const shouldSave = processedCount % 10 === 0 || processedCount === dirsToProcess.length
				if (shouldSave && (dirSummaries.length > 0 || fileSummaries.length > 0)) {
					if (dirSummaries.length > 0) {
						await this.storage.updateBatch(DIRECTORY_SUMMARIES_FILE, dirSummaries)
					}
					if (fileSummaries.length > 0) {
						await this.storage.updateBatch(FILE_SUMMARIES_FILE, fileSummaries)
					}
					
					this.logger.info(
						`[DirectoryFileSummarizer] 已保存 ${dirSummaries.length} 个目录、${fileSummaries.length} 个文件的摘要`
					)
					
					dirSummaries.length = 0
					fileSummaries.length = 0
			}

				// 触发进度回调（注意：这里的Files指目录数，历史遗留命名）
				onProgress?.({
					phase: "directory_file_analysis" as const,
					message: `正在分析目录: ${dirPath}`,
					totalFiles: dirsToProcess.length,          // 实际是目录总数
					filesToProcess: dirsToProcess.length,      // 实际是待处理目录数
					totalProcessedFiles: processedCount,       // 实际是已处理目录数
					batchProcessedFilePaths: [dirPath],        // 实际是目录路径
					batchFailedFiles: 0,
					batchDuration: Date.now() - startTime
				})
			}

			this.logger.info(`[DirectoryFileSummarizer] 全部目录处理完成`)
		} catch (error) {
			throw ErrorHandler.wrapError(error, "目录文件摘要生成")
		}
	}

	/**
	 * 为单个目录生成摘要
	 * @param dirPath 目录路径
	 * @param files 目录下的文件
	 * @param workspacePath 工作区路径
	 * @param rootInfo 根信息
	 */
	private async summarizeDirectory(
		dirPath: string,
		files: FileInfo[],
		workspacePath: string,
		rootInfo: RootInfo
	): Promise<DirectoryFileSummaryResult | null> {
		try {
			// 0. 跳过空目录（没有文件的目录无法生成有意义的摘要）
			if (files.length === 0) {
				this.logger.debug(`[DirectoryFileSummarizer] 跳过空目录: ${dirPath}`)
				return null
			}

			const maxFilesPerDirectory = this.config.maxFilesPerDirectory || 50

			// 1. 检查文件数量阈值
			if (files.length > maxFilesPerDirectory) {
				this.logger.info(
					`[DirectoryFileSummarizer] 目录 ${dirPath} 文件数 (${files.length}) 超过阈值 (${maxFilesPerDirectory})，仅使用文件名`
				)
				return await this.generateFromFileNames(dirPath, files, rootInfo)
			}

			// 2. 提取文件大纲
			const fileOutlines: Array<{
				path: string
				outline: string | null
				size: number
				lines: number
				length: number
				lastModified: number
			}> = []

			for (const file of files) {
				if (this.shouldPause()) return null

				const fullPath = path.join(workspacePath, file.path)
				const outlineResult = await this.codeOutlineExtractor.extract(fullPath)

				fileOutlines.push({
					path: file.path,
					outline: outlineResult.outline,
					size: file.size,
					lines: outlineResult.lines,
					length: outlineResult.length,
					lastModified: file.lastModified
				})
			}

			// 3. 构建提示词
			const prompt = this.buildPrompt(dirPath, fileOutlines, rootInfo, false)

			// 4. 发送 LLM 请求
			this.logger.info(`[DirectoryFileSummarizer] 发送 LLM 请求: ${dirPath}`)
			const response = await this.llmClient.sendStructuredRequest<DirectoryFileSummaryResult>(
				prompt,
				this.buildLLMSchema()
			)

		if (this.shouldPause()) return null

			if (!response.success || !response.data) {
				this.logger.error(`[DirectoryFileSummarizer] LLM 请求失败: ${response.error}`)
				return null
			}

			// 5. 验证和清理数据
			const result = response.data
			const cleanedDirectory = this.validateDirectorySummary(result.directory, dirPath)
			const cleanedFiles = this.validateAndEnrichFiles(result.files, fileOutlines, '大纲模式')

			return {
				directory: cleanedDirectory,
				files: cleanedFiles
			}
		} catch (error) {
			this.logger.error(`[DirectoryFileSummarizer] 目录 ${dirPath} 处理异常`, error)
			return null
		}
	}

	/**
	 * 仅从文件名生成摘要（文件数量超过阈值时）
	 */
	private async generateFromFileNames(
		dirPath: string,
		files: FileInfo[],
		rootInfo: RootInfo
	): Promise<DirectoryFileSummaryResult | null> {
		try {
			const fileNames = files.map(f => ({
				path: f.path,
				name: path.basename(f.path),
				size: f.size,
				lines: 0,  // 未知
				length: 0, // 未知
				lastModified: f.lastModified
			}))

		const prompt = this.buildPrompt(dirPath, fileNames, rootInfo, true)

			const response = await this.llmClient.sendStructuredRequest<DirectoryFileSummaryResult>(
				prompt,
				this.buildLLMSchema()
			)

			if (!response.success || !response.data) {
				this.logger.error(`[DirectoryFileSummarizer] LLM 请求失败: ${response.error}`)
				return null
			}

			const result = response.data
			const cleanedDirectory = this.validateDirectorySummary(result.directory, dirPath)
			const cleanedFiles = this.validateAndEnrichFiles(result.files, fileNames, '文件名模式')

			return {
				directory: cleanedDirectory,
				files: cleanedFiles
			}
		} catch (error) {
			this.logger.error(`[DirectoryFileSummarizer] 目录 ${dirPath} 处理异常（仅文件名）`, error)
			return null
		}
	}

	/**
	 * 构建提示词
	 */
	private buildPrompt(
		dirPath: string,
		fileData: Array<any>,
		rootInfo: RootInfo,
		onlyFileNames: boolean
	): string {
		let fileContents = ""

		if (onlyFileNames) {
			// 仅文件名模式
			fileContents = fileData.map(f => `- ${f.name || path.basename(f.path)}`).join('\n')
		} else {
			// 完整大纲模式
			fileContents = fileData.map(f => {
				const fileName = path.basename(f.path)
				if (f.outline) {
					return `文件: ${fileName}\n大纲:\n${f.outline}\n---`
				} else {
					return `文件: ${fileName}\n(无法提取大纲)\n---`
				}
			}).join('\n\n')
		}

		return buildPrompt(DIRECTORY_FILE_ANALYSIS_PROMPT, {
			rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
			dirPath: dirPath,
			fileContents: fileContents,
			onlyFileNames: onlyFileNames ? "true" : "false"
		})
	}

	/**
	 * 构建 LLM Schema
	 */
	private buildLLMSchema(): any {
		return {
			directory: SchemaDefinitions.getLLMSchema('directory_summaries'),
			files: SchemaDefinitions.getLLMSchema('file_summaries')
		}
	}

	/**
	 * 验证和清理LLM返回的文件列表
	 * @param llmFiles LLM返回的文件摘要列表
	 * @param fileInfoList 原始文件元信息列表
	 * @param context 上下文信息（用于日志）
	 * @returns 验证和补充后的文件摘要列表
	 */
	private validateAndEnrichFiles(
		llmFiles: FileSummary[],
		fileInfoList: Array<any>,
		context: string
	): FileSummary[] {
		// 创建文件元信息映射（基于路径，避免索引依赖）
		const fileInfoMap = new Map<string, any>()
		for (const fileInfo of fileInfoList) {
			const normalizedPath = PathUtils.normalizePathSeparators(fileInfo.path)
			fileInfoMap.set(normalizedPath, fileInfo)
		}
		
		// 验证并补充每个文件的元信息
		return llmFiles.map(file => {
			const normalizedPath = PathUtils.normalizePathSeparators(file.path)
			const fileInfo = fileInfoMap.get(normalizedPath)
			if (!fileInfo) {
				this.logger.warn(`[DirectoryFileSummarizer] LLM返回了未知文件: ${file.path} (${context})`)
				return this.validateFileSummary(file, { 
					path: file.path, 
					size: 0, 
					lines: 0, 
					length: 0, 
					lastModified: Date.now() 
				})
			}
			return this.validateFileSummary(file, fileInfo)
		})
	}

	/**
	 * 验证和清理目录摘要
	 */
	private validateDirectorySummary(summary: DirectorySummary, dirPath: string): DirectorySummary {
		return {
			path: PathUtils.normalizePathSeparators(dirPath),
			summary: summary.summary || "",
			timestamp: new Date().toISOString()
		}
	}

	/**
	 * 验证和清理文件摘要
	 */
	private validateFileSummary(summary: FileSummary, fileInfo: any): FileSummary {
		const filePath = PathUtils.normalizePathSeparators(summary.path || fileInfo.path)
		
		// 判断文件类型（路径已标准化为Unix风格，只需检查正斜杠）
		let fileType: 'source' | 'test' = 'source'
		if (filePath.includes('/test/') ||
		    filePath.includes('.test.') || 
		    filePath.includes('.spec.')) {
			fileType = 'test'
		}

		return {
			path: filePath,
			type: fileType,
			summary: summary.summary || "",
			timestamp: new Date().toISOString(),
			size: fileInfo.size || 0,
			lines: fileInfo.lines || 0,
			length: fileInfo.length || 0,
			lastModified: fileInfo.lastModified || Date.now()
		}
	}

	/**
	 * 构建受影响目录集合（基于文件变更）
	 * 所有变更文件的目录及其所有父目录都受影响
	 */
	private buildAffectedDirsSet(changedFiles?: FileChanges): Set<string> {
		const affectedDirs = new Set<string>()
		
		if (!changedFiles) {
			// 无变更信息，返回空Set表示全量更新
			this.logger.info(`[DirectoryFileSummarizer] 无变更信息，全量更新`)
			return affectedDirs
		}
		
		const allChanged = [
			...changedFiles.added,
			...changedFiles.modified,
			...changedFiles.deleted
		]
		
		if (allChanged.length === 0) {
			this.logger.info(`[DirectoryFileSummarizer] 无文件变更，无受影响目录`)
			return affectedDirs
		}
		
		// 向上级联到所有父目录（标准化路径以确保匹配）
		for (const file of allChanged) {
			const normalizedPath = PathUtils.normalizePathSeparators(file.path)
			let dir = path.posix.dirname(normalizedPath)  // 使用 posix 确保返回 Unix 风格
			while (dir !== "." && dir !== "") {
				affectedDirs.add(dir)
				dir = path.posix.dirname(dir)
			}
		}
		
		this.logger.info(
			`[DirectoryFileSummarizer] 文件变更: ${allChanged.length} 个, ` +
			`受影响目录: ${affectedDirs.size} 个`
		)
		
		return affectedDirs
	}

	// ==================== 已删除的冗余方法 ====================
	// 以下方法已删除，因为它们违反KISS原则或不再需要：
	// - groupDirectoriesIntoBatches(): 批次分组逻辑过度设计
	// - processBatch(): 批次处理实际上是逐个处理，无实际价值
	// - sortDirectoriesByDepth(): 自下而上排序在当前合并摘要架构中不再需要
	// 
	// 当前策略：直接逐个处理目录，每处理N个目录批量保存一次到数据库
	// ========================================================================

	/**
	 * 按目录分组文件
	 */
	private groupFilesByDirectory(files: FileInfo[]): Map<string, FileInfo[]> {
		const dirFilesMap = new Map<string, FileInfo[]>()

		for (const file of files) {
			// 标准化路径分隔符，确保跨平台一致性
			const normalizedPath = PathUtils.normalizePathSeparators(file.path)
			const dirPath = path.posix.dirname(normalizedPath)  // 使用 posix 确保返回 Unix 风格
			
			// 忽略根目录 "." 或空路径
			if (dirPath === "." || dirPath === "") continue

			if (!dirFilesMap.has(dirPath)) {
				dirFilesMap.set(dirPath, [])
			}
			dirFilesMap.get(dirPath)!.push(file)
		}

		return dirFilesMap
	}


	// ==================== 批量处理功能（已禁用，待完善） ====================
	// TODO: 批量处理多个目录的功能需要以下完善后才能启用：
	// 1. 创建专门的批量提示词模板（当前 DIRECTORY_FILE_ANALYSIS_PROMPT 仅支持单目录）
	// 2. 修复 Schema 定义（应使用 JSON Schema 的 array/items 格式）
	// 3. 实现基于文件路径的映射逻辑（而非索引，避免顺序依赖）
	// 4. 添加完整的错误处理和数据验证
	// 
	// 当前策略：逐个处理目录，确保稳定性优先
	// ========================================================================

	/**
	 * 批量处理多个小目录（一次LLM调用）
	 * 注意：此功能暂时禁用，等待完善后再启用
	 */
	// private async summarizeMultipleDirectories(
	// 	dirPaths: string[],
	// 	dirFilesMap: Map<string, FileInfo[]>,
	// 	workspacePath: string,
	// 	rootInfo: RootInfo
	// ): Promise<Map<string, DirectoryFileSummaryResult>> {
	// 	const results = new Map<string, DirectoryFileSummaryResult>()
	// 	// ... 实现已注释，待完善
	// 	return results
	// }

	/**
	 * 构建批量提示词（已禁用）
	 */
	// private buildBatchPrompt(
	// 	directoriesData: Array<{
	// 		dirPath: string
	// 		files: Array<{ path: string, outline: string | null, [key: string]: any }>
	// 	}>,
	// 	rootInfo: RootInfo
	// ): string {
	// 	// ... 实现已注释
	// 	return ""
	// }

	/**
	 * 构建批量LLM Schema（已禁用）
	 */
	// private buildBatchLLMSchema(dirCount: number): any {
	// 	// ... 实现已注释
	// 	return {}
	// }

	/**
	 * 删除指定文件的摘要
	 */
	async deleteFileSummaries(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) return

		try {
			await this.storage.deleteBatch(FILE_SUMMARIES_FILE, filePaths)
			this.logger.info(`[DirectoryFileSummarizer] 已删除 ${filePaths.length} 个文件的摘要`)
		} catch (error) {
			this.logger.error(`[DirectoryFileSummarizer] 删除文件摘要失败`, error)
			throw error
		}
	}

	/**
	 * 清除所有摘要数据
	 */
	async clear(): Promise<void> {
		try {
			await this.storage.clear(FILE_SUMMARIES_FILE)
			await this.storage.clear(DIRECTORY_SUMMARIES_FILE)
			this.logger.info(`[DirectoryFileSummarizer] 已清除所有摘要数据`)
		} catch (error) {
			this.logger.error(`[DirectoryFileSummarizer] 清除摘要失败`, error)
			throw new Error(`清除摘要数据失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 获取文件摘要（供其他模块使用）
	 */
	async getFileSummaries(): Promise<FileSummary[] | undefined> {
		try {
			const content = await this.storage.load(FILE_SUMMARIES_FILE)
			if (!content) return undefined

			const lines = content.trim().split('\n').filter(line => line.trim())
			return lines.map(line => {
				try {
					return JSON.parse(line) as FileSummary
				} catch {
					return null
				}
			}).filter((s): s is FileSummary => s !== null)
		} catch (error) {
			this.logger.error(`[DirectoryFileSummarizer] 获取文件摘要失败`, error)
			return undefined
		}
	}

	/**
	 * 获取目录摘要（供其他模块使用）
	 */
	async getDirectorySummaries(): Promise<DirectorySummary[] | undefined> {
		try {
			const content = await this.storage.load(DIRECTORY_SUMMARIES_FILE)
			if (!content) return undefined

			const lines = content.trim().split('\n').filter(line => line.trim())
			return lines.map(line => {
				try {
					return JSON.parse(line) as DirectorySummary
				} catch {
					return null
				}
			}).filter((s): s is DirectorySummary => s !== null)
		} catch (error) {
			this.logger.error(`[DirectoryFileSummarizer] 获取目录摘要失败`, error)
			return undefined
		}
	}
}

