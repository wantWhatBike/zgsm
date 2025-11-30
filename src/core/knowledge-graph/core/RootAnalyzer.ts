/**
 * 根目录分析器 - 分析项目根目录信息
 */

import * as fs from "fs/promises"
import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { ROOT_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { RootInfo, KnowledgeGraphConfig, FileInfo, KeyFileSnapshot } from "../types"
import { KEY_FILE_PATTERNS, LLM_LANGUAGE, IGNORE_PATTERNS, KEY_FILE_DETECTION_CONFIG } from "../constants"
import { ErrorHandler } from "../errors/ErrorHandler"
import { IStorage } from "../storage/IStorage"
import { ILogger } from "../../../utils/logger"
import { StorageUtils } from "../storage/StorageUtils"
import { getFileHash } from "../tools/FileUtils"

const ROOT_INFO_FILE = "root_info.json"
const MAX_DEPTH = 4 // 增加扫描深度，支持 Monorepo 结构

export class RootAnalyzer {
	private llmClient: LLMClient
	private maxKeyFiles: number
	private logger: ILogger
	private storage: IStorage
	private config: KnowledgeGraphConfig

	constructor(
		llmClient: LLMClient,
		storage: IStorage,
		config: KnowledgeGraphConfig,
		logger: ILogger,
		maxKeyFiles: number = 10,
	) {
		this.llmClient = llmClient
		this.logger = logger
		this.config = config
		this.storage = storage
		this.maxKeyFiles = maxKeyFiles
	}

	/**
	 * 分析项目根目录
	 */
	async analyzeRoot(workspacePath: string, files: FileInfo[]): Promise<RootInfo> {
		try {
			this.logger.info("[RootAnalyzer] 开始根目录分析")

			// ✅ 1. 收集关键文件路径（只收集一次）
			const keyFiles = await this.collectKeyFiles(workspacePath)
			this.logger.info(`[RootAnalyzer] 收集关键文件: ${keyFiles.length}个`)

			// ✅ 2. 读取文件内容
			const fileContents = await this.readKeyFiles(keyFiles)
			
			// ✅ 3. 生成关键文件快照（复用 keyFiles，只计算 hash）
			const snapshot = await this.generateKeyFilesSnapshot(keyFiles)

			// 3. 获取项目文件列表
			const fileList = files.map((f) => f.path)

			// 4. 验证输入内容
			const formattedFileContents = formatFileContents(fileContents)
			const formattedFileList = formatFileList(fileList)

			// 确保有足够的内容进行分析
			if (formattedFileContents.trim().length === 0 && formattedFileList.trim().length === 0) {
				throw ErrorHandler.createFileReadError("项目根目录", new Error("没有找到可分析的项目文件"))
			}

			// 4. 构建提示词
			const userPrompt = buildPrompt(ROOT_ANALYSIS_PROMPT, {
				fileContents: formattedFileContents,
				fileList: formattedFileList,
			})

			// 验证提示词不为空
			if (userPrompt.trim().length === 0) {
				throw ErrorHandler.createInvalidResponseError("构建的提示词为空，无法进行根目录分析")
			}

			// 5. 发送LLM请求
			const response = await this.llmClient.sendStructuredRequest<RootInfo>(userPrompt, this.getRootInfoSchema())

			if (!response.success || !response.data) {
				throw ErrorHandler.createInvalidResponseError(`根目录分析失败: ${response.error || "未知错误"}`)
			}

		// 6. 验证和清理数据
		const rootInfo = this.validateAndCleanRootInfo(response.data)
		
		// ✅ 7. 保存关键文件快照（已在 readKeyFilesWithSnapshot 中生成）
		rootInfo.keyFilesSnapshot = snapshot
		rootInfo.lastAnalyzedTime = new Date().toISOString()
		
		this.logger.info(`[RootAnalyzer] 关键文件快照已生成: ${Object.keys(snapshot).length} 个文件`)
		
		await this.storage.overwrite(ROOT_INFO_FILE, rootInfo)
		this.logger.info("[RootAnalyzer] 根目录分析完成")
		return rootInfo
		} catch (error) {
			throw ErrorHandler.wrapError(error, "根目录分析")
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
	 * 按优先级收集关键文件（文档 > 依赖配置 > 项目配置 > 构建部署）
	 * ✅ 在收集时就过滤：大小、数量限制
	 * 
	 * @returns 关键文件绝对路径数组（数量 ≤ maxKeyFiles，大小 ≤ fileSizeLimit）
	 */
	private async collectKeyFiles(workspace: string): Promise<string[]> {
		// ✅ 文件大小限制（用于过滤）
		const MAX_KEY_FILE_SIZE = Math.min(
			this.config.fileSizeLimit,
			KEY_FILE_DETECTION_CONFIG.MAX_KEY_FILE_SIZE
		)

		// 2. 大小写不敏感的模式匹配函数
		const isMatch = (filename: string, patterns: string[]): boolean => {
			const lowerFilename = filename.toLowerCase()
			return patterns.some((pattern) => {
				const lowerPattern = pattern.toLowerCase()
				// 前缀匹配（如dockerfile*）
				if (lowerPattern.endsWith("*")) {
					const prefix = lowerPattern.slice(0, -1)
					return lowerFilename.startsWith(prefix)
				}
				// 后缀匹配（如*.csproj）
				if (lowerPattern.startsWith("*.")) {
					const suffix = lowerPattern.slice(1)
					return lowerFilename.endsWith(suffix)
				}
				// 精确匹配（如package.json）
				return lowerFilename === lowerPattern
			})
		}

		// 3. 递归查找文件
		const findFilesByPatterns = async (dir: string, patterns: string[], depth: number): Promise<string[]> => {
			if (depth > MAX_DEPTH) return []
			const found: string[] = []

			try {
				const entries = await fs.readdir(dir, { withFileTypes: true })

				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name)

					// 忽略检查：node_modules, 隐藏文件, 以及 IGNORE_PATTERNS
					if (
						entry.name === "node_modules" ||
						entry.name.startsWith(".") ||
						IGNORE_PATTERNS.some((p) => entry.name === p.replace(/\/$/, ""))
					) {
						continue
					}

					if (entry.isFile()) {
						if (isMatch(entry.name, patterns)) {
							// ✅ 在收集时就检查文件大小
							try {
								const stats = await fs.stat(fullPath)
								if (stats.size <= MAX_KEY_FILE_SIZE) {
									found.push(fullPath)
								} else {
									this.logger.warn(
										`[RootAnalyzer] 关键文件 ${entry.name} 过大 (${(stats.size / 1024 / 1024).toFixed(2)}MB)，跳过收集`
									)
								}
							} catch (error) {
								this.logger.warn(`[RootAnalyzer] 无法检查文件 ${fullPath}，已跳过`)
							}
						}
					} else if (entry.isDirectory()) {
						const subFound = await findFilesByPatterns(fullPath, patterns, depth + 1)
						found.push(...subFound)
					}
				}
			} catch (e) {
				// ignore access errors
				this.logger.warn(`无法读取目录 ${dir}，已跳过`)
			}
			return found
		}

		// 4. 按优先级收集文件（去重+数量控制）
		const collectedPaths = new Set<string>() // 用于去重
		const result: string[] = []

		for (const patterns of KEY_FILE_PATTERNS) {
			// 使用递归查找
			const files = await findFilesByPatterns(workspace, patterns, 0)

			for (const file of files) {
				if (!collectedPaths.has(file)) {
					collectedPaths.add(file)
					result.push(file)
					if (result.length >= this.maxKeyFiles) {
						return result // 达到最大数量，直接返回
					}
				}
			}
		}

		return result
	}

	/**
	 * 读取关键文件内容
	 */
	private async readKeyFiles(filePaths: string[]): Promise<Array<{ path: string; content: string }>> {
		const contents: Array<{ path: string; content: string }> = []

		for (const filePath of filePaths) {
			try {
				const stat = await fs.stat(filePath)

				if (stat.isFile() && stat.size < this.config.fileSizeLimit) {
					const content = await fs.readFile(filePath, "utf-8")
					contents.push({
						path: filePath,
						content: this.truncateContent(content, this.config.fileLinesLimit), // 限制内容长度
					})
				}
			} catch (error) {
				this.logger.warn(`[RootAnalyzer] 读取文件失败: ${filePath}`, error)
				// 继续处理其他文件
			}
		}

		return contents
	}

	/**
	 * 截断内容
	 */
	private truncateContent(content: string, maxLines: number): string {
		let lines = content.split("\n")
		if (lines.length <= maxLines) {
			return content
		}
		return lines.slice(0, maxLines).join("\n") + "\n...(内容已被截断)"
	}

	/**
	 * 获取根信息模式
	 */
	private getRootInfoSchema(): any {
		return {
			project_description: "Project purpose and positioning",
			tech_stack: ["tech1", "tech2", "tech3"],
			core_modules: ["Module1: path/to/module1", "Module2: path/to/module2"],
			core_dependencies: ["dependency1", "dependency2"],
			environment_requirements: ["requirement1", "requirement2"],
			build_steps: ["step1", "step2"],
		}
	}

	/**
	 * 验证和清理根信息
	 */
	private validateAndCleanRootInfo(rootInfo: RootInfo): RootInfo {
		// 确保所有必需字段都存在
		const cleaned: RootInfo = {
			project_description: rootInfo.project_description || "",
			tech_stack: Array.isArray(rootInfo.tech_stack) ? rootInfo.tech_stack.slice(0, 10) : [],
			core_modules: Array.isArray(rootInfo.core_modules) ? rootInfo.core_modules.slice(0, 10) : [],
			core_dependencies: Array.isArray(rootInfo.core_dependencies) ? rootInfo.core_dependencies.slice(0, 10) : [],
			environment_requirements: Array.isArray(rootInfo.environment_requirements)
				? rootInfo.environment_requirements
				: [],
			build_steps: Array.isArray(rootInfo.build_steps) ? rootInfo.build_steps : [],
		}
		return cleaned
	}

	/**
	 * 保存项目根信息 - 保存为root_info.json
	 */
	async saveRootInfo(rootInfo: RootInfo): Promise<void> {
		try {
			await this.storage.overwrite(ROOT_INFO_FILE, rootInfo)
		} catch (error) {
			throw new Error(`保存项目根信息失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 获取项目根信息 - 从root_info.json读取
	 */
	async getRootInfo(): Promise<RootInfo | undefined> {
		try {
			const content = await this.storage.load(ROOT_INFO_FILE)
			if (!content) {
				return undefined
			}
			return StorageUtils.deserialize<RootInfo>(content)
		} catch (error) {
			this.logger.warn("[RootAnalyzer] 获取项目根信息失败:", error)
			throw new Error(`get root info failed： ${error}`)
		}
	}

	/**
	 * 生成关键文件快照（基于已收集的文件列表）
	 * ✅ 单一职责：只负责计算 hash，不负责查找和过滤
	 * ✅ DRY 原则：复用 collectKeyFiles() 的结果（已过滤）
	 * 
	 * @param keyFilePaths 已收集且已过滤的关键文件路径列表
	 * @returns 文件路径 → KeyFileSnapshot 的映射
	 */
	private async generateKeyFilesSnapshot(keyFilePaths: string[]): Promise<Record<string, KeyFileSnapshot>> {
		const snapshot: Record<string, KeyFileSnapshot> = {}
		const HASH_TIMEOUT = KEY_FILE_DETECTION_CONFIG.HASH_TIMEOUT_MS
		
		// ✅ 遍历已过滤的文件列表，只需计算 hash
		for (const filePath of keyFilePaths) {
			try {
				const stats = await fs.stat(filePath)
				
				// 带超时的 hash 计算
				const hashPromise = getFileHash(filePath)
				const timeoutPromise = new Promise<never>((_, reject) => 
					setTimeout(() => reject(new Error('Hash calculation timeout')), HASH_TIMEOUT)
				)
				
				const hash = await Promise.race([hashPromise, timeoutPromise])
				
				snapshot[filePath] = {
					hash,
					exists: true,
					size: stats.size
				}
			} catch (error) {
				if (error instanceof Error && error.message === 'Hash calculation timeout') {
					this.logger.warn(`[RootAnalyzer] 计算 ${filePath} hash 超时，跳过`)
					snapshot[filePath] = {
						hash: 'timeout',
						exists: true
					}
				} else {
					this.logger.warn(`[RootAnalyzer] 处理文件 ${filePath} 失败:`, error)
					snapshot[filePath] = {
						hash: null,
						exists: false
					}
				}
			}
		}
		
		return snapshot
	}

	/**
	 * 检查关键文件是否发生变更
	 * @returns true 表示需要重新分析，false 表示可以使用缓存
	 */
	private hasKeyFilesChanged(
		oldSnapshot: Record<string, KeyFileSnapshot> | undefined,
		newSnapshot: Record<string, KeyFileSnapshot>
	): boolean {
		// 首次构建或旧版本数据（没有 snapshot）
		if (!oldSnapshot) {
			this.logger.info("[RootAnalyzer] 首次构建或旧版本数据，需要分析")
			return true
		}
		
		const oldKeys = Object.keys(oldSnapshot)
		const newKeys = Object.keys(newSnapshot)
		
		// 检查关键文件列表是否变化（理论上不会，但防御性检查）
		if (oldKeys.length !== newKeys.length) {
			this.logger.info("[RootAnalyzer] 关键文件列表长度变化，需要重新分析")
			return true
		}
		
		// 检查每个关键文件
		for (const key of newKeys) {
			const oldFile = oldSnapshot[key]
			const newFile = newSnapshot[key]
			
			if (!oldFile) {
				this.logger.info(`[RootAnalyzer] 检测到新的关键文件: ${key}`)
				return true
			}
			
			// 文件存在性变化（新增或删除）
			if (oldFile.exists !== newFile.exists) {
				this.logger.info(`[RootAnalyzer] 关键文件存在性变化: ${key} (${oldFile.exists} → ${newFile.exists})`)
				return true
			}
			
			// 文件内容变化（hash 不同）
			if (oldFile.exists && newFile.exists && oldFile.hash !== newFile.hash) {
				this.logger.info(`[RootAnalyzer] 关键文件内容变化: ${key}`)
				return true
			}
		}
		
		this.logger.info("[RootAnalyzer] 关键文件未发生变化，可使用缓存")
		return false
	}

	/**
	 * 判断是否需要重新分析 root
	 * @param workspacePath 工作区路径
	 * @param oldRootInfo 旧的 root 信息
	 * @returns true 表示需要重新分析
	 */
	async shouldReanalyzeRoot(workspacePath: string, oldRootInfo: RootInfo | undefined): Promise<boolean> {
		// 没有旧数据，需要分析
		if (!oldRootInfo) {
			return true
		}
		
		// ✅ 收集关键文件路径（复用 collectKeyFiles 逻辑）
		const keyFiles = await this.collectKeyFiles(workspacePath)
		
		// ✅ 生成当前快照
		const newSnapshot = await this.generateKeyFilesSnapshot(keyFiles)
		
		// 检查是否有变化
		return this.hasKeyFilesChanged(oldRootInfo.keyFilesSnapshot, newSnapshot)
	}

	/**
	 * 删除项目根信息
	 */
	async clear(): Promise<void> {
		try {
			return this.storage.clear(ROOT_INFO_FILE)
		} catch (error) {
			throw new Error(`删除root_info.json失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}
