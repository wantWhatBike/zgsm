/**
 * 知识图谱力导向布局计算 Worker
 * 将 d3-force 计算移到 Worker 线程，避免阻塞主线程
 */
import * as d3 from "d3"

interface WorkerNode {
	id: string
	label: string
	x: number
	y: number
	vx?: number
	vy?: number
	fx?: number | null
	fy?: number | null
	type: 'file' | 'directory'
}

interface WorkerLink {
	source: string | WorkerNode
	target: string | WorkerNode
	type: 'import' | 'reference' | 'contains'
}

let simulation: d3.Simulation<WorkerNode, WorkerLink> | null = null
let nodes: WorkerNode[] = []
let tickCount = 0
const TICK_BATCH = 5 // 每5帧发送一次位置数据，减少通信开销

self.onmessage = (e: MessageEvent) => {
	const { type, data } = e.data

	switch (type) {
		case 'init': {
			const { nodes: inputNodes, links: inputLinks, width, height } = data
			
			// 初始化节点
			nodes = inputNodes.map((node: any) => ({
				id: node.id,
				label: node.label,
				x: node.x || Math.random() * width,
				y: node.y || Math.random() * height,
				vx: 0,
				vy: 0,
				type: node.type,
			}))

			// 初始化边
			const links: WorkerLink[] = inputLinks.map((link: any) => ({
				source: link.source,
				target: link.target,
				type: link.type,
			}))

			// 创建力导向模拟
			simulation = d3
				.forceSimulation<WorkerNode>(nodes)
				.force(
					'link',
					d3
						.forceLink<WorkerNode, WorkerLink>(links)
						.id((d) => d.id)
						.distance(80) // 增加连接距离
						.strength(0.3) // 降低连接强度
				)
				.force('charge', d3.forceManyBody().strength(-400).distanceMax(300)) // 增强排斥力
				.force('center', d3.forceCenter(width / 2, height / 2))
				.force('collision', d3.forceCollide<WorkerNode>().radius((d) => {
					// 根据节点类型和标签长度动态设置碰撞半径
					const baseRadius = d.type === 'directory' ? 8 : 6
					const labelLength = d.label.length
					// 考虑标签宽度
					const labelRadius = Math.min(labelLength * 3, 60)
					return Math.max(baseRadius, labelRadius)
				}).strength(1)) // 碰撞力强度设为1
				.alphaDecay(0.015) // 减慢衰减
				.velocityDecay(0.4)
				.on('tick', () => {
					tickCount++
					
					// 批量发送，减少通信开销
					if (tickCount % TICK_BATCH === 0) {
						sendPositions()
					}
				})
				.on('end', () => {
					// 模拟结束时发送最终位置
					sendPositions()
					self.postMessage({ type: 'end' })
				})

			console.log('[GraphWorker] Simulation 已初始化，节点数:', nodes.length, '边数:', links.length)
			break
		}

		case 'update': {
			// 更新节点位置（例如：拖拽）
			const { nodeId, fx, fy } = data
			const node = nodes.find((n) => n.id === nodeId)
			if (node) {
				node.fx = fx
				node.fy = fy
				simulation?.alpha(0.3).restart()
			}
			break
		}

		case 'release': {
			// 释放节点固定位置
			const { nodeId } = data
			const node = nodes.find((n) => n.id === nodeId)
			if (node) {
				node.fx = null
				node.fy = null
			}
			break
		}

		case 'restart': {
			// 重启模拟（例如：数据过滤后）
			const { filteredNodes } = data
			if (filteredNodes) {
				// 更新可见节点
				nodes = filteredNodes.map((node: any) => ({
					...node,
					x: node.x || Math.random() * data.width,
					y: node.y || Math.random() * data.height,
				}))
				
				// 重新创建模拟
				if (simulation) {
					simulation.stop()
				}
				
				// 递归调用init逻辑
				self.postMessage({ type: 'init', data })
			} else {
				simulation?.alpha(1).restart()
			}
			break
		}

		case 'stop': {
			// 停止模拟
			simulation?.stop()
			console.log('[GraphWorker] Simulation 已停止')
			break
		}

		case 'setForce': {
			// 动态调整力的参数
			const { forceName, params } = data
			if (simulation) {
				const force = simulation.force(forceName)
				if (force && params) {
					Object.keys(params).forEach((key) => {
						if (typeof (force as any)[key] === 'function') {
							;(force as any)[key](params[key])
						}
					})
					simulation.alpha(0.3).restart()
				}
			}
			break
		}

		default:
			console.warn('[GraphWorker] 未知消息类型:', type)
	}
}

/**
 * 使用 Transferable Objects 发送位置数据，避免深拷贝
 */
function sendPositions() {
	// 使用 Float32Array 存储位置数据（更高效）
	const positions = new Float32Array(nodes.length * 2)
	nodes.forEach((node, i) => {
		positions[i * 2] = node.x
		positions[i * 2 + 1] = node.y
	})

	// 发送节点ID映射和位置数据
	const nodeIds = nodes.map((n) => n.id)

	// 使用 Transferable Objects 传输，避免拷贝
	self.postMessage(
		{
			type: 'tick',
			positions: positions,
			nodeIds: nodeIds,
			alpha: simulation?.alpha() || 0,
		},
		{
			transfer: [positions.buffer] // Transferable Object
		}
	)
}

