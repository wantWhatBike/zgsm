import { ILogger } from "../../../utils/logger"
import { SearchResult, SearchQuery, SearchCodesResult, MatchedFunction, FileCallChain, FileSummary, DirectorySummary } from "../types"
import { RootInfo } from "../types"
import { DirectoryFileSummarizer } from "./DirectoryFileSummarizer"
import { RootAnalyzer } from "./RootAnalyzer"
import * as path from "path"
import type { GraphData, GraphNode, GraphLink } from "@roo-code/types"
import { SEARCH_CODES_CONFIG } from "../constants"

/**
 * 知识图谱检索器
 * 负责高效检索知识图谱中的信息，为LLM提供项目上下文
 */
export class GraphRetriever {
	private logger: ILogger
    private rootAnalyzer: RootAnalyzer
	private directoryFileSummarizer: DirectoryFileSummarizer
	private workspacePath: string

	constructor(logger: ILogger, rootAnalyzer: RootAnalyzer, directoryFileSummarizer: DirectoryFileSummarizer, workspacePath: string) {
		this.logger = logger
        this.rootAnalyzer = rootAnalyzer
		this.directoryFileSummarizer = directoryFileSummarizer
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
	 * 构建反向依赖索引
	 * @param fileSummaries 所有文件摘要
	 * @returns reverseDeps[target] = [caller1, caller2, ...] 谁依赖了 target
	 */
	private buildReverseDependencyIndex(fileSummaries: FileSummary[]): Map<string, string[]> {
		const reverseDeps = new Map<string, string[]>()
		
		// TODO: dependencies 字段已从 schema 删除，此功能暂时禁用
		// 后续需要重新设计依赖关系的获取和存储方式
		/* 
		for (const file of fileSummaries) {
			if (!file.dependencies || file.dependencies.length === 0) {
				continue
			}
			
			for (const dep of file.dependencies) {
				if (!reverseDeps.has(dep)) {
					reverseDeps.set(dep, [])
				}
				reverseDeps.get(dep)!.push(file.path)
			}
		}
		*/
		
		return reverseDeps
	}

	/**
	 * 追溯文件级调用链（BFS）
	 * @param targets 命中的文件列表
	 * @param reverseDeps 反向依赖索引
	 * @param maxDepth 最大追溯深度
	 * @returns 分层的调用者 [[layer1], [layer2], ...]
	 */
	private traceCallChain(
		targets: string[],
		reverseDeps: Map<string, string[]>,
		maxDepth: number
	): string[][] {
		const layers: string[][] = []
		const visited = new Set<string>(targets)
		let currentLayer = targets
		
		for (let depth = 0; depth < maxDepth && currentLayer.length > 0; depth++) {
			const nextLayer: string[] = []
			
			for (const file of currentLayer) {
				const callers = reverseDeps.get(file) || []
				for (const caller of callers) {
					if (!visited.has(caller)) {
						visited.add(caller)
						nextLayer.push(caller)
					}
				}
			}
			
			if (nextLayer.length > 0) {
				layers.push(nextLayer)
			}
			
			currentLayer = nextLayer
		}
		
		return layers
	}

	/**
	 * 格式化调用链为箭头图
	 * @param targetFile 目标文件（被调用者）
	 * @param layers 分层的调用者
	 * @returns 箭头图格式的可视化文本
	 */
	private formatCallChain(targetFile: string, layers: string[][]): string {
		if (layers.length === 0) {
			return `${targetFile} (no callers found)`
		}
		
		let output = "Call chain:\n"
		
		// 从最外层（最顶层调用者）开始，逐层向内
		for (let i = layers.length - 1; i >= 0; i--) {
			const indent = "  ".repeat(layers.length - 1 - i)
			for (const caller of layers[i]) {
				output += `${indent}${caller} →\n`
			}
		}
		
		// 最后加上目标文件
		const finalIndent = "  ".repeat(layers.length)
		output += `${finalIndent}${targetFile}`
		
		return output
	}

	/**
	 * 搜索文件摘要 - 用于 search_codes 工具
	 * @param keywords 关键词列表
	 * @param type 检索类型：'precise' 精确检索，'fuzzy' 模糊检索
	 * @param maxResults 最大返回结果数
	 * @param maxDepth 调用链追溯深度
	 * @returns 搜索到的文件摘要列表（包含调用链信息）
	 */
	public async searchFileSummaries(
		keywords: string[],
		type: "precise" | "fuzzy",
		maxResults: number = 5,
		maxDepth: number = SEARCH_CODES_CONFIG.DEFAULT_MAX_DEPTH,
	): Promise<SearchCodesResult[]> {
		this.logger?.info(`[GraphRetriever] 搜索文件摘要: keywords=${JSON.stringify(keywords)}, type=${type}`)

		try {
			// 1. 获取所有文件摘要
			const fileSummaries = await this.directoryFileSummarizer.getFileSummaries()
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

				// TODO: description, keywords, functions 字段已从 schema 删除
				// 后续需要重新设计搜索策略，可能基于 summary 字段或其他方式
				
				/* 已删除字段的检索逻辑 - 暂时禁用
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
				*/
				
				// 临时方案：仅搜索 summary 字段（核心功能描述）
				if (summary.summary && summary.summary.toLowerCase().includes(keywordLower)) {
					matchScore += 3
					matched = true
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

			// 4. 构建反向依赖索引（用于追溯调用链）
			const reverseDeps = this.buildReverseDependencyIndex(fileSummaries)
			
			// 5. 格式化结果并生成文件级调用链
			const results: SearchCodesResult[] = []
			for (const [, data] of sortedResults) {
			// TODO: functions 字段已删除，matchedFunctions 暂时返回空数组
			// 提取匹配的函数信息
			const matchedFunctions: MatchedFunction[] = []
			/* 已删除字段的逻辑
			Array.from(data.matchedFunctions).map((funcName) => ({
				name: funcName,
				description: (data.summary.functions && data.summary.functions[funcName]) || "",
			}))
			*/
				
				// 追溯文件级调用链
				const layers = this.traceCallChain([data.summary.path], reverseDeps, maxDepth)
				const formatted = this.formatCallChain(data.summary.path, layers)
				
				const callChain: FileCallChain = {
					layers,
					depth: layers.length,
					formatted,
				}

			results.push({
				path: data.summary.path,
				summary: data.summary.summary || "",
				description: "",  // TODO: description 字段已删除，暂时返回空字符串
				match_functions: matchedFunctions,
				dependencies: [],  // TODO: dependencies 字段已删除，暂时返回空数组
				call_chain: callChain,
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
			const fileSummaries = await this.directoryFileSummarizer.getFileSummaries()
			this.logger?.info(`[GraphRetriever] 文件摘要数量: ${fileSummaries?.length || 0}`)
			
			this.logger?.info(`[GraphRetriever] 正在获取目录摘要...`)
			const directorySummaries = await this.directoryFileSummarizer.getDirectorySummaries()
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
					description: dirSummary.summary || "",  // TODO: description 字段已删除，临时使用 summary 字段
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
				description: fileSummary.summary || "",  // TODO: description 字段已删除，临时使用 summary 字段
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

		// TODO: dependencies 字段已从 schema 删除，Import 关系暂时无法构建
		// 3.2 构建 Import 关系（文件依赖关系）
		this.logger?.info(`[GraphRetriever] 构建 Import 关系（已禁用：dependencies 字段已删除）...`)
		
		/* 已删除字段的逻辑 - 暂时禁用
		// 统计：依赖匹配成功/失败数量（用于调试）
		let matchedCount = 0
		let unmatchedCount = 0
		const unmatchedDeps: string[] = []
		
		for (const fileSummary of fileSummaries) {
			if (!fileSummary.dependencies || fileSummary.dependencies.length === 0) continue

			const sourcePath = fileSummary.path
			if (!sourcePath || !nodeMap.has(sourcePath)) continue

			for (const depPath of fileSummary.dependencies) {
				// 依赖路径已在 FileSummarizer 写入时解析和标准化，这里直接匹配
				if (nodeMap.has(depPath)) {
					links.push({
						source: sourcePath,
						target: depPath,
						type: 'import',
					})
					matchedCount++
				} else {
					// 匹配失败：可能是外部依赖或已删除的文件
					unmatchedCount++
					if (unmatchedDeps.length < 10) { // 只记录前10个示例
						unmatchedDeps.push(`${sourcePath} → ${depPath}`)
					}
				}
			}
		}
		
		// 调试日志
		this.logger?.info(`[GraphRetriever] 依赖匹配统计: 成功 ${matchedCount}, 失败 ${unmatchedCount}`)
		if (unmatchedDeps.length > 0) {
			this.logger?.warn(`[GraphRetriever] 未匹配的依赖示例 (前${Math.min(unmatchedDeps.length, 5)}个): ${unmatchedDeps.slice(0, 5).join('; ')}`)
		}
		*/

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
