/**
 * 知识图谱数据获取Hook
 * 修复 #12: 从主组件中提取数据获取逻辑
 */
import { useState, useEffect, useCallback, useMemo } from "react"
import { vscode } from "@/utils/vscode"
import { KNOWLEDGE_GRAPH_MESSAGES, GraphData, GraphNode } from "@roo-code/types"
import { useExtensionState } from "@/context/ExtensionStateContext"

interface UseGraphDataResult {
	graphData: GraphData
	loading: boolean
	error: string | null
	refetch: () => void
	isLimited: boolean
	totalNodes: number
}

export function useGraphData(): UseGraphDataResult {
	const [rawGraphData, setRawGraphData] = useState<GraphData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	
	// 读取配置
	const { knowledgeGraphConfig } = useExtensionState()
	const maxVisualizationFiles = knowledgeGraphConfig?.knowledgeGraphMaxVisualizationFiles ?? 200

	// 请求图谱数据
	const requestGraphData = useCallback(() => {
		setLoading(true)
		setError(null)
		vscode.postMessage({
			type: KNOWLEDGE_GRAPH_MESSAGES.GET_GRAPH_DATA,
		})
	}, [])

	// 监听来自后端的消息
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data

			switch (message.type) {
				case KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE:
					if (message.error) {
						setError(message.error)
						setLoading(false)
					} else {
						setRawGraphData(message.payload)
						setLoading(false)
					}
					break
			}
		}

		window.addEventListener("message", handleMessage)
		requestGraphData()

		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [requestGraphData])

	// 应用可视化限制
	const limitedGraphData = useMemo(() => {
		if (!rawGraphData) {
			return { nodes: [], links: [] }
		}

		const totalNodes = rawGraphData.nodes.length

		// 如果节点数量未超过限制，直接返回原始数据
		if (totalNodes <= maxVisualizationFiles) {
			return rawGraphData
		}

		// 节点优先级排序：目录 > source文件 > 其他文件
		const prioritizedNodes = [...rawGraphData.nodes].sort((a, b) => {
			// 1. 目录优先
			if (a.type === 'directory' && b.type !== 'directory') return -1
			if (a.type !== 'directory' && b.type === 'directory') return 1

			// 2. source 文件优先
			if (a.type === 'file' && b.type === 'file') {
				if (a.fileType === 'source' && b.fileType !== 'source') return -1
				if (a.fileType !== 'source' && b.fileType === 'source') return 1
			}

			// 3. 按字母顺序
			return a.id.localeCompare(b.id)
		})

		// 截取前 N 个节点
		const limitedNodes = prioritizedNodes.slice(0, maxVisualizationFiles)
		const limitedNodeIds = new Set(limitedNodes.map(n => n.id))

		// 只保留连接限制节点之间的边
		const limitedLinks = rawGraphData.links.filter(
			link => limitedNodeIds.has(link.source) && limitedNodeIds.has(link.target)
		)

		return {
			nodes: limitedNodes,
			links: limitedLinks,
		}
	}, [rawGraphData, maxVisualizationFiles])

	const isLimited = rawGraphData ? rawGraphData.nodes.length > maxVisualizationFiles : false
	const totalNodes = rawGraphData?.nodes.length ?? 0

	return {
		graphData: limitedGraphData,
		loading,
		error,
		refetch: requestGraphData,
		isLimited,
		totalNodes,
	}
}

