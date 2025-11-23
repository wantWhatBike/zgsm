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
