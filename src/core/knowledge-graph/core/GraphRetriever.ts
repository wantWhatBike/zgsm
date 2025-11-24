import { ILogger } from "../../../utils/logger"
import { SearchResult, SearchQuery } from "../types"
import { RootInfo } from "../types"
import { DirectorySummarizer } from "./DirectorySummarizer"
import { FileSummarizer } from "./FileSummarizer"
import { RootAnalyzer } from "./RootAnalyzer"
import * as path from "path"
import type { GraphData, GraphNode, GraphLink } from "@roo-code/types"

/**
 * 知识图谱检索器
 * 负责高效检索知识图谱中的信息，为LLM提供项目上下文
 */
export class GraphRetriever {
	private logger: ILogger
    private rootAnalyzer: RootAnalyzer
	private fileSummrizer: FileSummarizer
	private directorySummarizer: DirectorySummarizer

	constructor(logger: ILogger, rootAnalyzer: RootAnalyzer, fileSummrizer: FileSummarizer, directorySummarizer: DirectorySummarizer) {
		this.logger = logger
        this.rootAnalyzer = rootAnalyzer
		this.directorySummarizer = directorySummarizer
		this.fileSummrizer = fileSummrizer
	}

	/**
	 * 搜索知识图谱
	 * @param query 搜索查询
	 * @returns 搜索结果
	 */
	public async search(workapcePath: string, query: SearchQuery): Promise<SearchResult[]> {
		this.logger?.info(`[GraphRetriever] 搜索: ${JSON.stringify(query)}`)
		// TODO: 实现搜索逻辑
		return []
	}

	/**
	 * 搜索文件摘要 - 用于 search_codes 工具
	 * @param keywords 关键词列表
	 * @param type 检索类型：'precise' 精确检索，'fuzzy' 模糊检索
	 * @param maxResults 最大返回结果数
	 * @returns 搜索到的文件摘要列表
	 */
	public async searchFileSummaries(
		keywords: string[],
		type: "precise" | "fuzzy",
		maxResults: number = 5,
	): Promise<Array<{
		path: string
		description: string
		match_functions: string[]
		dependencies: string[]
	}>> {
		this.logger?.info(`[GraphRetriever] 搜索文件摘要: keywords=${JSON.stringify(keywords)}, type=${type}`)

		try {
			// 1. 获取所有文件摘要
			const fileSummaries = await this.fileSummrizer.getFileSummaries()
			if (!fileSummaries || fileSummaries.length === 0) {
				this.logger?.warn(`[GraphRetriever] 没有文件摘要数据`)
				return []
			}

			// 2. 并行检索三个字段
			const matchedFiles = new Map<string, {
				summary: any
				matchedFunctions: Set<string>
				matchScore: number
				firstKeywordIndex: number
			}>()

			for (const summary of fileSummaries) {
				const matchedFunctions = new Set<string>()
				let matchScore = 0
				let firstKeywordIndex = keywords.length // 初始化为最大值

				for (let i = 0; i < keywords.length; i++) {
					const keyword = keywords[i]
					const keywordLower = keyword.toLowerCase()
					let matched = false

					// 检索 description 字段（都是模糊检索，大小写不敏感）
					if (summary.description && summary.description.toLowerCase().includes(keywordLower)) {
						matchScore += 3 // description 匹配权重为 3
						matched = true
					}

					// 检索 keywords 字段
					if (summary.keywords && Array.isArray(summary.keywords)) {
						if (type === "precise") {
							// 精确检索：完全匹配
							if (summary.keywords.some((k: string) => k.toLowerCase() === keywordLower)) {
								matchScore += 5 // keywords 精确匹配权重为 5
								matched = true
							}
						} else {
							// 模糊检索：包含关键词
							if (summary.keywords.some((k: string) => k.toLowerCase().includes(keywordLower))) {
								matchScore += 4 // keywords 模糊匹配权重为 4
								matched = true
							}
						}
					}

					// 检索 functions 字段
					if (summary.functions && typeof summary.functions === "object") {
						const functionNames = Object.keys(summary.functions)
						for (const funcName of functionNames) {
							const funcNameLower = funcName.toLowerCase()
							let funcMatched = false

							if (type === "precise") {
								// 精确检索：函数名完全等于关键词
								if (funcNameLower === keywordLower) {
									matchedFunctions.add(funcName)
									funcMatched = true
								}
							} else {
								// 模糊检索：函数名包含关键词
								if (funcNameLower.includes(keywordLower)) {
									matchedFunctions.add(funcName)
									funcMatched = true
								}
							}

							if (funcMatched) {
								matchScore += 2 // function 匹配权重为 2
								matched = true
							}
						}
					}

					// 记录第一个匹配的关键词索引
					if (matched && i < firstKeywordIndex) {
						firstKeywordIndex = i
					}
				}

				// 如果有匹配，添加到结果集
				if (matchScore > 0) {
					matchedFiles.set(summary.path, {
						summary,
						matchedFunctions,
						matchScore,
						firstKeywordIndex,
					})
				}
			}

			// 3. 排序：按输入关键词顺序排序
			const sortedResults = Array.from(matchedFiles.entries())
				.sort(([, a], [, b]) => {
					// 首先按第一个匹配的关键词索引排序
					if (a.firstKeywordIndex !== b.firstKeywordIndex) {
						return a.firstKeywordIndex - b.firstKeywordIndex
					}
					// 如果匹配同一个关键词，按匹配分数排序
					if (a.matchScore !== b.matchScore) {
						return b.matchScore - a.matchScore
					}
					// 最后按文件路径字母序排序
					return a.summary.path.localeCompare(b.summary.path)
				})
				.slice(0, maxResults)

			// 4. 格式化结果
			const results = sortedResults.map(([, data]) => ({
				path: data.summary.path,
				description: data.summary.description || "",
				match_functions: Array.from(data.matchedFunctions),
				dependencies: data.summary.dependencies || [],
			}))

			this.logger?.info(`[GraphRetriever] 搜索到 ${results.length} 个文件`)

			return results
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "搜索文件摘要失败"
			this.logger?.error(`[GraphRetriever] 搜索文件摘要失败: ${errorMessage}`)
			throw new Error(`搜索文件摘要失败: ${errorMessage}`)
		}
	}

