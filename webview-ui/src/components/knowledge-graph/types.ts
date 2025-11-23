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

