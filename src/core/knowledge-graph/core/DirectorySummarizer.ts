import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { DIRECTORY_ANALYSIS_PROMPT, buildPrompt, formatFileList } from "../llm/PromptTemplates"
import { DirectorySummary, FileSummary, BuildProgress, KnowledgeGraphConfig, FileInfo, RootInfo, FileChanges } from "../types"
import { LLM_LANGUAGE } from "../constants"
import { ErrorHandler } from "../errors/ErrorHandler"
import { ILogger } from "../../../utils/logger"
import { FileSummarizer as FileSummarizer } from "./FileSummarizer"
import { IStorage } from "../storage/IStorage"
import { StorageUtils } from "../storage/StorageUtils"

const DIRECTORY_SUMMARIES_FILE = "directory_summaries.jsonl"
const MAX_DIR_DEPTH = 4 // 最大目录深度限制

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
	 * 检查是否应该停止分析（统一的终止控制）
	 */
	private shouldPause(): boolean {
		return this.pauseChecker?.() || false
	}

	/**
	 * 构建受影响目录集合（基于文件变更）
	 * 所有变更文件的目录及其所有父目录都受影响
	 */
	private buildAffectedDirsSet(changedFiles?: FileChanges): Set<string> {
		const affectedDirs = new Set<string>()
		
		if (!changedFiles) {
			this.logger.info(`[DirectorySummarizer] 无变更信息，全量更新`)
			return affectedDirs
		}
		
		const allChanged = [
			...changedFiles.added,
			...changedFiles.modified,
			...changedFiles.deleted
		]
		
		if (allChanged.length === 0) {
			this.logger.info(`[DirectorySummarizer] 无文件变更，无受影响目录`)
			return affectedDirs
		}
		
		for (const file of allChanged) {
			let dir = path.dirname(file.path)
			// 向上级联到所有父目录
			while (dir !== "." && dir !== "") {
				affectedDirs.add(dir)
				dir = path.dirname(dir)
			}
		}
		
		this.logger.info(`[DirectorySummarizer] 文件变更: ${allChanged.length} 个, 受影响目录: ${affectedDirs.size} 个`)
		return affectedDirs
	}

	/**
	 * 分析目录 - 采用自下而上的迭代方式
	 */
	async summarizeDirectories(
		rootInfo: RootInfo,
		files: FileInfo[],
		onProgress?: (progress: BuildProgress) => void,
		changedFiles?: FileChanges, // 新增参数：文件变更信息
	): Promise<void> {
		try {
			if (files.length === 0) {
				this.logger.warn(`[DirectorySummarizer] 文件列表为空`)
				return
			}

			// 1. 获取所有文件摘要 - 增加 lastModified 用于增量更新判断
			const fileSummaries = await this.fileAnalyzer.getFileSummaries(["path", "description", "lastModified"])
			if (!fileSummaries) {
				throw new Error("无法获取文件摘要，无法继续目录分析")
			}

			// 2. 提取所有目录并计算深度
			const dirDepths = new Map<string, number>()
			const dirFiles = new Map<string, Pick<FileSummary, "path" | "description" | "lastModified">[]>()

			// 遍历文件，归类到目录
			for (const file of fileSummaries) {
				const dirPath = path.dirname(file.path)
				// 忽略根目录 "." 或空路径
				if (dirPath === "." || dirPath === "") continue

				if (!dirFiles.has(dirPath)) {
					dirFiles.set(dirPath, [])
					// 计算深度：根据路径分隔符数量
					const depth = dirPath.split(/[\\/]/).length
					dirDepths.set(dirPath, depth)
				}
				dirFiles.get(dirPath)?.push(file)
			}

			// 补充中间目录
			const allDirs = Array.from(dirDepths.keys())
			for (const dir of allDirs) {
				let current = dir
				while (true) {
					const parent = path.dirname(current)
					if (parent === "." || parent === "" || dirDepths.has(parent)) break

					const depth = parent.split(/[\\/]/).length
					if (depth > 0) {
						dirDepths.set(parent, depth)
						if (!dirFiles.has(parent)) {
							dirFiles.set(parent, [])
						}
					}
					current = parent
				}
			}

			// 3. 按深度降序排序（自下而上）
			const sortedDirs = Array.from(dirDepths.entries())
				.sort((a, b) => b[1] - a[1]) // 深度大的在前
				.map(([dir]) => dir)

			// 4. 准备增量更新 - 加载现有摘要
			const dirSummaryMap = new Map<string, DirectorySummary>()
			const existingSummaries = await this.getDirectorySummaries("")
			if (existingSummaries) {
				existingSummaries.forEach(s => dirSummaryMap.set(s.path, s))
			}

			// 5. 识别需要更新的目录（第一遍遍历：确定需要更新哪些目录）
			// 使用 Set 存储需要更新的目录路径
			const dirsToUpdate = new Set<string>()
			
			// ✅ 构建受影响目录集合（基于精确的文件变更）
			const affectedDirs = this.buildAffectedDirsSet(changedFiles)
			
			// 第一遍遍历：确定哪些目录需要更新
			for (const dirPath of sortedDirs) {
				const depth = dirDepths.get(dirPath) || 0
				if (depth > MAX_DIR_DEPTH) continue

				// 获取直接子文件摘要
				const subFiles = dirFiles.get(dirPath) || []
				
				// 获取直接子目录摘要（从内存 Map 中获取，包含新生成的和旧的）
				const subDirs: DirectorySummary[] = []
				let hasUpdatedSubDir = false
				
				// 查找子目录
				for (const [childPath, summary] of dirSummaryMap.entries()) {
					if (path.dirname(childPath) === dirPath) {
						subDirs.push(summary)
						// 检查子目录是否在本次被更新过
						if (dirsToUpdate.has(childPath)) {
							hasUpdatedSubDir = true
						}
					}
				}

				if (subFiles.length === 0 && subDirs.length === 0) {
					continue
				}

				// ✅ 判断是否需要更新（基于精确的文件变更）
				let needsUpdate = false
				const oldSummary = dirSummaryMap.get(dirPath)

				if (!oldSummary) {
					// 没有旧摘要，必须更新
					needsUpdate = true
				} else if (hasUpdatedSubDir) {
					// 子目录有更新，父目录必须更新
					needsUpdate = true
				} else if (affectedDirs.size > 0 && affectedDirs.has(dirPath)) {
					// ✅ 精确判断：该目录在受影响目录集合中
					needsUpdate = true
				} else {
					// 未受影响，跳过更新
					needsUpdate = false
				}

				// 如果需要更新，标记该目录
				if (needsUpdate) {
					dirsToUpdate.add(dirPath)
				}
			}
			
			// 准备全量文件列表字符串（仅计算一次）
			const allFileListStr = formatFileList(files.map((f) => f.path))
			
			// 记录需要更新的目录数量
			const totalDirsToUpdate = dirsToUpdate.size
			this.logger.info(`[DirectorySummarizer] 需要更新 ${totalDirsToUpdate} 个目录（总目录数: ${sortedDirs.length}）`)
			
			// 第二遍遍历：实际执行更新
			let processedCount = 0
			for (const dirPath of sortedDirs) {
				// 只处理需要更新的目录
				if (!dirsToUpdate.has(dirPath)) {
					continue
				}
				
			// 检查终止状态
			if (this.shouldPause()) {
				this.logger.info("[DirectorySummarizer] 分析被暂停")
				break
			}

			// 开始处理目录
			this.logger.info(`[DirectorySummarizer] 开始处理目录: ${dirPath}，进度: ${processedCount + 1}/${totalDirsToUpdate}`)

			// 获取子文件和子目录（重新计算，确保数据正确）
			const subFiles = dirFiles.get(dirPath) || []
			const subDirs: DirectorySummary[] = []
			for (const [childPath, summary] of dirSummaryMap.entries()) {
				if (path.dirname(childPath) === dirPath) {
					subDirs.push(summary)
				}
			}

			// 生成当前目录摘要
			const summary = await this.generateDirectorySummary(
				dirPath,
				rootInfo,
				allFileListStr,
				subFiles,
				subDirs,
			)

			// 生成后再次检查终止状态
			if (this.shouldPause()) break

			if (summary) {
				dirSummaryMap.set(dirPath, summary)
			}

			processedCount++
			
			this.logger.info(`[DirectorySummarizer] 目录摘要完成: ${dirPath}`)
				
				onProgress?.({
					phase: "directory_analysis",
					message: `正在分析目录: ${dirPath}`,
					totalFiles: totalDirsToUpdate, // ✅ 使用需要更新的目录数作为分母
					filesToProcess: totalDirsToUpdate,
					totalProcessedFiles: processedCount, // 已更新的数量
					batchProcessedFilePaths: [dirPath],
					batchFailedFiles: 0,
				})
			}

			// ✅ 6. 批量保存更新的目录（增量更新）
			if (!this.shouldPause() && processedCount > 0) {
				const summariesToUpdate: DirectorySummary[] = []
				
				for (const dirPath of dirsToUpdate) {
					const summary = dirSummaryMap.get(dirPath)
					if (summary) {
						summariesToUpdate.push(summary)
					}
				}

				// ✅ 使用 update 接口（SQLite 用 UPSERT，JSONL 先删后加）
				await this.updateSummaries(summariesToUpdate)

				this.logger.info(`[DirectorySummarizer] 目录分析完成，已更新 ${summariesToUpdate.length} 个目录摘要`)
			} else if (this.shouldPause()) {
				this.logger.info(`[DirectorySummarizer] 目录分析被暂停`)
			} else {
				this.logger.info(`[DirectorySummarizer] 无需更新目录摘要`)
			}
		} catch (error) {
			throw ErrorHandler.wrapError(error, "目录分析")
		}
	}


	private async generateDirectorySummary(
		dirPath: string,
		rootInfo: RootInfo,
		allFileListStr: string,
		subFiles: Pick<FileSummary, "path" | "description" | "lastModified">[],
		subDirs: DirectorySummary[]
	): Promise<DirectorySummary | null> {
		try {
			// 格式化输入
			const subFileSummariesStr = subFiles.map(f => `- ${path.basename(f.path)}: ${f.description}`).join("\n")
			const subDirSummariesStr = subDirs.map(d => `- ${path.basename(d.path)}/: ${d.description}`).join("\n")

			const prompt = buildPrompt(DIRECTORY_ANALYSIS_PROMPT, {
				rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : "",
				allFileList: allFileListStr,
				dirPath: dirPath,
				subFileSummaries: subFileSummariesStr || "(无直接子文件)",
				subDirSummaries: subDirSummariesStr || "(无直接子目录)"
			})

			const response = await this.llmClient.sendStructuredRequest<DirectorySummary>(
				prompt,
				this.getDirectorySummarySchema()
			)

			if (response.success && response.data) {
				// 修正返回数据中的 path，确保是全路径
				const summary = response.data
				summary.path = dirPath // 强制使用正确路径
				return this.validateAndCleanDirectorySummary(summary)
			} else {
				this.logger.warn(`[DirectorySummarizer] 目录 ${dirPath} 分析失败: ${response.error}`)
				return null
			}
		} catch (error) {
			this.logger.error(`[DirectorySummarizer] 生成目录摘要异常: ${error}`)
			return null
		}
	}

	/**
	 * 更新目录摘要（智能处理）
	 * - SQLite: 使用 UPSERT，自动覆盖旧数据
	 * - JSONL: 先删除旧数据再插入新数据
	 */
	private async updateSummaries(summaries: DirectorySummary[]): Promise<void> {
		try {
			await this.storage.updateBatch(DIRECTORY_SUMMARIES_FILE, summaries)
			this.logger.info(`[DirectorySummarizer] 已更新 ${summaries.length} 个目录摘要`)
		} catch (error) {
			this.logger.error(`[DirectorySummarizer] 更新摘要失败: ${error}`)
			throw error
		}
	}

	public async getDirectorySummaries(workspacePath: string): Promise<DirectorySummary[] | undefined> {
		try {
			const content = await this.storage!.load(DIRECTORY_SUMMARIES_FILE)
			if (!content) {
				return undefined
			}
			
			// 修复：正确解析 JSONL 格式
			const lines = content.trim().split('\n').filter(line => line.trim())
			return lines.map(line => {
				try {
					return JSON.parse(line) as DirectorySummary
				} catch {
					return null
				}
			}).filter((s): s is DirectorySummary => s !== null)
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
			description: `整体定位（150字左右），详细描述目录在项目中的核心功能、架构角色、业务价值和技术特点（${LLM_LANGUAGE}）`,
			keywords: [`2-5个核心关键词（${LLM_LANGUAGE}）`],
			key_files: ["1-5个核心文件路径"],
		}
	}
}
