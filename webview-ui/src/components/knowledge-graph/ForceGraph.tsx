/**
 * 力导向图 Canvas 渲染组件（完整优化版本）
 * 阶段1: 修复useEffect依赖问题，实现画布平移功能
 * 阶段3: 视锥剔除 + LOD
 * 阶段4: 发光效果 + 文字标签
 */
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import * as d3 from "d3"
import type { GraphData, GraphNode } from "@roo-code/types"
import type { GraphNodeWithPosition, GraphLinkWithNodes } from "./types"

/**
 * 预渲染发光Sprite（性能优化：避免使用shadowBlur）
 */
function createGlowSprite(color: string, radius: number): HTMLCanvasElement {
	const size = radius * 6
	const offscreen = document.createElement('canvas')
	offscreen.width = offscreen.height = size
	const ctx = offscreen.getContext('2d')!
	
	const centerX = size / 2
	const centerY = size / 2
	
	// 将颜色转换为 d3 RGB 对象，以便统一处理
	const colorRgb = d3.rgb(color)
	if (!colorRgb || isNaN(colorRgb.r)) {
		// 如果颜色无效，使用默认颜色
		console.warn('[createGlowSprite] Invalid color:', color)
		return offscreen
	}
	
	// 使用径向渐变模拟发光效果（使用 rgba 格式确保兼容性）
	const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2.5)
	gradient.addColorStop(0, colorRgb.toString())
	gradient.addColorStop(0.3, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.8)`)
	gradient.addColorStop(0.6, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.4)`)
	gradient.addColorStop(1, 'transparent')
	
	ctx.fillStyle = gradient
	ctx.fillRect(0, 0, size, size)
	
	return offscreen
}

/**
 * 绘制实心箭头
 */
function drawArrow(
	ctx: CanvasRenderingContext2D,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	arrowSize: number = 10
) {
	const angle = Math.atan2(toY - fromY, toX - fromX)
	const arrowAngle = Math.PI / 6 // 30度
	
	// 绘制实心三角形箭头
	ctx.beginPath()
	ctx.moveTo(toX, toY)
	ctx.lineTo(
		toX - arrowSize * Math.cos(angle - arrowAngle),
		toY - arrowSize * Math.sin(angle - arrowAngle)
	)
	ctx.lineTo(
		toX - arrowSize * Math.cos(angle + arrowAngle),
		toY - arrowSize * Math.sin(angle + arrowAngle)
	)
	ctx.closePath()
	ctx.fill() // 使用填充而不是描边
}

/**
 * Sprite缓存管理
 */
class SpriteCache {
	private cache = new Map<string, HTMLCanvasElement>()
	
	get(color: string, radius: number): HTMLCanvasElement {
		const key = `${color}-${radius}`
		if (!this.cache.has(key)) {
			this.cache.set(key, createGlowSprite(color, radius))
		}
		return this.cache.get(key)!
	}
	
	clear() {
		this.cache.clear()
	}
}

interface ForceGraphProps {
	data: GraphData
	width?: number
	height?: number
	zoom?: number
	onZoomChange?: (zoom: number) => void
	resetTrigger?: number
	onNodeClick?: (node: GraphNode | null) => void
	onNodeHover?: (node: GraphNode | null) => void
	onNodeDoubleClick?: (node: GraphNode) => void
}

