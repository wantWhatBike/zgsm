/**
 * 知识图谱可视化主容器组件
 * 修复 #12: 使用自定义Hooks实现职责分离
 */
import { useEffect, useState, useCallback, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { vscode } from "@/utils/vscode"
import { KNOWLEDGE_GRAPH_MESSAGES, KNOWLEDGE_GRAPH_VISUALIZATION_CONFIG } from "@roo-code/types"
import { ForceGraph } from "./ForceGraph"
import { ForceGraphWorker } from "./ForceGraphWorker"
import { NodeTooltip } from "./NodeTooltip"
import { ControlPanel } from "./ControlPanel"
import { useGraphData } from "./hooks/useGraphData"
import { useGraphFilter } from "./hooks/useGraphFilter"
import type { GraphNode } from "@roo-code/types"
import type { NodeFilter } from "./ControlPanel"

export const GraphVisualizer = () => {
	// 修复 #12: 使用自定义Hook获取数据
	const { graphData, loading, error, refetch } = useGraphData()
	
	// 交互状态
	const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
	
	// 视图控制状态
	const [zoom, setZoom] = useState(1)
	const [resetTrigger, setResetTrigger] = useState(0)
	
	// 目录展开/折叠状态
	const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set(['/']))
	
	// 过滤器状态
	const [filter, setFilter] = useState<NodeFilter>({
		showDirectories: true,
		showFiles: true,
		showSource: true,
		showTest: true,
		showConfig: true,
	})
	
	// 修复 #12: 使用自定义Hook进行数据过滤
	const filteredGraphData = useGraphFilter({ graphData, filter, expandedDirectories })
	
	// 根据节点数量自动选择使用Worker还是普通版本
	// 修复 #15: 基于过滤后的数据判断，而不是原始数据
	const useWorker = useMemo(() => {
		if (!filteredGraphData) return false
		return filteredGraphData.nodes.length >= KNOWLEDGE_GRAPH_VISUALIZATION_CONFIG.WORKER_THRESHOLD
	}, [filteredGraphData])

	// 自动展开所有目录（当图谱数据加载后）
	useEffect(() => {
		if (graphData) {
			const allDirectoryIds = graphData.nodes
				.filter(node => node.type === 'directory')
				.map(node => node.id)
			
			setExpandedDirectories(new Set(allDirectoryIds))
		}
	}, [graphData])

	// 处理节点点击（不做任何操作，仅用于满足组件接口）
	const handleNodeClick = useCallback((_node: GraphNode | null) => {
		// 单击不做任何操作
	}, [])
	
	// 处理节点悬浮
	const handleNodeHover = useCallback((node: GraphNode | null) => {
		setHoveredNode(node)
	}, [])
	
	// 处理双击节点
	const handleNodeDoubleClick = useCallback((node: GraphNode) => {
		if (node.type === "directory") {
			// 双击目录：展开/折叠
			setExpandedDirectories(prev => {
				const next = new Set(prev)
				if (next.has(node.id)) {
					next.delete(node.id)
				} else {
					next.add(node.id)
				}
				return next
			})
		} else if (node.type === "file") {
			// 双击文件：打开
			vscode.postMessage({
				type: KNOWLEDGE_GRAPH_MESSAGES.OPEN_FILE,
				filePath: node.id,
			})
		}
	}, [])
	
	// 处理鼠标移动
	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		setMousePos({ x: e.clientX, y: e.clientY })
	}, [])
	
	// 处理飞向节点
	const handleFlyToNode = useCallback((_node: GraphNode) => {
		// TODO: 实现平滑飞行到节点的动画效果
	}, [])
	
	// 处理缩放变化
	const handleZoomChange = useCallback((newZoom: number) => {
		setZoom(newZoom)
	}, [])
	
	// 处理重置视图
	const handleResetView = useCallback(() => {
		setZoom(1)
		setResetTrigger(prev => prev + 1)
	}, [])
	
	// 处理过滤变化
	const handleFilterChange = useCallback((newFilter: NodeFilter) => {
		setFilter(newFilter)
	}, [])

	if (loading) {
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
					onClick={refetch}
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

	// 使用过滤后的数据
	const displayData = filteredGraphData || graphData
	const GraphComponent = useWorker ? ForceGraphWorker : ForceGraph
	
	return (
		<div 
			style={{ width: "100%", height: "100vh", position: "relative" }}
			onMouseMove={handleMouseMove}
		>
			<GraphComponent
				data={displayData}
				width={window.innerWidth}
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
			
			{/* 节点悬浮提示 */}
			<NodeTooltip node={hoveredNode} graphData={graphData} x={mousePos.x} y={mousePos.y} />
			
			{/* 控制面板 */}
			<ControlPanel
				graphData={displayData}
				zoom={zoom}
				onZoomChange={handleZoomChange}
				onResetView={handleResetView}
				onFlyToNode={handleFlyToNode}
				onFilterChange={handleFilterChange}
			/>
		</div>
	)
}

