/**
 * 根目录分析器 - 分析项目根目录信息
 */

import * as fs from "fs/promises"
import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { ROOT_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { RootInfo, KnowledgeGraphConfig, FileInfo } from "../types"
import { KEY_FILE_PATTERNS, LLM_LANGUAGE, IGNORE_PATTERNS } from "../constants"
import { ErrorHandler } from "../errors/ErrorHandler"
import { IStorage } from "../storage/IStorage"
import { ILogger } from "../../../utils/logger"
import { StorageUtils } from "../storage/StorageUtils"

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

			// 1. 收集关键文件
			const keyFiles = await this.collectKeyFiles(workspacePath)
			this.logger.info(`[RootAnalyzer] 收集关键文件: ${keyFiles.length}个`)

			// 2. 读取文件内容
			const fileContents = await this.readKeyFiles(keyFiles)

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
	 * @returns 关键文件绝对路径数组（数量 ≤ maxKeyFiles）
	 */
	private async collectKeyFiles(workspace: string): Promise<string[]> {

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
							found.push(fullPath)
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
			project_description: `项目目标和定位描述（${LLM_LANGUAGE}）`,
			tech_stack: ["技术1", "技术2", "技术3"],
			core_modules: ["模块1：路径", "模块2：路径", "模块3：路径"],
			core_dependencies: ["依赖1", "依赖2", "依赖3"],
			environment_requirements: ["环境要求1", "环境要求2"],
			build_steps: ["构建步骤1", "构建步骤2"],
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
