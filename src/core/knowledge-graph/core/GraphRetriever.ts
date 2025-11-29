import { ILogger } from "../../../utils/logger"
import { SearchResult, SearchQuery, SearchCodesResult, MatchedFunction, FunctionCallChain } from "../types"
import { RootInfo } from "../types"
import { DirectorySummarizer } from "./DirectorySummarizer"
import { FileSummarizer } from "./FileSummarizer"
import { RootAnalyzer } from "./RootAnalyzer"
import * as path from "path"
import type { GraphData, GraphNode, GraphLink } from "@roo-code/types"
import { ZgsmCodebaseIndexManager } from "../../costrict/codebase-index"
import type { CallGraphNode, CallGraphResponse, ApiResponse } from "../../costrict/codebase-index/types"

/**
 * 调用链查询超时时间（毫秒）
 */
const CALLGRAPH_TIMEOUT_MS = 2000

/**
 * 带超时的 Promise 包装器
 * @param promise 原始 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param timeoutError 超时错误信息
 * @returns 带超时控制的 Promise
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => 
			setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
		)
	])
}

/**
 * 知识图谱检索器
 * 负责高效检索知识图谱中的信息，为LLM提供项目上下文
 */
export class GraphRetriever {
	private logger: ILogger
    private rootAnalyzer: RootAnalyzer
	private fileSummrizer: FileSummarizer
	private directorySummarizer: DirectorySummarizer
	private workspacePath: string

	constructor(logger: ILogger, rootAnalyzer: RootAnalyzer, fileSummrizer: FileSummarizer, directorySummarizer: DirectorySummarizer, workspacePath: string) {
		this.logger = logger
        this.rootAnalyzer = rootAnalyzer
		this.directorySummarizer = directorySummarizer
		this.fileSummrizer = fileSummrizer
		this.workspacePath = workspacePath
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
	 * @returns 搜索到的文件摘要列表（包含调用链信息）
	 */
	public async searchFileSummaries(
		keywords: string[],
		type: "precise" | "fuzzy",
		maxResults: number = 5,
	): Promise<SearchCodesResult[]> {
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

			// 4. 格式化结果并enrichWithCallGraph调用链信息
			const results: SearchCodesResult[] = []
			for (const [, data] of sortedResults) {
				const matchedFunctions = await this.enrichWithCallGraph(
					data.summary.path,
					data.matchedFunctions,
					data.summary.functions || {}
				)

				results.push({
					path: data.summary.path,
					description: data.summary.description || "",
					match_functions: matchedFunctions,
					dependencies: data.summary.dependencies || [],
				})
			}

			this.logger?.info(`[GraphRetriever] 搜索到 ${results.length} 个文件`)

			return results
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "搜索文件摘要失败"
			this.logger?.error(`[GraphRetriever] 搜索文件摘要失败: ${errorMessage}`)
			throw new Error(`搜索文件摘要失败: ${errorMessage}`)
		}
	}

	/**
	 * 为匹配的函数enrichWithCallGraph调用链信息
	 * @param filePath 文件路径
	 * @param matchedFunctions 匹配的函数名集合
	 * @param functionsMap 函数名到描述的映射
	 * @returns 包含调用链信息的函数列表
	 */
	private async enrichWithCallGraph(
		filePath: string,
		matchedFunctions: Set<string>,
		functionsMap: Record<string, string>
	): Promise<MatchedFunction[]> {
		const results: MatchedFunction[] = []

		// 获取 CodebaseIndexClient
		let client = null
		try {
			const manager = ZgsmCodebaseIndexManager.getInstance()
			client = manager.client
			
			// 检查客户端是否已初始化
			if (!client) {
				this.logger?.warn(`[GraphRetriever] CodebaseIndexClient 未初始化，跳过调用链查询`)
			}
		} catch (error) {
			this.logger?.warn(`[GraphRetriever] 无法获取 CodebaseIndexClient，跳过调用链查询: ${error}`)
		}

		// 如果无法获取客户端，返回不含调用链的结果
		if (!client) {
			for (const funcName of matchedFunctions) {
				results.push({
					name: funcName,
					description: functionsMap[funcName] || "",
				})
			}
			return results
		}

		// 并发查询每个函数的调用链
		const callGraphPromises = Array.from(matchedFunctions).map(async (funcName) => {
			const matchedFunc: MatchedFunction = {
				name: funcName,
				description: functionsMap[funcName] || "",
			}

			try {
				// 构建完整文件路径
				const fullFilePath = path.join(this.workspacePath, filePath)

				// 带超时的调用链查询
				const response: ApiResponse<CallGraphResponse> = await withTimeout(
					client.getCallGraph({
						clientId: client.getClientId(),
						codebasePath: this.workspacePath,
						filePath: fullFilePath,
						symbolName: funcName,
						maxLayer: 2,
						noContent: 1,
					}),
					CALLGRAPH_TIMEOUT_MS,
					`查询函数 ${funcName} 的调用链超时（${CALLGRAPH_TIMEOUT_MS}ms）`
				)

				if (response.success && response.data?.list && response.data.list.length > 0) {
					const callChain = this.parseCallGraph(response.data.list[0])
					if (callChain && callChain.callers.length > 0) {
						matchedFunc.callChain = callChain
					}
				} else if (!response.success) {
					// API 调用成功但返回失败状态
					this.logger?.warn(
						`[GraphRetriever] 查询函数 ${funcName} 的调用链失败: ${response.message || "未知错误"}，已忽略该调用链`
					)
				}
			} catch (error) {
				// 调用链查询失败或超时不影响基础结果
				const errorMessage = error instanceof Error ? error.message : String(error)
				
				if (errorMessage.includes("超时")) {
					this.logger?.warn(
						`[GraphRetriever] ${errorMessage}，已忽略该调用链`
					)
				} else {
					this.logger?.warn(
						`[GraphRetriever] 查询函数 ${funcName} 的调用链失败: ${errorMessage}，已忽略该调用链`
					)
				}
			}

			return matchedFunc
		})

		// 等待所有查询完成
		const enrichedResults = await Promise.all(callGraphPromises)
		return enrichedResults
	}

