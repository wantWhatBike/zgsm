/**
 * 节点悬浮提示组件
 */
import { useMemo, useState, useRef, useEffect } from "react"
import type { GraphNode } from "@roo-code/types"

interface NodeTooltipProps {
	node: GraphNode | null
	x: number
	y: number
}

export const NodeTooltip = ({ node, x, y }: NodeTooltipProps) => {
	const [isHoveringTooltip, setIsHoveringTooltip] = useState(false)
	const [displayNode, setDisplayNode] = useState<GraphNode | null>(node)
	const [fixedPosition, setFixedPosition] = useState({ x: 0, y: 0 })
	const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	
	// 当 node 变化时更新显示节点和固定位置
	useEffect(() => {
		if (node) {
			// 有新节点时，清除隐藏定时器并显示新节点
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current)
				hideTimeoutRef.current = null
			}
			setDisplayNode(node)
			// 固定 tooltip 位置，不再跟随鼠标移动
			setFixedPosition({ x, y })
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
		}
	}, [node, x, y, isHoveringTooltip])
	
	// 鼠标进入 tooltip
	const handleMouseEnter = () => {
		setIsHoveringTooltip(true)
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current)
			hideTimeoutRef.current = null
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
	const adjustedX = Math.min(fixedPosition.x + 15, window.innerWidth - 300)
	const adjustedY = Math.min(fixedPosition.y + 15, window.innerHeight - 200)
	
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
			
			<div style={{ display: "flex", alignItems: "center", marginBottom: "6px", color: "#aaa" }}>
				<span>{getTypeLabel()}</span>
			</div>
			
			{displayNode.description && (
				<div style={{ 
					marginTop: "8px", 
					paddingTop: "8px", 
					borderTop: "1px solid rgba(255, 255, 255, 0.1)",
					color: "#ccc",
					fontSize: "12px",
					maxHeight: "100px",
					overflow: "auto"
				}}>
					{displayNode.description}
				</div>
			)}
			
			{displayNode.parentId && (
				<div style={{ 
					marginTop: "6px", 
					color: "#888",
					fontSize: "11px"
				}}>
					父目录: {displayNode.parentId}
				</div>
			)}
		</div>
	)
}

