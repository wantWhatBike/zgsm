/**
 * 知识图谱可视化主容器组件
 */
import { useEffect, useState, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { vscode } from "@/utils/vscode"
import { KNOWLEDGE_GRAPH_MESSAGES, GraphData } from "@roo-code/types"
import { ForceGraph } from "./ForceGraph"
import type { GraphNode } from "@roo-code/types"

export const GraphVisualizer = () => {
	console.log("[GraphVisualizer] 组件已挂载")
	const [graphData, setGraphData] = useState<GraphData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// 请求图谱数据
	const requestGraphData = useCallback(() => {
		console.log("[GraphVisualizer] 请求图谱数据")
		setLoading(true)
		setError(null)
		const message = {
			type: KNOWLEDGE_GRAPH_MESSAGES.GET_GRAPH_DATA,
		}
		console.log("[GraphVisualizer] 发送消息:", message)
		vscode.postMessage(message)
	}, [])

	// 处理打开文件
	const handleNodeDoubleClick = useCallback((node: GraphNode) => {
		console.log("[GraphVisualizer] 节点双击:", node.id, node.type)
		if (node.type === "file") {
			const message = {
				type: KNOWLEDGE_GRAPH_MESSAGES.OPEN_FILE,
				filePath: node.id,
			}
			console.log("[GraphVisualizer] 发送打开文件消息:", message)
			vscode.postMessage(message)
		}
	}, [])

	// 监听来自后端的消息
	useEffect(() => {
		console.log("[GraphVisualizer] 设置消息监听器")
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			console.log("[GraphVisualizer] 收到消息:", message.type, message)

			switch (message.type) {
				case KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE:
					console.log("[GraphVisualizer] 收到图谱数据响应")
					if (message.error) {
						console.error("[GraphVisualizer] 图谱数据加载错误:", message.error)
						setError(message.error)
						setLoading(false)
					} else {
						console.log("[GraphVisualizer] 图谱数据加载成功:", {
							nodes: message.payload?.nodes?.length || 0,
							links: message.payload?.links?.length || 0,
						})
						setGraphData(message.payload)
						setLoading(false)
					}
					break
				default:
					console.log("[GraphVisualizer] 收到未知消息类型:", message.type)
			}
		}

		window.addEventListener("message", handleMessage)
		console.log("[GraphVisualizer] 消息监听器已注册")

		// 初始请求数据
		console.log("[GraphVisualizer] 发送初始数据请求")
		requestGraphData()

		return () => {
			console.log("[GraphVisualizer] 清理消息监听器")
			window.removeEventListener("message", handleMessage)
		}
	}, [requestGraphData])

	if (loading) {
		console.log("[GraphVisualizer] 渲染加载状态")
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100vh",
					flexDirection: "column",
					gap: "1rem",
					color: "#fff",
				}}
			>
				<Loader2 className="animate-spin" size={32} />
				<div>正在加载图谱数据...</div>
			</div>
		)
	}

	if (error) {
		console.error("[GraphVisualizer] 渲染错误状态:", error)
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100vh",
					flexDirection: "column",
					gap: "1rem",
					color: "#ef4444",
				}}
			>
				<div>加载失败: {error}</div>
				<button
					onClick={requestGraphData}
					style={{
						padding: "0.5rem 1rem",
						background: "#3b82f6",
						color: "#fff",
						border: "none",
						borderRadius: "4px",
						cursor: "pointer",
					}}
				>
					重试
				</button>
			</div>
		)
	}

	if (!graphData || graphData.nodes.length === 0) {
		console.warn("[GraphVisualizer] 图谱数据为空")
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100vh",
					color: "#fff",
				}}
			>
				<div>暂无图谱数据，请先构建知识图谱</div>
			</div>
		)
	}

	console.log("[GraphVisualizer] 渲染图谱视图，节点数:", graphData.nodes.length, "边数:", graphData.links.length)
	return (
		<div style={{ width: "100%", height: "100vh", position: "relative" }}>
			<ForceGraph
				data={graphData}
				width={window.innerWidth}
				height={window.innerHeight}
				onNodeDoubleClick={handleNodeDoubleClick}
			/>
			<div
				style={{
					position: "absolute",
					top: "1rem",
					left: "1rem",
					background: "rgba(0, 0, 0, 0.7)",
					padding: "0.5rem 1rem",
					borderRadius: "4px",
					color: "#fff",
					fontSize: "0.875rem",
				}}
			>
				节点: {graphData.nodes.length} | 边: {graphData.links.length}
			</div>
		</div>
	)
}

