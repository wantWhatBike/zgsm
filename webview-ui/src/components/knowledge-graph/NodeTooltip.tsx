/**
 * 节点悬浮提示组件
 */
import { useMemo } from "react"
import type { GraphNode } from "@roo-code/types"

interface NodeTooltipProps {
	node: GraphNode | null
	x: number
	y: number
}

export const NodeTooltip = ({ node, x, y }: NodeTooltipProps) => {
	const isVisible = useMemo(() => node !== null, [node])
	
	if (!isVisible || !node) return null
	
	// 节点类型标签
	const getTypeLabel = () => {
		if (node.type === 'directory') return '📁 目录'
		if (node.fileType === 'source') return '📄 源代码'
		if (node.fileType === 'test') return '🧪 测试文件'
		if (node.fileType === 'config') return '⚙️ 配置文件'
		return '📄 文件'
	}
	
	// 调整位置避免超出屏幕
	const adjustedX = Math.min(x + 15, window.innerWidth - 300)
	const adjustedY = Math.min(y + 15, window.innerHeight - 200)
	
	return (
		<div
			style={{
				position: "fixed",
				left: `${adjustedX}px`,
				top: `${adjustedY}px`,
				background: "rgba(20, 20, 20, 0.95)",
				border: "1px solid rgba(255, 255, 255, 0.2)",
				borderRadius: "6px",
				padding: "12px 16px",
				color: "#fff",
				fontSize: "13px",
				maxWidth: "280px",
				boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
				pointerEvents: "none",
				zIndex: 10000,
				backdropFilter: "blur(8px)",
			}}
		>
			<div style={{ fontWeight: "600", marginBottom: "8px", fontSize: "14px" }}>
				{node.label}
			</div>
			
			<div style={{ display: "flex", alignItems: "center", marginBottom: "6px", color: "#aaa" }}>
				<span>{getTypeLabel()}</span>
			</div>
			
			{node.description && (
				<div style={{ 
					marginTop: "8px", 
					paddingTop: "8px", 
					borderTop: "1px solid rgba(255, 255, 255, 0.1)",
					color: "#ccc",
					fontSize: "12px",
					maxHeight: "100px",
					overflow: "auto"
				}}>
					{node.description}
				</div>
			)}
			
			{node.parentId && (
				<div style={{ 
					marginTop: "6px", 
					color: "#888",
					fontSize: "11px"
				}}>
					父目录: {node.parentId}
				</div>
			)}
		</div>
	)
}