	/**
	 * 解析 CallGraph 节点树，提取上游调用链
	 * @param rootNode CallGraph 根节点（definition）
	 * @returns 调用链信息
	 */
	private parseCallGraph(rootNode: CallGraphNode): FunctionCallChain | null {
		const callers: Array<{
			filePath: string
			symbolName: string
			line: number
		}> = []

		// 递归收集所有调用者
		const collectCallers = (node: CallGraphNode, depth: number = 0) => {
			if (!node.children || node.children.length === 0) {
				return
			}

			for (const child of node.children) {
				if (child.nodeType === "reference") {
					callers.push({
						filePath: child.filePath,
						symbolName: child.symbolName,
						line: child.position.startLine,
					})
					// 递归处理子节点
					collectCallers(child, depth + 1)
				}
			}
		}

		collectCallers(rootNode)

		if (callers.length === 0) {
			return null
		}

		// 反转调用者列表，使其从最上层调用者到当前函数
		callers.reverse()

		return {
			callers,
			depth: callers.length,
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
	/**
	 * 获取图谱数据
	 * @param workspacePath 工作区路径
	 * @param maxNodes 最大节点数（用于限制返回的节点数量，避免OOM）
	 * @returns 图谱数据
	 */
	public async getGraphData(workspacePath: string, maxNodes?: number): Promise<GraphData> {
		this.logger?.info(`[GraphRetriever] ========== 获取图谱数据 ==========`)
		this.logger?.info(`[GraphRetriever] 工作区: ${workspacePath}`)
		this.logger?.info(`[GraphRetriever] 最大节点数限制: ${maxNodes || '无限制'}`)
		
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

			// 统计节点类型
			const fileNodes = nodes.filter(n => n.type === 'file')
			const dirNodes = nodes.filter(n => n.type === 'directory')
			
			this.logger?.info(`[GraphRetriever] 图谱数据构建完成（限制前）: ${nodes.length} 个节点（${fileNodes.length} 文件 + ${dirNodes.length} 目录）, ${links.length} 条边`)

			// 4. ✅ 如果设置了最大文件节点数限制，则按优先级筛选文件节点（目录节点全部保留）
			if (maxNodes && maxNodes > 0 && fileNodes.length > maxNodes) {
				this.logger?.info(`[GraphRetriever] 文件节点数超过限制（${fileNodes.length} > ${maxNodes}），开始按优先级筛选文件节点...`)
				
				// ✅ 按优先级排序文件节点（源码文件 > 测试文件）
				const prioritizedFileNodes = this.prioritizeFileNodes(fileNodes)
				
				// ✅ 限制文件节点数量
				const limitedFileNodes = prioritizedFileNodes.slice(0, maxNodes)
				
				// ✅ 保留所有目录节点 + 限制后的文件节点
				const limitedNodes = [...dirNodes, ...limitedFileNodes]
				const limitedNodeIds = new Set(limitedNodes.map(n => n.id))
				
				// 只保留连接限制节点之间的边
				const limitedLinks = links.filter(link => 
					limitedNodeIds.has(link.source) && limitedNodeIds.has(link.target)
				)
				
				this.logger?.info(`[GraphRetriever] ✅ 文件节点限制完成: ${limitedFileNodes.length}/${fileNodes.length} 文件节点（保留所有 ${dirNodes.length} 个目录节点）`)
				this.logger?.info(`[GraphRetriever] 总节点: ${limitedNodes.length} 个, 边: ${limitedLinks.length} 条`)
				this.logger?.info(`[GraphRetriever] 已移除: ${fileNodes.length - limitedFileNodes.length} 个文件节点, ${links.length - limitedLinks.length} 条边`)
				this.logger?.info(`[GraphRetriever] ================================================`)
				
				return { nodes: limitedNodes, links: limitedLinks }
			}

			this.logger?.info(`[GraphRetriever] ✅ 文件节点数未超限，返回完整数据`)
			this.logger?.info(`[GraphRetriever] ================================================`)
			return { nodes, links }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "获取图谱数据失败"
			this.logger?.error(`[GraphRetriever] ❌ 获取图谱数据失败: ${errorMessage}`)
			this.logger?.info(`[GraphRetriever] ================================================`)
			throw new Error(`获取图谱数据失败: ${errorMessage}`)
		}
	}

	/**
	 * ✅ 按优先级排序文件节点（简化版本）
	 * 优先级规则：源码文件 > 测试文件
	 */
	private prioritizeFileNodes(fileNodes: GraphNode[]): GraphNode[] {
		return fileNodes.sort((a, b) => {
			// 1. 源码文件优先于测试文件
			if (a.fileType === 'source' && b.fileType === 'test') return -1
			if (a.fileType === 'test' && b.fileType === 'source') return 1
			
			// 2. 同类型按路径排序
			return a.id.localeCompare(b.id)
		})
	}
}
