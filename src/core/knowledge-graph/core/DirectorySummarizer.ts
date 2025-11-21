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

			// 5. 识别需要更新的目录
			// 使用 Set 存储需要更新的目录路径
			const dirsToUpdate = new Set<string>()
			
			// 策略：基于时间戳和依赖关系判断是否需要更新
			// 由于是自下而上处理，如果子目录更新了，父目录也需要更新
			// 我们在遍历过程中动态判断
			
			// 准备全量文件列表字符串（仅计算一次）
			const allFileListStr = formatFileList(files.map((f) => f.path))

			let processedCount = 0
			
			// 预先计算总任务数（估算）
			// 为了准确进度条，我们需要先遍历一遍判断哪些需要更新
			// 但为了性能，我们可以在遍历时动态判断，进度条可能不是 100% 准确，但可以接受
			// 或者我们可以先快速扫描一遍
			
			for (const dirPath of sortedDirs) {
				const depth = dirDepths.get(dirPath) || 0
				if (depth > MAX_DIR_DEPTH) continue

				// 获取直接子文件摘要
				const subFiles = dirFiles.get(dirPath) || []
				
				// 获取直接子目录摘要（从内存 Map 中获取，包含新生成的和旧的）
				const subDirs: DirectorySummary[] = []
				let hasUpdatedSubDir = false
				
				// 查找子目录
				// 注意：sortedDirs 是按深度降序排列的（深层在前），所以处理当前目录时，子目录应该已经处理过了
				// 我们需要遍历 dirSummaryMap 来找子目录，或者优化查找结构
				// 由于 dirSummaryMap key 是 path，我们可以构造子目录路径来查找？不，子目录名未知
				// 只能遍历 dirSummaryMap 或者预先建立父子索引。
				// 简单起见，遍历 dirSummaryMap (内存操作，速度尚可)
				// 优化：使用预先构建的目录树结构？
				// 这里使用简单的遍历，假设目录数不会特别巨大
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

				// 判断是否需要更新
				let needsUpdate = false
				const oldSummary = dirSummaryMap.get(dirPath)

				if (!oldSummary) {
					// 没有旧摘要，必须更新
					needsUpdate = true
				} else if (hasUpdatedSubDir) {
					// 子目录有更新，父目录必须更新
					needsUpdate = true
				} else {
					// 检查子文件是否有更新（通过时间戳对比）
					// oldSummary.timestamp 是 ISO 字符串
					const oldTime = new Date(oldSummary.timestamp).getTime()
					
					// 检查是否有任何子文件的时间戳晚于目录摘要时间戳
					const hasNewerFile = subFiles.some(f => {
						// 注意：FileSummary 中的 timestamp 是 ISO 字符串
						// 但我们需要的是文件修改时间。FileSummary 包含 lastModified (number)
						return f.lastModified > oldTime
					})
					
					if (hasNewerFile) {
						needsUpdate = true
					}
				}

				// 如果不需要更新，跳过
				if (!needsUpdate) {
					continue
				}

				// 标记该目录为已更新
				dirsToUpdate.add(dirPath)

				// 检查终止状态
				if (this.shouldPause()) {
					this.logger.info("[DirectorySummarizer] 分析被暂停")
					break
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
				
				this.logger.info(`[DirectorySummarizer] 目录摘要生成: ${dirPath}`)
				
				onProgress?.({
					phase: "directory_analysis",
					message: `正在分析目录: ${dirPath}`,
					totalFiles: sortedDirs.length, // 使用总目录数作为分母，虽然不准确但能反映整体进度
					filesToProcess: sortedDirs.length,
					totalProcessedFiles: processedCount, // 这里其实是已更新的数量
					batchProcessedFilePaths: [dirPath],
					batchFailedFiles: 0,
				})
			}

			// 6. 保存所有摘要（全量重写，确保一致性）
			if (!this.shouldPause()) {
				// 先清除旧文件
				await this.clear()
				
				// 写入新数据 - 仅保存当前存在的目录（清理幽灵目录）
				// dirSummaryMap 可能包含旧的已删除目录，我们需要过滤只保留 sortedDirs 中的目录
				const finalSummaries: DirectorySummary[] = []
				const validDirs = new Set(sortedDirs)
				
				for (const [path, summary] of dirSummaryMap.entries()) {
					if (validDirs.has(path)) {
						finalSummaries.push(summary)
					}
				}

				// 使用批量写入
				await this.storage!.addBatch(DIRECTORY_SUMMARIES_FILE, finalSummaries)

				this.logger.info(`[DirectorySummarizer] 目录分析完成，共保存 ${finalSummaries.length} 个摘要`)
			} else if (this.shouldPause()) {
				this.logger.info(`[DirectorySummarizer] 目录分析被暂停，保留现有数据不做清空重写`)
			}
		} catch (error) {
			throw ErrorHandler.wrapError(error, "目录分析")
		}
	}

	/**
	 * 计算受影响的目录
	 */
	private getAffectedDirectories(changedFiles: FileChanges): Set<string> {
		const affectedDirs = new Set<string>()
		const allChangedPaths = [
			...changedFiles.added.map((f) => f.path),
			...changedFiles.modified.map((f) => f.path),
			...changedFiles.deleted.map((f) => f.path),
		]

		for (const filePath of allChangedPaths) {
			let currentDir = path.dirname(filePath)
			// 向上冒泡直到根目录
			while (currentDir !== "." && currentDir !== "/" && currentDir !== "") {
				if (affectedDirs.has(currentDir)) {
					// 已经标记过，可以停止向上冒泡（假设路径是唯一的）
					// 但为了安全起见，还是继续，因为可能是从不同子路径汇聚上来的
				}
				affectedDirs.add(currentDir)
				currentDir = path.dirname(currentDir)
			}
			// 确保根目录也被标记（如果需要）
			// affectedDirs.add(".")
		}
		return affectedDirs
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

	private async saveSummaries(summaries: DirectorySummary[]): Promise<void> {
		// 由于改为逐个追加，此方法可能不再需要，或者用于全量覆盖
		// 这里保留用于兼容旧逻辑，如果需要全量重写
		try {
			// 注意：如果上面已经 add 了，这里 overwrite 会导致重复或覆盖
			// 建议在 summarizeDirectories 开始时 clear，然后 add
			// 或者在这里统一 overwrite
			// 鉴于 summarizeDirectories 中已经使用了 add，这里不再执行 overwrite，除非是想做最终的一致性保存
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
