/**
 * 使用 Web Worker 的力导向图组件
 * 用于大规模节点（>1000）的性能优化
 * 包含发光效果和LOD优化
 */
import { useEffect, useRef, useState, useCallback } from "react"
import * as d3 from "d3"
import type { GraphData, GraphNode } from "@roo-code/types"
import type { GraphNodeWithPosition, WorkerMessage } from "./types"

/**
 * 预渲染发光Sprite
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
		console.warn('[createGlowSprite] Invalid color:', color)
		return offscreen
	}
	
	// 使用 rgba 格式确保兼容性
	const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2.5)
	gradient.addColorStop(0, colorRgb.toString())
	gradient.addColorStop(0.3, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.8)`)
	gradient.addColorStop(0.6, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.4)`)
	gradient.addColorStop(1, 'transparent')
	
	ctx.fillStyle = gradient
	ctx.fillRect(0, 0, size, size)
	
	return offscreen
}

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

interface ForceGraphWorkerProps {
	data: GraphData
	width?: number
	height?: number
	onNodeClick?: (node: GraphNode | null) => void
	onNodeHover?: (node: GraphNode | null) => void
	onNodeDoubleClick?: (node: GraphNode) => void
}

export const ForceGraphWorker = ({
	data,
	width = 800,
	height = 600,
	onNodeClick,
	onNodeHover,
	onNodeDoubleClick,
}: ForceGraphWorkerProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const workerRef = useRef<Worker | null>(null)
	const nodesRef = useRef<GraphNodeWithPosition[]>([])
	const nodeMapRef = useRef<Map<string, GraphNodeWithPosition>>(new Map())
	const spriteCacheRef = useRef(new SpriteCache())
	
	// 视图状态
	const [zoom, setZoom] = useState(1)
	const [panX, setPanX] = useState(0)
	const [panY, setPanY] = useState(0)
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
	const [alpha, setAlpha] = useState(1)
	
	const viewStateRef = useRef({ zoom, panX, panY, selectedNodeId, hoveredNodeId })
	useEffect(() => {
		viewStateRef.current = { zoom, panX, panY, selectedNodeId, hoveredNodeId }
	}, [zoom, panX, panY, selectedNodeId, hoveredNodeId])
	
	// 清理Sprite缓存
	useEffect(() => {
		const cache = spriteCacheRef.current
		return () => {
			cache.clear()
		}
	}, [])
	
	// 渲染函数（带视锥剔除和LOD优化）
	const render = useCallback(() => {
		const canvas = canvasRef.current
		const ctx = canvas?.getContext("2d")
		if (!canvas || !ctx) return
		
		const { zoom, panX, panY, selectedNodeId, hoveredNodeId } = viewStateRef.current
		const nodes = nodesRef.current
		const nodeMap = nodeMapRef.current
		
		ctx.clearRect(0, 0, width, height)
		ctx.save()
		ctx.translate(panX, panY)
		ctx.scale(zoom, zoom)
		
		// 视锥剔除
		const padding = 100
		const viewLeft = (-panX - padding) / zoom
		const viewRight = (width - panX + padding) / zoom
		const viewTop = (-panY - padding) / zoom
		const viewBottom = (height - panY + padding) / zoom
		
		const visibleNodes = nodes.filter((node) => {
			return node.x >= viewLeft && node.x <= viewRight &&
			       node.y >= viewTop && node.y <= viewBottom
		})
		
		// LOD策略
		const showLinks = zoom >= 0.2
		const showLabels = zoom >= 0.5
		const showSmallNodes = zoom >= 0.2
		
		// 绘制边
		if (showLinks) {
			ctx.strokeStyle = "rgba(150, 150, 150, 0.3)"
			ctx.lineWidth = 1 / zoom
			
			const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
			data.links.forEach((link) => {
				const sourceId = typeof link.source === 'string' ? link.source : link.source
				const targetId = typeof link.target === 'string' ? link.target : link.target
				const source = nodeMap.get(sourceId)
				const target = nodeMap.get(targetId)
				if (!source || !target) return
				
				if (!visibleNodeIds.has(source.id) && !visibleNodeIds.has(target.id)) return
				
				ctx.beginPath()
				ctx.moveTo(source.x, source.y)
				ctx.lineTo(target.x, target.y)
				ctx.stroke()
			})
		}
		
		// 绘制节点（带发光效果）
		const spriteCache = spriteCacheRef.current
		let renderedCount = 0
		
		visibleNodes.forEach((node) => {
			if (!showSmallNodes && node.type !== "directory") return
			
			const isSelected = node.id === selectedNodeId
			const isHovered = node.id === hoveredNodeId
			
			let color = "#666"
			if (node.type === "directory") {
				color = "#8b5cf6"
			} else if (node.fileType === "source") {
				color = "#06b6d4"
			} else if (node.fileType === "test") {
				color = "#10b981"
			} else if (node.fileType === "config") {
				color = "#f59e0b"
			}
			
			if (isSelected) {
				color = "#3b82f6"
			} else if (isHovered) {
				color = d3.rgb(color).brighter(1).toString()
			}
			
			const radius = node.type === "directory" ? 6 : 4
			
			// 使用Sprite绘制发光效果
			if (zoom >= 0.5) {
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
			
			// 绘制标签
			if (showLabels && (isSelected || isHovered || zoom >= 1.0)) {
				ctx.fillStyle = "#fff"
				ctx.strokeStyle = "#000"
				ctx.lineWidth = 3
				ctx.font = `${Math.max(10, 12 / zoom)}px sans-serif`
				ctx.textAlign = "center"
				ctx.textBaseline = "top"
				
				const maxLength = 20
				let label = node.label
				if (label.length > maxLength) {
					label = label.substring(0, maxLength) + "..."
				}
				
				const labelY = node.y + radius + 6
				ctx.strokeText(label, node.x, labelY)
				ctx.fillText(label, node.x, labelY)
			}
			
			renderedCount++
		})
		
		ctx.restore()
		
		// 性能统计
		ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
		ctx.fillRect(width - 180, 10, 170, 85)
		ctx.fillStyle = "#fff"
		ctx.font = "11px monospace"
		ctx.fillText(`总节点: ${nodes.length}`, width - 170, 25)
		ctx.fillText(`可见节点: ${visibleNodes.length}`, width - 170, 40)
		ctx.fillText(`渲染节点: ${renderedCount}`, width - 170, 55)
		ctx.fillText(`缩放: ${zoom.toFixed(2)}x`, width - 170, 70)
		if (alpha > 0.01) {
			ctx.fillText(`Alpha: ${alpha.toFixed(3)}`, width - 170, 85)
		}
	}, [width, height, data.links, alpha])
	
	// 初始化Worker和数据
	useEffect(() => {
		console.log("[ForceGraphWorker] 初始化 Worker，数据:", { nodes: data.nodes.length, links: data.links.length })
		
		const canvas = canvasRef.current
		if (!canvas || !data.nodes.length) return
		
		canvas.width = width
		canvas.height = height
		
		// 初始化节点
		const nodes: GraphNodeWithPosition[] = data.nodes.map((node) => ({
			...node,
			x: Math.random() * width,
			y: Math.random() * height,
			vx: 0,
			vy: 0,
		}))
		
		const nodeMap = new Map<string, GraphNodeWithPosition>()
		nodes.forEach((node) => nodeMap.set(node.id, node))
		
		nodesRef.current = nodes
		nodeMapRef.current = nodeMap
		
		// 创建 Worker（使用Vite的Worker导入语法）
		try {
			const worker = new Worker(new URL('./GraphWorker.ts', import.meta.url), { 
				type: 'module' 
			})
			workerRef.current = worker
			
			// 监听Worker消息
			worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
				const { type, positions, nodeIds, alpha: workerAlpha } = e.data
				
				if (type === 'tick' && positions && nodeIds) {
					// 更新节点位置
					nodeIds.forEach((id, i) => {
						const node = nodeMap.get(id)
						if (node) {
							node.x = positions[i * 2]
							node.y = positions[i * 2 + 1]
						}
					})
					
					if (workerAlpha !== undefined) {
						setAlpha(workerAlpha)
					}
					
					// 触发渲染
					render()
				} else if (type === 'end') {
					console.log("[ForceGraphWorker] Simulation 完成")
					setAlpha(0)
				}
			}
			
			worker.onerror = (error) => {
				console.error("[ForceGraphWorker] Worker 错误:", error)
			}
			
			// 初始化Worker
			worker.postMessage({
				type: 'init',
				data: {
					nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, type: n.type })),
					links: data.links,
					width,
					height,
				},
			})
			
			console.log("[ForceGraphWorker] Worker 已启动")
		} catch (error) {
			console.error("[ForceGraphWorker] Worker 创建失败:", error)
		}
		
		return () => {
			if (workerRef.current) {
				workerRef.current.postMessage({ type: 'stop' })
				workerRef.current.terminate()
				workerRef.current = null
				console.log("[ForceGraphWorker] Worker 已终止")
			}
		}
	}, [data, width, height, render])
	
	// 视图状态变化时重新渲染
	useEffect(() => {
		render()
	}, [zoom, panX, panY, selectedNodeId, hoveredNodeId, render])
	
	// 鼠标事件处理
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		
		let isDraggingNode = false
		let isDraggingCanvas = false
		let dragNodeId: string | null = null
		let lastMouseX = 0
		let lastMouseY = 0
		
		const handleMouseDown = (e: MouseEvent) => {
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
			
			lastMouseX = e.clientX
			lastMouseY = e.clientY
			
			if (clickedNode) {
				isDraggingNode = true
				dragNodeId = clickedNode.id
				// 通知Worker固定节点
				workerRef.current?.postMessage({
					type: 'update',
					data: { nodeId: clickedNode.id, fx: clickedNode.x, fy: clickedNode.y },
				})
				setSelectedNodeId(clickedNode.id)
				onNodeClick?.(clickedNode)
			} else {
				isDraggingCanvas = true
				canvas.style.cursor = "grabbing"
			}
		}
		
		const handleMouseMove = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			const { zoom, panX, panY } = viewStateRef.current
			
			if (isDraggingNode && dragNodeId) {
				const node = nodeMapRef.current.get(dragNodeId)
				if (node) {
					const dx = (e.clientX - lastMouseX) / zoom
					const dy = (e.clientY - lastMouseY) / zoom
					node.x += dx
					node.y += dy
					workerRef.current?.postMessage({
						type: 'update',
						data: { nodeId: dragNodeId, fx: node.x, fy: node.y },
					})
					lastMouseX = e.clientX
					lastMouseY = e.clientY
					render()
				}
			} else if (isDraggingCanvas) {
				const dx = e.clientX - lastMouseX
				const dy = e.clientY - lastMouseY
				setPanX(panX + dx)
				setPanY(panY + dy)
				lastMouseX = e.clientX
				lastMouseY = e.clientY
			} else {
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
			if (isDraggingNode && dragNodeId) {
				workerRef.current?.postMessage({
					type: 'release',
					data: { nodeId: dragNodeId },
				})
				isDraggingNode = false
				dragNodeId = null
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
			setZoom(Math.max(0.1, Math.min(3, zoom * delta)))
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
	}, [onNodeClick, onNodeHover, onNodeDoubleClick, render, hoveredNodeId])
	
	return (
		<canvas
			ref={canvasRef}
			style={{
				width: "100%",
				height: "100%",
				cursor: "pointer",
				background: "#1e1e1e",
			}}
		/>
	)
}

