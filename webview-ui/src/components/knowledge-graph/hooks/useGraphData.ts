/**
 * 知识图谱数据获取Hook
 * 修复 #12: 从主组件中提取数据获取逻辑
 */
import { useState, useEffect, useCallback } from "react"
import { vscode } from "@/utils/vscode"
import { KNOWLEDGE_GRAPH_MESSAGES, GraphData } from "@roo-code/types"

interface UseGraphDataResult {
	graphData: GraphData | null
	loading: boolean
	error: string | null
	refetch: () => void
}

export function useGraphData(): UseGraphDataResult {
	const [graphData, setGraphData] = useState<GraphData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

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
						setGraphData(message.payload)
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

	return {
		graphData,
		loading,
		error,
		refetch: requestGraphData,
	}
}

