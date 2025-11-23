/**
 * 力导向图 Canvas 渲染组件（基础版本，无 Worker）
 */
import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import type { GraphData, GraphNode, GraphLink } from "@roo-code/types"
import type { GraphNodeWithPosition, GraphLinkWithNodes, GraphViewState } from "./types"

interface ForceGraphProps {
	data: GraphData
	width?: number
	height?: number
	onNodeClick?: (node: GraphNode) => void
	onNodeDoubleClick?: (node: GraphNode) => void
}

export const ForceGraph = ({
	data,
	width = 800,
	height = 600,
	onNodeClick,
	onNodeDoubleClick,
}: ForceGraphProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const simulationRef = useRef<d3.Simulation<GraphNodeWithPosition, GraphLinkWithNodes> | null>(null)
	const [viewState, setViewState] = useState<GraphViewState>({
		zoom: 1,
		panX: 0,
		panY: 0,
		selectedNodeId: null,
		hoveredNodeId: null,
	})

	useEffect(() => {
		console.log("[ForceGraph] useEffect 触发，数据:", { nodes: data.nodes.length, links: data.links.length })
		if (!canvasRef.current || !data.nodes.length) {
			console.warn("[ForceGraph] Canvas 未准备好或数据为空")
			return
		}

		const canvas = canvasRef.current
		const ctx = canvas.getContext("2d")
		if (!ctx) {
			console.error("[ForceGraph] 无法获取 Canvas 上下文")
			return
		}

		console.log("[ForceGraph] 设置 Canvas 尺寸:", width, height)
		// 设置 Canvas 尺寸
		canvas.width = width
		canvas.height = height

		// 转换节点数据，添加位置信息
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

		// 创建力导向模拟
		console.log("[ForceGraph] 创建力导向模拟，节点数:", nodes.length, "边数:", links.length)
		const simulation = d3
			.forceSimulation<GraphNodeWithPosition>(nodes)
			.force(
				"link",
				d3
					.forceLink<GraphNodeWithPosition, GraphLinkWithNodes>(links)
					.id((d) => d.id)
					.distance(50)
			)
			.force("charge", d3.forceManyBody().strength(-300))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("collision", d3.forceCollide().radius(10))

		simulationRef.current = simulation
		console.log("[ForceGraph] 力导向模拟已创建")

		// 创建节点和边的映射
		const nodeMap = new Map<string, GraphNodeWithPosition>()
		nodes.forEach((node) => nodeMap.set(node.id, node))

		const linkMap = new Map<string, GraphLinkWithNodes>()
		links.forEach((link) => {
			const key = `${link.source}-${link.target}`
			linkMap.set(key, link)
		})

		// 渲染函数
		let renderCount = 0
		const render = () => {
			renderCount++
			if (renderCount % 60 === 0) {
				console.log("[ForceGraph] 渲染帧:", renderCount)
			}
			ctx.clearRect(0, 0, width, height)

			// 应用变换（缩放和平移）
			ctx.save()
			ctx.translate(viewState.panX, viewState.panY)
			ctx.scale(viewState.zoom, viewState.zoom)

			// 绘制边
			ctx.strokeStyle = "rgba(150, 150, 150, 0.3)"
			ctx.lineWidth = 1
			links.forEach((link) => {
				const source = typeof link.source === "string" ? nodeMap.get(link.source) : link.source
				const target = typeof link.target === "string" ? nodeMap.get(link.target) : link.target

				if (!source || !target) return

				ctx.beginPath()
				ctx.moveTo(source.x, source.y)
				ctx.lineTo(target.x, target.y)
				ctx.stroke()
			})

			// 绘制节点
			nodes.forEach((node) => {
				const isSelected = node.id === viewState.selectedNodeId
				const isHovered = node.id === viewState.hoveredNodeId

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

				// 绘制节点
				const radius = node.type === "directory" ? 6 : 4
				ctx.fillStyle = color
				ctx.beginPath()
				ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
				ctx.fill()

				// 选中或悬浮时绘制外圈
				if (isSelected || isHovered) {
					ctx.strokeStyle = color
					ctx.lineWidth = 2
					ctx.beginPath()
					ctx.arc(node.x, node.y, radius + 2, 0, 2 * Math.PI)
					ctx.stroke()
				}
			})

			ctx.restore()
		}

		// 监听模拟更新
		simulation.on("tick", render)

		// 初始渲染
		render()

		// 鼠标事件处理
		let isDragging = false
		let dragNode: GraphNodeWithPosition | null = null
		let lastMouseX = 0
		let lastMouseY = 0

		const handleMouseDown = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom
			const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom

			// 查找点击的节点
			const clickedNode = nodes.find((node) => {
				const dx = node.x - x
				const dy = node.y - y
				const distance = Math.sqrt(dx * dx + dy * dy)
				return distance < (node.type === "directory" ? 6 : 4)
			})

			if (clickedNode) {
				isDragging = true
				dragNode = clickedNode
				lastMouseX = e.clientX
				lastMouseY = e.clientY

				// 固定节点位置
				clickedNode.fx = clickedNode.x
				clickedNode.fy = clickedNode.y

				setViewState((prev) => ({ ...prev, selectedNodeId: clickedNode.id }))
				onNodeClick?.(clickedNode)
			}
		}

		const handleMouseMove = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom
			const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom

			if (isDragging && dragNode) {
				// 更新节点位置
				const dx = (e.clientX - lastMouseX) / viewState.zoom
				const dy = (e.clientY - lastMouseY) / viewState.zoom
				dragNode.fx! += dx
				dragNode.fy! += dy
				lastMouseX = e.clientX
				lastMouseY = e.clientY
				simulation.alpha(0.3).restart()
			} else {
				// 查找悬浮的节点
				const hoveredNode = nodes.find((node) => {
					const dx = node.x - x
					const dy = node.y - y
					const distance = Math.sqrt(dx * dx + dy * dy)
					return distance < (node.type === "directory" ? 6 : 4)
				})

				setViewState((prev) => ({
					...prev,
					hoveredNodeId: hoveredNode?.id || null,
				}))
			}
		}

		const handleMouseUp = () => {
			if (isDragging && dragNode) {
				// 释放节点
				dragNode.fx = null
				dragNode.fy = null
				isDragging = false
				dragNode = null
			}
		}

		const handleDoubleClick = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom
			const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom

			const clickedNode = nodes.find((node) => {
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
			setViewState((prev) => ({
				...prev,
				zoom: Math.max(0.1, Math.min(3, prev.zoom * delta)),
			}))
		}

		canvas.addEventListener("mousedown", handleMouseDown)
		canvas.addEventListener("mousemove", handleMouseMove)
		canvas.addEventListener("mouseup", handleMouseUp)
		canvas.addEventListener("dblclick", handleDoubleClick)
		canvas.addEventListener("wheel", handleWheel)

		// 清理函数
		return () => {
			simulation.stop()
			canvas.removeEventListener("mousedown", handleMouseDown)
			canvas.removeEventListener("mousemove", handleMouseMove)
			canvas.removeEventListener("mouseup", handleMouseUp)
			canvas.removeEventListener("dblclick", handleDoubleClick)
			canvas.removeEventListener("wheel", handleWheel)
		}
	}, [data, width, height, viewState.zoom, viewState.panX, viewState.panY, viewState.selectedNodeId, viewState.hoveredNodeId, onNodeClick, onNodeDoubleClick])

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

