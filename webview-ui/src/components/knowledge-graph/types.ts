/**
 * 知识图谱可视化前端类型定义
 */

export interface GraphNodePosition {
	x: number
	y: number
	vx?: number
	vy?: number
	fx?: number | null
	fy?: number | null
}

export interface GraphNodeWithPosition {
	id: string
	label: string
	type: 'file' | 'directory'
	fileType?: 'source' | 'config' | 'test'
	parentId?: string
	description?: string
	x: number
	y: number
	vx?: number
	vy?: number
	fx?: number | null
	fy?: number | null
}

export interface GraphLinkWithNodes {
	source: GraphNodeWithPosition | string
	target: GraphNodeWithPosition | string
	type: 'import' | 'reference' | 'contains'
}

export interface GraphViewState {
	zoom: number
	panX: number
	panY: number
	selectedNodeId: string | null
	hoveredNodeId: string | null
}

/**
 * Web Worker 消息类型
 */
export interface WorkerMessage {
	type: 'init' | 'update' | 'release' | 'restart' | 'stop' | 'setForce' | 'tick' | 'end'
	data?: any
	positions?: Float32Array
	nodeIds?: string[]
	alpha?: number
}

/**
 * 视图控制接口（阶段6）
 */
export interface ViewControl {
	flyToNode: (nodeId: string) => void
	setZoom: (zoom: number) => void
	resetView: () => void
}