export const ForceGraph = ({
	data,
	width = 800,
	height = 600,
	zoom: externalZoom = 1,
	onZoomChange,
	resetTrigger = 0,
	onNodeClick,
	onNodeHover,
	onNodeDoubleClick,
}: ForceGraphProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const simulationRef = useRef<d3.Simulation<GraphNodeWithPosition, GraphLinkWithNodes> | null>(null)
	const nodesRef = useRef<GraphNodeWithPosition[]>([])
	const linksRef = useRef<GraphLinkWithNodes[]>([])
	const nodeMapRef = useRef<Map<string, GraphNodeWithPosition>>(new Map())
	
	// Sprite缓存（阶段4：发光效果）
	const spriteCacheRef = useRef(new SpriteCache())
	
	// 使用外部传入的 zoom（受控组件）
	const zoom = externalZoom
	
	// 分离viewState为独立状态，避免过度重渲染
	const [panX, setPanX] = useState(0)
	const [panY, setPanY] = useState(0)
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
	
	// 使用ref存储viewState，避免在事件处理器中依赖state
	const viewStateRef = useRef({ zoom, panX, panY, selectedNodeId, hoveredNodeId })
	useEffect(() => {
		viewStateRef.current = { zoom, panX, panY, selectedNodeId, hoveredNodeId }
	}, [zoom, panX, panY, selectedNodeId, hoveredNodeId])
	
	// 清理Sprite缓存
	useEffect(() => {
		return () => {
			spriteCacheRef.current.clear()
		}
	}, [])
	
	// 监听重置触发器
	useEffect(() => {
		if (resetTrigger > 0) {
			setPanX(0)
			setPanY(0)
			setSelectedNodeId(null)
			console.log("[ForceGraph] 视图已重置")
		}
	}, [resetTrigger])

	// 渲染函数（使用useCallback避免重复创建）
	// 阶段3优化：添加视锥剔除和LOD
	const render = useCallback(() => {
		const canvas = canvasRef.current
		const ctx = canvas?.getContext("2d")
		if (!canvas || !ctx) return
		
		const { zoom, panX, panY, selectedNodeId, hoveredNodeId } = viewStateRef.current
		const nodes = nodesRef.current
		const links = linksRef.current
		const nodeMap = nodeMapRef.current
		
		ctx.clearRect(0, 0, width, height)
		
		// 应用变换（缩放和平移）
		ctx.save()
		ctx.translate(panX, panY)
		ctx.scale(zoom, zoom)
		
		// 视锥剔除：计算可见区域边界（world坐标）
		const padding = 100 // 边界扩展，避免边缘节点突然消失
		const viewLeft = (-panX - padding) / zoom
		const viewRight = (width - panX + padding) / zoom
		const viewTop = (-panY - padding) / zoom
		const viewBottom = (height - panY + padding) / zoom
		
		// 过滤可见节点
		const visibleNodes = nodes.filter((node) => {
			return node.x >= viewLeft && node.x <= viewRight &&
			       node.y >= viewTop && node.y <= viewBottom
		})
		
		// LOD策略：根据缩放级别调整渲染细节
		const showLinks = zoom >= 0.2  // 缩放<0.2时隐藏连线
		const showAllLabels = zoom >= 1.5  // 缩放>=1.5时显示所有标签
		const showSmallNodes = zoom >= 0.2  // 缩放<0.2时只显示目录节点
		
		// 绘制边（LOD优化 + 箭头）
		if (showLinks) {
			ctx.strokeStyle = "rgba(150, 150, 150, 0.3)"
			ctx.lineWidth = 1 / zoom // 根据缩放调整线宽
			
			// 只绘制可见节点相关的边
			const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
			links.forEach((link) => {
				const source = typeof link.source === "string" ? nodeMap.get(link.source) : link.source
				const target = typeof link.target === "string" ? nodeMap.get(link.target) : link.target
				
				if (!source || !target) return
				
				// 视锥剔除：跳过不可见的边
				if (!visibleNodeIds.has(source.id) && !visibleNodeIds.has(target.id)) return
				
				// 绘制连线
				ctx.beginPath()
				ctx.moveTo(source.x, source.y)
				ctx.lineTo(target.x, target.y)
				ctx.stroke()
				
				// 绘制箭头（从target指向source，表示source依赖target）
				if (zoom >= 0.5) { // 只在缩放足够大时显示箭头
					const arrowSize = Math.max(6, 8 / zoom)
					// 箭头方向：target -> source（被依赖方指向依赖方）
					drawArrow(ctx, target.x, target.y, source.x, source.y, arrowSize)
				}
			})
		}
		
		// 绘制节点（带LOD + 发光效果）
		const spriteCache = spriteCacheRef.current
		let renderedCount = 0
		
		visibleNodes.forEach((node) => {
			// LOD优化：极小缩放时只渲染目录节点
			if (!showSmallNodes && node.type !== "directory") return
			
			const isSelected = node.id === selectedNodeId
			const isHovered = node.id === hoveredNodeId
			
			// 根据节点类型设置颜色
			let color = "#666"
			if (node.type === "directory") {
				color = "#8b5cf6" // 紫色
			} else if (node.fileType === "source") {
				color = "#06b6d4" // 青色
			} else if (node.fileType === "test") {
				color = "#10b981" // 绿色
			} else if (node.fileType === "config") {
				color = "#f59e0b" // 橙色
			}
			
			// 根据状态调整颜色
			if (isSelected) {
				color = "#3b82f6" // 蓝色
			} else if (isHovered) {
				color = d3.rgb(color).brighter(1).toString()
			}
			
			const radius = node.type === "directory" ? 6 : 4
			
			// 阶段4：使用预渲染Sprite绘制发光效果
			if (zoom >= 0.5) { // 只在较大缩放时显示发光
				const sprite = spriteCache.get(color, radius)
				const spriteSize = sprite.width
				ctx.globalAlpha = 0.8
				ctx.drawImage(
					sprite,
					node.x - spriteSize / 2,
					node.y - spriteSize / 2,
					spriteSize,
					spriteSize
				)
				ctx.globalAlpha = 1.0
			}
			
			// 绘制节点核心
			ctx.fillStyle = color
			ctx.beginPath()
			ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
			ctx.fill()
			
			// 选中或悬浮时绘制外圈
			if (isSelected || isHovered) {
				ctx.strokeStyle = color
				ctx.lineWidth = 2
				ctx.beginPath()
				ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI)
				ctx.stroke()
				
				// 额外的高亮圈（半透明）
				const colorObj = d3.rgb(color)
				if (colorObj && !isNaN(colorObj.r)) {
					ctx.strokeStyle = `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, 0.5)`
					ctx.lineWidth = 1
					ctx.beginPath()
					ctx.arc(node.x, node.y, radius + 6, 0, 2 * Math.PI)
					ctx.stroke()
				}
			}
			
			// 绘制标签（LOD优化：只在高缩放或选中/悬浮时显示，避免重叠）
			const shouldShowLabel = showAllLabels || isSelected || isHovered
			if (shouldShowLabel) {
				ctx.fillStyle = "#fff"
				ctx.strokeStyle = "#000"
				ctx.lineWidth = 3
				ctx.font = `${Math.max(10, 12 / zoom)}px sans-serif`
				ctx.textAlign = "center"
				ctx.textBaseline = "top"
				
				// 限制标签长度
				const maxLength = 20
				let label = node.label
				if (label.length > maxLength) {
					label = label.substring(0, maxLength) + "..."
				}
				
				const labelY = node.y + radius + 6
				// 描边增加可读性
				ctx.strokeText(label, node.x, labelY)
				ctx.fillText(label, node.x, labelY)
			}
			
			renderedCount++
		})
		
		ctx.restore()
	}, [width, height])
	
	// 初始化simulation - 只在数据变化时执行
	useEffect(() => {
		console.log("[ForceGraph] 初始化simulation，数据:", { nodes: data.nodes.length, links: data.links.length })
		if (!canvasRef.current || !data.nodes.length) {
			console.warn("[ForceGraph] Canvas 未准备好或数据为空")
			return
		}
		
		const canvas = canvasRef.current
		canvas.width = width
		canvas.height = height
		
		// 转换节点数据
		const nodes: GraphNodeWithPosition[] = data.nodes.map((node) => ({
			...node,
			x: Math.random() * width,
			y: Math.random() * height,
			vx: 0,
			vy: 0,
		}))
		
		// 转换边数据
		const links: GraphLinkWithNodes[] = data.links.map((link) => ({
			...link,
			source: link.source,
			target: link.target,
		}))
		
		// 创建节点映射
		const nodeMap = new Map<string, GraphNodeWithPosition>()
		nodes.forEach((node) => nodeMap.set(node.id, node))
		
		// 保存到ref
		nodesRef.current = nodes
		linksRef.current = links
		nodeMapRef.current = nodeMap
		
		// 创建优化的力导向模拟
		const simulation = d3
			.forceSimulation<GraphNodeWithPosition>(nodes)
			.force(
				"link",
				d3
					.forceLink<GraphNodeWithPosition, GraphLinkWithNodes>(links)
					.id((d) => d.id)
					.distance(80) // 增加连接距离，让节点更分散
					.strength(0.3) // 降低连接强度
			)
			.force("charge", d3.forceManyBody().strength(-400).distanceMax(300)) // 增强排斥力
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("collision", d3.forceCollide<GraphNodeWithPosition>().radius((d) => {
				// 根据节点类型和标签长度动态设置碰撞半径
				const baseRadius = d.type === "directory" ? 8 : 6
				const labelLength = d.label.length
				// 考虑标签宽度，假设每个字符约6像素
				const labelRadius = Math.min(labelLength * 3, 60) // 最大60像素
				return Math.max(baseRadius, labelRadius)
			}).strength(1)) // 碰撞力强度设为1，确保不重叠
			.alphaDecay(0.015) // 减慢衰减，让布局更充分
			.velocityDecay(0.4) // 增加阻尼
		
		simulationRef.current = simulation
		
		// 监听tick事件
		simulation.on("tick", render)
		
		console.log("[ForceGraph] Simulation 已创建并启动")
		
		// 清理函数
		return () => {
			console.log("[ForceGraph] 停止 simulation")
			simulation.stop()
		}
	}, [data, width, height, render])
	
	// 视图状态变化时重新渲染（不重启simulation）
	useEffect(() => {
		render()
	}, [zoom, panX, panY, selectedNodeId, hoveredNodeId, render])
	
	// 鼠标事件处理
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		
		let isDraggingNode = false
		let isDraggingCanvas = false
		let dragNode: GraphNodeWithPosition | null = null
		let lastMouseX = 0
		let lastMouseY = 0
		
		const handleMouseDown = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			const { zoom, panX, panY } = viewStateRef.current
			const x = (e.clientX - rect.left - panX) / zoom
			const y = (e.clientY - rect.top - panY) / zoom
			
			// 查找点击的节点
			const clickedNode = nodesRef.current.find((node) => {
				const dx = node.x - x
				const dy = node.y - y
				const distance = Math.sqrt(dx * dx + dy * dy)
				return distance < (node.type === "directory" ? 6 : 4)
			})
			
			lastMouseX = e.clientX
			lastMouseY = e.clientY
			
			if (clickedNode) {
				// 拖拽节点
				isDraggingNode = true
				dragNode = clickedNode
				clickedNode.fx = clickedNode.x
				clickedNode.fy = clickedNode.y
				setSelectedNodeId(clickedNode.id)
				onNodeClick?.(clickedNode)
			} else {
				// 拖拽画布（平移功能）
				isDraggingCanvas = true
				canvas.style.cursor = "grabbing"
			}
		}
		
		const handleMouseMove = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			const { zoom, panX, panY } = viewStateRef.current
			
			if (isDraggingNode && dragNode) {
				// 拖拽节点
				const dx = (e.clientX - lastMouseX) / zoom
				const dy = (e.clientY - lastMouseY) / zoom
				dragNode.fx! += dx
				dragNode.fy! += dy
				lastMouseX = e.clientX
				lastMouseY = e.clientY
				simulationRef.current?.alpha(0.3).restart()
			} else if (isDraggingCanvas) {
				// 拖拽画布（平移）
				const dx = e.clientX - lastMouseX
				const dy = e.clientY - lastMouseY
				setPanX(panX + dx)
				setPanY(panY + dy)
				lastMouseX = e.clientX
				lastMouseY = e.clientY
			} else {
				// 悬浮检测
				const x = (e.clientX - rect.left - panX) / zoom
				const y = (e.clientY - rect.top - panY) / zoom
				const hoveredNode = nodesRef.current.find((node) => {
					const dx = node.x - x
					const dy = node.y - y
					const distance = Math.sqrt(dx * dx + dy * dy)
					return distance < (node.type === "directory" ? 6 : 4)
				})
				const newHoveredId = hoveredNode?.id || null
				if (newHoveredId !== hoveredNodeId) {
					setHoveredNodeId(newHoveredId)
					onNodeHover?.(hoveredNode || null)
				}
				canvas.style.cursor = hoveredNode ? "pointer" : "grab"
			}
		}
		
		const handleMouseUp = () => {
			if (isDraggingNode && dragNode) {
				dragNode.fx = null
				dragNode.fy = null
				isDraggingNode = false
				dragNode = null
			}
			if (isDraggingCanvas) {
				isDraggingCanvas = false
				canvas.style.cursor = "grab"
			}
		}
		
		const handleDoubleClick = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			const { zoom, panX, panY } = viewStateRef.current
			const x = (e.clientX - rect.left - panX) / zoom
			const y = (e.clientY - rect.top - panY) / zoom
			
			const clickedNode = nodesRef.current.find((node) => {
				const dx = node.x - x
				const dy = node.y - y
				const distance = Math.sqrt(dx * dx + dy * dy)
				return distance < (node.type === "directory" ? 6 : 4)
			})
			
			if (clickedNode && clickedNode.type === "file") {
				onNodeDoubleClick?.(clickedNode)
			}
		}
		
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault()
			const delta = e.deltaY > 0 ? 0.9 : 1.1
			const { zoom } = viewStateRef.current
			const newZoom = Math.max(0.1, Math.min(3, zoom * delta))
			onZoomChange?.(newZoom)
		}
		
		canvas.addEventListener("mousedown", handleMouseDown)
		canvas.addEventListener("mousemove", handleMouseMove)
		canvas.addEventListener("mouseup", handleMouseUp)
		canvas.addEventListener("mouseleave", handleMouseUp)
		canvas.addEventListener("dblclick", handleDoubleClick)
		canvas.addEventListener("wheel", handleWheel, { passive: false })
		
		canvas.style.cursor = "grab"
		
		return () => {
			canvas.removeEventListener("mousedown", handleMouseDown)
			canvas.removeEventListener("mousemove", handleMouseMove)
			canvas.removeEventListener("mouseup", handleMouseUp)
			canvas.removeEventListener("mouseleave", handleMouseUp)
			canvas.removeEventListener("dblclick", handleDoubleClick)
			canvas.removeEventListener("wheel", handleWheel)
		}
	}, [onNodeClick, onNodeHover, onNodeDoubleClick, hoveredNodeId])

	return (
		<canvas
			ref={canvasRef}
			style={{
				width: "100%",
				height: "100%",
				cursor: "pointer",
				background: "var(--vscode-editor-background, #1e1e1e)",
			}}
		/>
	)
}