	/**
	 * 获取项目根信息 - 从root_info.json读取
	 */
	public async getRootInfo(): Promise<RootInfo | undefined> {
		return await this.rootAnalyzer.getRootInfo()
	}

	/**
	 * 获取图谱数据 - 用于可视化
	 * @param workspacePath 工作区路径
	 * @returns 图谱数据（节点和边）
	 */
	public async getGraphData(workspacePath: string): Promise<GraphData> {
		this.logger?.info(`[GraphRetriever] 开始获取图谱数据: ${workspacePath}`)
		
		try {
			// 1. 获取所有文件摘要和目录摘要
			this.logger?.info(`[GraphRetriever] 正在获取文件摘要...`)
			const fileSummaries = await this.fileSummrizer.getFileSummaries()
			this.logger?.info(`[GraphRetriever] 文件摘要数量: ${fileSummaries?.length || 0}`)
			
			this.logger?.info(`[GraphRetriever] 正在获取目录摘要...`)
			const directorySummaries = await this.directorySummarizer.getDirectorySummaries(workspacePath)
			this.logger?.info(`[GraphRetriever] 目录摘要数量: ${directorySummaries?.length || 0}`)

			if (!fileSummaries || fileSummaries.length === 0) {
				this.logger?.warn(`[GraphRetriever] 没有文件摘要数据`)
				return { nodes: [], links: [] }
			}

			// 2. 构建节点
			this.logger?.info(`[GraphRetriever] 开始构建节点...`)
			const nodes: GraphNode[] = []
			const nodeMap = new Map<string, GraphNode>()

			// 添加目录节点
			if (directorySummaries) {
				this.logger?.info(`[GraphRetriever] 添加目录节点...`)
				for (const dirSummary of directorySummaries) {
					const dirPath = dirSummary.path || ""
					if (!dirPath || dirPath === "." || dirPath === "") continue

					const parentPath = path.dirname(dirPath)
					const parentId = parentPath === "." || parentPath === "" ? undefined : parentPath

					const node: GraphNode = {
						id: dirPath,
						label: path.basename(dirPath) || dirPath,
						type: 'directory',
						parentId: parentId,
						description: dirSummary.description,
					}

					nodes.push(node)
					nodeMap.set(dirPath, node)
				}
			}

			// 添加文件节点
			this.logger?.info(`[GraphRetriever] 添加文件节点...`)
			for (const fileSummary of fileSummaries) {
				const filePath = fileSummary.path
				if (!filePath) continue

				const dirPath = path.dirname(filePath)
				const parentId = dirPath === "." || dirPath === "" ? undefined : dirPath

				const node: GraphNode = {
					id: filePath,
					label: path.basename(filePath),
					type: 'file',
					fileType: fileSummary.type,
					parentId: parentId,
					description: fileSummary.description,
				}

				nodes.push(node)
				nodeMap.set(filePath, node)
			}

			// 3. 构建边
			this.logger?.info(`[GraphRetriever] 开始构建边...`)
			const links: GraphLink[] = []

			// 3.1 构建 Contains 关系（父子包含关系）
			this.logger?.info(`[GraphRetriever] 构建 Contains 关系...`)
			for (const node of nodes) {
				if (node.parentId && nodeMap.has(node.parentId)) {
					links.push({
						source: node.parentId,
						target: node.id,
						type: 'contains',
					})
				}
			}

			// 3.2 构建 Import 关系（文件依赖关系）
			this.logger?.info(`[GraphRetriever] 构建 Import 关系...`)
			for (const fileSummary of fileSummaries) {
				if (!fileSummary.dependencies || fileSummary.dependencies.length === 0) continue

				const sourcePath = fileSummary.path
				if (!sourcePath || !nodeMap.has(sourcePath)) continue

				for (const depPath of fileSummary.dependencies) {
					// 尝试匹配依赖路径（可能是相对路径或绝对路径）
					// 这里简化处理：如果依赖路径在节点映射中存在，则创建边
					if (nodeMap.has(depPath)) {
						links.push({
							source: sourcePath,
							target: depPath,
							type: 'import',
						})
					}
				}
			}

			this.logger?.info(`[GraphRetriever] 图谱数据构建完成: ${nodes.length} 个节点, ${links.length} 条边`)

			return { nodes, links }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "获取图谱数据失败"
			this.logger?.error(`[GraphRetriever] 获取图谱数据失败: ${errorMessage}`)
			throw new Error(`获取图谱数据失败: ${errorMessage}`)
		}
	}
}
