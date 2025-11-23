/**
 * 知识图谱过滤Hook
 * 修复 #12: 从主组件中提取过滤逻辑
 */
import { useMemo } from "react"
import type { GraphData, GraphNode } from "@roo-code/types"
import type { NodeFilter } from "../ControlPanel"

interface UseGraphFilterParams {
	graphData: GraphData | null
	filter: NodeFilter
	expandedDirectories: Set<string>
}

export function useGraphFilter({ graphData, filter, expandedDirectories }: UseGraphFilterParams): GraphData | null {
	return useMemo(() => {
		if (!graphData) return null

		// 应用过滤器 + 展开状态
		const visibleNodes = graphData.nodes.filter(node => {
			// 1. 应用类型过滤
			if (node.type === 'directory' && !filter.showDirectories) return false
			if (node.type === 'file' && !filter.showFiles) return false

			// 2. 应用文件类型过滤（只对文件生效）
			if (node.type === 'file') {
				if (node.fileType === 'source' && !filter.showSource) return false
				if (node.fileType === 'test' && !filter.showTest) return false
				if (node.fileType === 'config' && !filter.showConfig) return false
			}

			// 3. 应用展开状态过滤
			if (node.type === 'directory') return true // 目录总是显示（如果通过类型过滤）

			// 文件：只有当其父目录被展开时才显示
			const parentId = node.parentId || '/'
			return expandedDirectories.has(parentId)
		})

		const visibleNodeIds = new Set(visibleNodes.map(n => n.id))

		// 修复 #16 & #8: 过滤边 - 使用类型守卫替代类型断言
		const getNodeId = (nodeOrId: string | unknown): string => {
			if (typeof nodeOrId === 'string') return nodeOrId
			// 对象类型，尝试提取id属性
			if (nodeOrId && typeof nodeOrId === 'object' && 'id' in nodeOrId) {
				return (nodeOrId as { id: string }).id
			}
			return String(nodeOrId)
		}

		const visibleLinks = graphData.links.filter(link => {
			const sourceId = getNodeId(link.source)
			const targetId = getNodeId(link.target)
			return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
		})

		return {
			nodes: visibleNodes,
			links: visibleLinks,
		}
	}, [graphData, expandedDirectories, filter])
}

