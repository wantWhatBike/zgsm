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
	private isAborted: boolean = false

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
	 * 检查是否应该中止分析（用于暂停功能）
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

			// 1. 获取所有文件摘要
			const fileSummaries = await this.fileAnalyzer.getFileSummaries(["path", "description"])
			if (!fileSummaries) {
				throw new Error("无法获取文件摘要，无法继续目录分析")
			}

			// 2. 提取所有目录并计算深度
			const dirDepths = new Map<string, number>()
			const dirFiles = new Map<string, Pick<FileSummary, "path" | "description">[]>()

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

			// 4. 准备增量更新
			const dirSummaryMap = new Map<string, DirectorySummary>()
			let affectedDirs = new Set<string>()

			// 如果有变更文件，计算受影响的目录
			if (changedFiles) {
				affectedDirs = this.getAffectedDirectories(changedFiles)
				this.logger.info(`[DirectorySummarizer] 增量更新: ${affectedDirs.size} 个目录受影响`)
				
				// 加载现有的目录摘要到内存，作为基准
				const existingSummaries = await this.getDirectorySummaries("")
				if (existingSummaries) {
					existingSummaries.forEach(s => dirSummaryMap.set(s.path, s))
				}
				
				// 清除受影响目录的旧摘要（可选，因为后面会覆盖，但为了逻辑清晰）
				// 实际上不需要清除，因为如果生成失败可能还需要旧的？不，生成失败应该报错。
			} else {
				// 全量更新，affectedDirs 为空表示全部处理（或者我们可以把所有目录都加进去）
				// 为了逻辑统一，如果是全量，我们将所有 sortedDirs 视为受影响
				sortedDirs.forEach(d => affectedDirs.add(d))
			}

			// 5. 迭代处理
			const directorySummaries: DirectorySummary[] = []
			// 准备全量文件列表字符串（仅计算一次）
			const allFileListStr = formatFileList(files.map((f) => f.path))

			let processedCount = 0
			// 仅统计需要处理的目录数
			const dirsToProcess = sortedDirs.filter(d => affectedDirs.has(d) || !changedFiles).length
			
			// 如果是增量更新，我们需要先清空存储文件，然后重写所有摘要（包括未变更的）
			// 或者使用追加模式？目前的 storage.add 是追加。
			// 为了保证文件内容的整洁（无重复），建议全量重写。
			// 策略：内存中维护完整的 dirSummaryMap (旧的 + 新生成的)，最后统一保存。
			
			for (const dirPath of sortedDirs) {
				// 检查中止状态
				if (this.isAborted) {
					this.logger.info("[DirectorySummarizer] 分析被中止")
					break
				}

				// 检查暂停
				if (this.shouldPause()) {
					this.logger.info("[DirectorySummarizer] 分析被暂停")
					break
				}

				const depth = dirDepths.get(dirPath) || 0

				if (depth > MAX_DIR_DEPTH) {
					continue
				}

				// 检查是否需要更新
				// 如果是全量更新(changedFiles undefined)，或者该目录在受影响列表中
				const needsUpdate = !changedFiles || affectedDirs.has(dirPath)

				if (!needsUpdate) {
					// 不需要更新，直接使用旧摘要（已在 dirSummaryMap 中）
					const oldSummary = dirSummaryMap.get(dirPath)
					if (oldSummary) {
						directorySummaries.push(oldSummary)
					}
					continue
				}

				// 获取直接子文件摘要
				const subFiles = dirFiles.get(dirPath) || []

				// 获取直接子目录摘要
				const subDirs: DirectorySummary[] = []
				for (const [childPath, summary] of dirSummaryMap.entries()) {
					if (path.dirname(childPath) === dirPath) {
						subDirs.push(summary)
					}
				}

				if (subFiles.length === 0 && subDirs.length === 0) {
					continue
				}

				// 生成当前目录摘要
				const summary = await this.generateDirectorySummary(
					dirPath,
					rootInfo,
					allFileListStr,
					subFiles,
					subDirs,
				)

				// 生成后再次检查中止状态
				if (this.isAborted) break

				if (summary) {
					directorySummaries.push(summary)
					dirSummaryMap.set(dirPath, summary)
				}

				processedCount++
				onProgress?.({
					phase: "directory_analysis",
					message: `正在分析目录: ${dirPath}`,
					totalFiles: dirsToProcess,
					filesToProcess: dirsToProcess,
					totalProcessedFiles: processedCount,
					batchProcessedFilePaths: [dirPath],
					batchFailedFiles: 0,
				})
			}

			// 6. 保存所有摘要（全量重写，确保一致性）
			if (!this.isAborted && !this.shouldPause()) {
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
		subFiles: Pick<FileSummary, "path" | "description">[],
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
