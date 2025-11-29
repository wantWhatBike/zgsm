/**
 * 知识图谱数据获取Hook
 * 修复 #12: 从主组件中提取数据获取逻辑
 */
import { useState, useEffect, useCallback, useMemo } from "react"
import { vscode } from "@/utils/vscode"
import { KNOWLEDGE_GRAPH_MESSAGES, GraphData } from "@roo-code/types"

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
	
	// ✅ 使用默认配置值（知识图谱配置已独立管理）
	const maxVisualizationFiles = 200

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

	// ✅ 应用可视化限制（只限制文件节点，目录节点全部保留）
	const limitedGraphData = useMemo(() => {
		if (!rawGraphData) {
			return { nodes: [], links: [] }
		}

		// ✅ 分离文件节点和目录节点
		const fileNodes = rawGraphData.nodes.filter(n => n.type === 'file')
		const dirNodes = rawGraphData.nodes.filter(n => n.type === 'directory')

		// ✅ 如果文件节点数量未超过限制，直接返回原始数据
		if (fileNodes.length <= maxVisualizationFiles) {
			return rawGraphData
		}

		// ✅ 文件节点优先级排序：源码文件 > 测试文件
		const prioritizedFileNodes = [...fileNodes].sort((a, b) => {
			// 源码文件优先于测试文件
			if (a.fileType === 'source' && b.fileType === 'test') return -1
			if (a.fileType === 'test' && b.fileType === 'source') return 1
			
			// 同类型按路径排序
			return a.id.localeCompare(b.id)
		})

		// ✅ 限制文件节点数量
		const limitedFileNodes = prioritizedFileNodes.slice(0, maxVisualizationFiles)
		
		// ✅ 保留所有目录节点 + 限制后的文件节点
		const limitedNodes = [...dirNodes, ...limitedFileNodes]
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

	// ✅ 统计文件节点数（用于判断是否限制）
	const totalFileNodes = rawGraphData ? rawGraphData.nodes.filter(n => n.type === 'file').length : 0
	const isLimited = totalFileNodes > maxVisualizationFiles

	return {
		graphData: limitedGraphData,
		loading,
		error,
		refetch: requestGraphData,
		isLimited,
		totalNodes: totalFileNodes,  // ✅ 返回文件节点总数
	}
}

