/**
 * 知识图谱可视化主容器组件
 * 集成Tooltip和SidePanel交互组件
 */
import { useEffect, useState, useCallback, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { vscode } from "@/utils/vscode"
import { KNOWLEDGE_GRAPH_MESSAGES, GraphData } from "@roo-code/types"
import { ForceGraph } from "./ForceGraph"
import { ForceGraphWorker } from "./ForceGraphWorker"
import { NodeTooltip } from "./NodeTooltip"
import { SidePanel } from "./SidePanel"
import { ControlPanel } from "./ControlPanel"
import type { GraphNode } from "@roo-code/types"
import type { NodeFilter } from "./ControlPanel"

// 节点数量阈值：超过1000个节点时使用Worker
const WORKER_THRESHOLD = 1000

export const GraphVisualizer = () => {
	console.log("[GraphVisualizer] 组件已挂载")
	const [graphData, setGraphData] = useState<GraphData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	
	// 交互状态（阶段5）
	const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
	const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
	
	// 视图控制状态（阶段6）
	const [zoom, setZoom] = useState(1)
	const [resetTrigger, setResetTrigger] = useState(0)
	// const [targetNodeForFly, setTargetNodeForFly] = useState<GraphNode | null>(null) // TODO: 实现平滑飞行动画
	
	// 目录展开/折叠状态（阶段7）
	// 注意：初始值会在收到图谱数据后更新为所有目录
	const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set(['/']))
	
	// 过滤器状态（阶段6）
	const [filter, setFilter] = useState<NodeFilter>({
		showDirectories: true,
		showFiles: true,
		showSource: true,
		showTest: true,
		showConfig: true,
	})
	
	// 过滤后的图谱数据（阶段7 + 过滤器）
	const filteredGraphData = useMemo(() => {
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
		
		// 过滤边：只保留可见节点之间的边
		const visibleLinks = graphData.links.filter(link => {
			const sourceId = typeof link.source === 'string' ? link.source : link.source
			const targetId = typeof link.target === 'string' ? link.target : link.target
			return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
		})
		
		console.log("[GraphVisualizer] 过滤后节点:", visibleNodes.length, "边:", visibleLinks.length, "展开的目录:", expandedDirectories.size)
		
		return {
			nodes: visibleNodes,
			links: visibleLinks,
		}
	}, [graphData, expandedDirectories, filter])
	
	// 根据节点数量自动选择使用Worker还是普通版本（必须在所有 early returns 之前）
	const useWorker = useMemo(() => {
		return graphData ? graphData.nodes.length >= WORKER_THRESHOLD : false
	}, [graphData])

	// 自动展开所有目录（当图谱数据加载后）
	useEffect(() => {
		if (graphData) {
			const allDirectoryIds = graphData.nodes
				.filter(node => node.type === 'directory')
				.map(node => node.id)
			
			console.log("[GraphVisualizer] 自动展开所有目录，总数:", allDirectoryIds.length)
			setExpandedDirectories(new Set(allDirectoryIds))
		}
	}, [graphData])

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

	// 处理节点点击（阶段5）
	const handleNodeClick = useCallback((node: GraphNode | null) => {
		if (node) {
			console.log("[GraphVisualizer] 节点点击:", node.id)
			setSelectedNode(node)
		}
	}, [])
	
	// 处理节点悬浮（阶段5）
	const handleNodeHover = useCallback((node: GraphNode | null) => {
		setHoveredNode(node)
	}, [])
	
	// 处理双击节点（阶段7：目录展开/折叠）
	const handleNodeDoubleClick = useCallback((node: GraphNode) => {
		console.log("[GraphVisualizer] 节点双击:", node.id, node.type)
		
		if (node.type === "directory") {
			// 双击目录：展开/折叠
			setExpandedDirectories(prev => {
				const next = new Set(prev)
				if (next.has(node.id)) {
					next.delete(node.id)
					console.log("[GraphVisualizer] 折叠目录:", node.id)
				} else {
					next.add(node.id)
					console.log("[GraphVisualizer] 展开目录:", node.id)
				}
				return next
			})
		} else if (node.type === "file") {
			// 双击文件：打开
			const message = {
				type: KNOWLEDGE_GRAPH_MESSAGES.OPEN_FILE,
				filePath: node.id,
			}
			console.log("[GraphVisualizer] 发送打开文件消息:", message)
			vscode.postMessage(message)
		}
	}, [])
	
	// 处理从SidePanel打开文件
	const handleOpenFileFromPanel = useCallback((node: GraphNode) => {
		handleNodeDoubleClick(node)
	}, [handleNodeDoubleClick])
	
	// 处理鼠标移动（更新Tooltip位置）
	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		setMousePos({ x: e.clientX, y: e.clientY })
	}, [])
	
	// 处理飞向节点（阶段6）
	const handleFlyToNode = useCallback((node: GraphNode) => {
		console.log("[GraphVisualizer] 飞向节点:", node.id)
		// setTargetNodeForFly(node) // TODO: 实现平滑飞行动画
		setSelectedNode(node)
		// 注意：实际的"飞行"动画需要在ForceGraph组件中实现
		// 这里我们只是选中节点，ForceGraph会自动调整视图
	}, [])
	
	// 处理缩放变化（阶段6）
	const handleZoomChange = useCallback((newZoom: number) => {
		setZoom(newZoom)
	}, [])
	
	// 处理重置视图（阶段6）
	const handleResetView = useCallback(() => {
		setZoom(1)
		setSelectedNode(null)
		setResetTrigger(prev => prev + 1) // 触发子组件重置
		// setTargetNodeForFly(null) // TODO: 实现平滑飞行动画
	}, [])
	
	// 处理过滤变化（阶段6）
	const handleFilterChange = useCallback((newFilter: NodeFilter) => {
		console.log("[GraphVisualizer] 过滤器变化:", newFilter)
		setFilter(newFilter)
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
						background: "var(--vscode-button-background, #3b82f6)",
						color: "var(--vscode-button-foreground, #fff)",
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

	// 使用过滤后的数据（阶段7）
	const displayData = filteredGraphData || graphData

	console.log("[GraphVisualizer] 渲染图谱视图，总节点:", graphData.nodes.length, "显示节点:", displayData.nodes.length, "边数:", displayData.links.length, "使用Worker:", useWorker)
	
	const GraphComponent = useWorker ? ForceGraphWorker : ForceGraph
	
	return (
		<div 
			style={{ width: "100%", height: "100vh", position: "relative" }}
			onMouseMove={handleMouseMove}
		>
			<GraphComponent
				data={displayData}
				width={selectedNode ? window.innerWidth - 380 : window.innerWidth}
				height={window.innerHeight}
				zoom={zoom}
				onZoomChange={handleZoomChange}
				resetTrigger={resetTrigger}
				onNodeClick={handleNodeClick}
				onNodeHover={handleNodeHover}
				onNodeDoubleClick={handleNodeDoubleClick}
			/>
			
			{/* 信息面板 */}
			<div
				style={{
					position: "absolute",
					top: "0.5rem",
					left: "0.5rem",
					background: "var(--vscode-panel-background, rgba(0, 0, 0, 0.7))",
					padding: "0.35rem 0.65rem",
					borderRadius: "3px",
					color: "var(--vscode-foreground, #fff)",
					fontSize: "0.7rem",
					border: "1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.2))",
					fontFamily: "monospace",
				}}
			>
				<div>节点: {displayData.nodes.length}/{graphData.nodes.length} | 边: {displayData.links.length}</div>
			</div>
			
			{/* Tooltip（阶段5） */}
			<NodeTooltip node={hoveredNode} x={mousePos.x} y={mousePos.y} />
			
			{/* SidePanel（阶段5） */}
			<SidePanel
				node={selectedNode}
				graphData={graphData}
				onClose={() => setSelectedNode(null)}
				onOpenFile={handleOpenFileFromPanel}
			/>
			
			{/* ControlPanel（阶段6） - 使用过滤后的数据 */}
			{!selectedNode && (
				<ControlPanel
					graphData={displayData}
					zoom={zoom}
					onZoomChange={handleZoomChange}
					onResetView={handleResetView}
					onFlyToNode={handleFlyToNode}
					onFilterChange={handleFilterChange}
				/>
			)}
		</div>
	)
}

