/**
 * 节点悬浮提示组件
 */
import { useMemo, useState, useRef, useEffect } from "react"
import type { GraphNode, GraphData } from "@roo-code/types"

interface NodeTooltipProps {
	node: GraphNode | null
	graphData: GraphData | null
	x: number
	y: number
}

export const NodeTooltip = ({ node, graphData, x, y }: NodeTooltipProps) => {
	const [isHoveringTooltip, setIsHoveringTooltip] = useState(false)
	const [displayNode, setDisplayNode] = useState<GraphNode | null>(null)
	const [fixedPosition, setFixedPosition] = useState({ x: 0, y: 0 })
	const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	
	// 当 node 变化时更新显示节点和固定位置
	useEffect(() => {
		// 清除所有定时器
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current)
			hideTimeoutRef.current = null
		}
		if (showTimeoutRef.current) {
			clearTimeout(showTimeoutRef.current)
			showTimeoutRef.current = null
		}
		
		if (node) {
			// 有新节点时，延迟1秒后显示
			showTimeoutRef.current = setTimeout(() => {
				setDisplayNode(node)
				// 固定 tooltip 位置，不再跟随鼠标移动
				setFixedPosition({ x, y })
			}, 1000) // 1秒延迟
		} else if (!isHoveringTooltip) {
			// node 为 null 且鼠标不在 tooltip 上时，延迟隐藏
			hideTimeoutRef.current = setTimeout(() => {
				setDisplayNode(null)
			}, 200) // 200ms 延迟
		}
		
		return () => {
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current)
			}
			if (showTimeoutRef.current) {
				clearTimeout(showTimeoutRef.current)
			}
		}
	}, [node, x, y, isHoveringTooltip])
	
	// 鼠标进入 tooltip
	const handleMouseEnter = () => {
		setIsHoveringTooltip(true)
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current)
			hideTimeoutRef.current = null
		}
		if (showTimeoutRef.current) {
			clearTimeout(showTimeoutRef.current)
			showTimeoutRef.current = null
		}
	}
	
	// 鼠标离开 tooltip
	const handleMouseLeave = () => {
		setIsHoveringTooltip(false)
		// 延迟隐藏
		hideTimeoutRef.current = setTimeout(() => {
			setDisplayNode(null)
		}, 200)
	}
	
	// 查找相关节点（如果有 graphData） - 必须在条件返回之前调用
	const relatedInfo = useMemo(() => {
		if (!graphData || !displayNode) return null
		
		const children = graphData.nodes.filter(n => n.parentId === displayNode.id)
		const dependencies = graphData.links
			.filter(link => {
				const sourceId = typeof link.source === 'string' ? link.source : link.source
				return sourceId === displayNode.id && link.type === 'import'
			})
			.map(link => {
				const targetId = typeof link.target === 'string' ? link.target : link.target
				return graphData.nodes.find(n => n.id === targetId)
			})
			.filter(Boolean) as GraphNode[]
		
		const dependedBy = graphData.links
			.filter(link => {
				const targetId = typeof link.target === 'string' ? link.target : link.target
				return targetId === displayNode.id && link.type === 'import'
			})
			.map(link => {
				const sourceId = typeof link.source === 'string' ? link.source : link.source
				return graphData.nodes.find(n => n.id === sourceId)
			})
			.filter(Boolean) as GraphNode[]
		
		return { children, dependencies, dependedBy }
	}, [displayNode, graphData])
	
	// 条件返回必须在所有 hooks 之后
	if (!displayNode) return null
	
	// 节点类型标签
	const getTypeLabel = () => {
		if (displayNode.type === 'directory') return '📁 目录'
		if (displayNode.fileType === 'source') return '📄 源代码'
		if (displayNode.fileType === 'test') return '🧪 测试文件'
		if (displayNode.fileType === 'config') return '⚙️ 配置文件'
		return '📄 文件'
	}
	
	// 调整位置避免超出屏幕（使用固定位置）
	const tooltipWidth = 350
	const adjustedX = Math.min(fixedPosition.x + 15, window.innerWidth - tooltipWidth - 20)
	const adjustedY = Math.min(fixedPosition.y + 15, window.innerHeight - 400)
	
	return (
		<div
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			style={{
				position: "fixed",
				left: `${adjustedX}px`,
				top: `${adjustedY}px`,
				background: "var(--vscode-editorHoverWidget-background, rgba(20, 20, 20, 0.95))",
				border: "1px solid var(--vscode-editorHoverWidget-border, rgba(255, 255, 255, 0.2))",
				borderRadius: "6px",
				padding: "12px 16px",
				color: "var(--vscode-editorHoverWidget-foreground, #fff)",
				fontSize: "13px",
				maxWidth: "280px",
				boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
				pointerEvents: "auto", // 允许鼠标交互，支持滚动
				zIndex: 10000,
				backdropFilter: "blur(8px)",
			}}
		>
			<div style={{ fontWeight: "600", marginBottom: "8px", fontSize: "14px" }}>
				{displayNode.label}
			</div>
			
			<div style={{ display: "flex", alignItems: "center", marginBottom: "6px", color: "#aaa", fontSize: "12px" }}>
				<span>{getTypeLabel()}</span>
			</div>
			
			{displayNode.id && (
				<div style={{ 
					marginTop: "4px", 
					color: "#888",
					fontSize: "10px",
					wordBreak: "break-all"
				}}>
					路径: {displayNode.id}
				</div>
			)}
			
			{displayNode.description && (
				<div style={{ 
					marginTop: "8px", 
					paddingTop: "8px", 
					borderTop: "1px solid rgba(255, 255, 255, 0.1)",
					color: "#ccc",
					fontSize: "11px",
					maxHeight: "120px",
					overflow: "auto"
				}}>
					{displayNode.description}
				</div>
			)}
			
			{relatedInfo && (
				<>
					{/* 子节点信息 */}
					{displayNode.type === 'directory' && relatedInfo.children.length > 0 && (
						<div style={{ 
							marginTop: "8px", 
							paddingTop: "8px", 
							borderTop: "1px solid rgba(255, 255, 255, 0.1)"
						}}>
							<div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px" }}>
								包含 {relatedInfo.children.length} 个项目
							</div>
						</div>
					)}
					
					{/* 依赖信息 */}
					{relatedInfo.dependencies.length > 0 && (
						<div style={{ 
							marginTop: "8px", 
							paddingTop: "8px", 
							borderTop: "1px solid rgba(255, 255, 255, 0.1)"
						}}>
							<div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px" }}>
								依赖于 ({relatedInfo.dependencies.length}):
							</div>
							<div style={{ 
								fontSize: "10px", 
								color: "#ccc",
								maxHeight: "80px",
								overflow: "auto"
							}}>
								{relatedInfo.dependencies.slice(0, 5).map(dep => (
									<div key={dep.id} style={{ marginBottom: "2px" }}>
										• {dep.label}
									</div>
								))}
								{relatedInfo.dependencies.length > 5 && (
									<div style={{ color: "#888" }}>
										... 还有 {relatedInfo.dependencies.length - 5} 个
									</div>
								)}
							</div>
						</div>
					)}
					
					{/* 被依赖信息 */}
					{relatedInfo.dependedBy.length > 0 && (
						<div style={{ 
							marginTop: "8px", 
							paddingTop: "8px", 
							borderTop: "1px solid rgba(255, 255, 255, 0.1)"
						}}>
							<div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px" }}>
								被依赖于 ({relatedInfo.dependedBy.length}):
							</div>
							<div style={{ 
								fontSize: "10px", 
								color: "#ccc",
								maxHeight: "80px",
								overflow: "auto"
							}}>
								{relatedInfo.dependedBy.slice(0, 5).map(dep => (
									<div key={dep.id} style={{ marginBottom: "2px" }}>
										• {dep.label}
									</div>
								))}
								{relatedInfo.dependedBy.length > 5 && (
									<div style={{ color: "#888" }}>
										... 还有 {relatedInfo.dependedBy.length - 5} 个
									</div>
								)}
							</div>
						</div>
					)}
				</>
			)}
		</div>
	)
}

