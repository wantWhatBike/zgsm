import { z } from "zod"

/**
 * Knowledge Graph Constants
 */
export const KNOWLEDGE_GRAPH_DEFAULTS = {
	MIN_CONCURRENCY: 1,
	MAX_CONCURRENCY: 10,
	DEFAULT_CONCURRENCY: 5,
	MIN_BATCH_SIZE: 1,
	MAX_BATCH_SIZE: 100,
	DEFAULT_BATCH_SIZE: 10,
	MIN_MAX_FILES: 1000,
	MAX_MAX_FILES: 100000,
	DEFAULT_MAX_FILES: 50000,
	MIN_FILE_SIZE_LIMIT: 1024, // 1KB
	MAX_FILE_SIZE_LIMIT: 10 * 1024 * 1024, // 10MB
	DEFAULT_FILE_SIZE_LIMIT: 1024 * 1024, // 1MB
} as const

/**
 * UI Configuration (for frontend)
 */
export const KNOWLEDGE_GRAPH_UI_CONFIG = {
	// 轮询间隔（毫秒）
	POLLING_INTERVAL_RUNNING: 1500,
	POLLING_INTERVAL_PAUSED: 5000,
	POLLING_INTERVAL_DEFAULT: 10000,
	// 操作超时（毫秒）
	OPERATION_TIMEOUT: 10000,
	// 防抖延迟（毫秒）
	DEBOUNCE_DELAY: 300,
} as const

/**
 * Visualization Configuration (for frontend)
 */
export const KNOWLEDGE_GRAPH_VISUALIZATION_CONFIG = {
	// Worker 阈值：节点数超过此值使用 Web Worker
	WORKER_THRESHOLD: 1000,
	// 力导向图参数
	FORCE_LINK_DISTANCE: 100,
	FORCE_LINK_STRENGTH: 0.5,
	FORCE_CHARGE_STRENGTH: -300,
	FORCE_CHARGE_DISTANCE: 200,
	FORCE_COLLISION_RADIUS_BASE: 30,
	// 渲染参数
	NODE_RADIUS_BASE: 6,
	LABEL_FONT_SIZE: 10,
	TOOLTIP_DELAY_MS: 1000,
	TOOLTIP_HIDE_DELAY_MS: 200,
	// LOD (Level of Detail) 缩放阈值
	ZOOM_THRESHOLD_HIDE_LINKS: 0.2,    // 缩放<0.2时隐藏连线
	ZOOM_THRESHOLD_SHOW_ARROWS: 0.5,   // 缩放>=0.5时显示箭头
	ZOOM_THRESHOLD_SHOW_ALL_LABELS: 1.5, // 缩放>=1.5时显示所有标签
	// 视锥剔除
	VIEWPORT_PADDING: 100, // 视口边界扩展（像素）
} as const

/**
 * API Provider Constants
 */
export const API_PROVIDER = {
	ZGSM: 'zgsm'
} as const

/**
 * Knowledge Graph Message Types
 */
export const KNOWLEDGE_GRAPH_MESSAGES = {
	ENABLED: "knowledgeGraphEnabled",
	GET_STATUS: "knowledgeGraphGetStatus",
	BUILD: "knowledgeGraphBuild",
	PAUSE: "knowledgeGraphPause",
	RESUME: "knowledgeGraphResume",
	CLEAR: "knowledgeGraphClear",
	STATUS_RESPONSE: "knowledgeGraphStatusResponse",
	OPEN_GRAPH_VIEW: "knowledgeGraphOpenGraphView", // 打开可视化视图
	GET_GRAPH_DATA: "knowledgeGraphGetGraphData",   // 获取图谱数据
	GRAPH_DATA_RESPONSE: "knowledgeGraphDataResponse", // 返回图谱数据
	OPEN_FILE: "knowledgeGraphOpenFile",            // 打开文件
} as const

/**
	* Knowledge Graph Status Constants
	*/
export const KNOWLEDGE_GRAPH_STATUS = {
	PENDING: "pending",
	RUNNING: "running",
	PAUSED: "paused",
	COMPLETED: "completed",
	ERROR: "error",
} as const

/**
 * Knowledge Graph Phase Constants
 */
export const KNOWLEDGE_GRAPH_PHASE = {
	ROOT_ANALYSIS: 'root_analysis',
	FILE_ANALYSIS: 'file_analysis',
	DIRECTORY_ANALYSIS: 'directory_analysis',
	DEPENDENCY_ANALYSIS: 'dependency_analysis',
	COMPLETED: 'completed',
} as const

/**
 * Knowledge Graph Field Names (for state management)
 */
export const KNOWLEDGE_GRAPH_FIELDS = {
	ENABLED: "knowledgeGraphEnabled",
} as const

/**
	* KnowledgeGraphConfig
	*/
export const knowledgeGraphConfigSchema = z.object({
	knowledgeGraphEnabled: z.boolean().optional(),
	knowledgeGraphModel: z.string().optional(),
	knowledgeGraphMaxConcurrency: z
		.number()
		.min(KNOWLEDGE_GRAPH_DEFAULTS.MIN_CONCURRENCY)
		.max(KNOWLEDGE_GRAPH_DEFAULTS.MAX_CONCURRENCY)
		.optional(),
	knowledgeGraphBatchSize: z
		.number()
		.min(KNOWLEDGE_GRAPH_DEFAULTS.MIN_BATCH_SIZE)
		.max(KNOWLEDGE_GRAPH_DEFAULTS.MAX_BATCH_SIZE)
		.optional(),
	knowledgeGraphMaxFiles: z
		.number()
		.min(KNOWLEDGE_GRAPH_DEFAULTS.MIN_MAX_FILES)
		.max(KNOWLEDGE_GRAPH_DEFAULTS.MAX_MAX_FILES)
		.optional(),
	knowledgeGraphFileSizeLimit: z
		.number()
		.min(KNOWLEDGE_GRAPH_DEFAULTS.MIN_FILE_SIZE_LIMIT)
		.max(KNOWLEDGE_GRAPH_DEFAULTS.MAX_FILE_SIZE_LIMIT)
		.optional(),
	knowledgeGraphStorageType: z.enum(["file"]).optional(),
	knowledgeGraphIncrementalUpdate: z.boolean().optional(),
	knowledgeGraphBreakpointResume: z.boolean().optional(),
	knowledgeGraphExportFormats: z.array(z.enum(["json", "jsonl", "markdown", "zip"])).optional(),
})

export type KnowledgeGraphConfig = z.infer<typeof knowledgeGraphConfigSchema>

/**
 * KnowledgeGraphStatus
 */
export const knowledgeGraphStatusSchema = z.object({
	enabled: z.boolean(),
	isRunning: z.boolean(),
	isPaused: z.boolean(),
	progress: z.number(),
	totalFiles: z.number(),
	processedFiles: z.number(),
	currentFile: z.string(),
	status: z.enum([KNOWLEDGE_GRAPH_STATUS.PENDING, KNOWLEDGE_GRAPH_STATUS.RUNNING, KNOWLEDGE_GRAPH_STATUS.PAUSED, KNOWLEDGE_GRAPH_STATUS.COMPLETED, KNOWLEDGE_GRAPH_STATUS.ERROR]),
	error: z.string().optional(),
	lastUpdated: z.string().optional(),
})

export type KnowledgeGraphStatus = z.infer<typeof knowledgeGraphStatusSchema>

/**
 * KnowledgeGraphProvider
 */
export const knowledgeGraphProviderSchema = z.object({
	knowledgeGraphOpenAiApiKey: z.string().optional(),
	knowledgeGraphAnthropicApiKey: z.string().optional(),
	knowledgeGraphGeminiApiKey: z.string().optional(),
	knowledgeGraphOpenRouterApiKey: z.string().optional(),
})

export type KnowledgeGraphProvider = z.infer<typeof knowledgeGraphProviderSchema>

// --- Shared Types for Build State ---

export type KnowledgeGraphPhase = 'root_analysis' | 'file_analysis' | 'directory_analysis' | 'dependency_analysis' | 'completed';

export interface BuildProgress {
  phase: KnowledgeGraphPhase
  message: string
  totalFiles: number
  filesToProcess: number
  totalProcessedFiles: number
  batchProcessedFilePaths: string[]
  batchFailedFiles: number
  batchDuration?: number
  batchIndex?: number
}

export interface KnowledgeGraphBuildState {
  progress: number
  totalFiles: number
  totalFilesToProcess: number
  processedFiles: number
  failedFiles: number
  currentFile: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error'
  error?: string
  taskId?: string
  startTime?: string
  phase: KnowledgeGraphPhase
  lastUpdateTime: string
  totalDuration: number
  
  // LLM Statistics
  llmStatistics?: {
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    totalDuration: number
  }
  
  // Phase Durations
  phaseDurations?: {
    fileCollection?: number
    rootAnalysis?: number
    fileSummary?: number
    directorySummary?: number
  }

  // Phase Progress Details
  phaseProgress?: {
    root_analysis: {
      total: number
      processed: number
      status: 'pending' | 'running' | 'completed' | 'skipped'
    }
    file_analysis: {
      total: number
      processed: number
      status: 'pending' | 'running' | 'completed' | 'skipped'
    }
    directory_analysis: {
      total: number
      processed: number
      status: 'pending' | 'running' | 'completed' | 'skipped'
    }
  }
}

// --- Graph Visualization Types ---

/**
 * 图谱节点类型
 */
export interface GraphNode {
	id: string;       // 路径 (唯一标识)
	label: string;    // 文件名/目录名
	type: 'file' | 'directory';
	fileType?: 'source' | 'config' | 'test'; // 仅文件节点有
	parentId?: string; // 父目录路径，用于构建树形结构
	// 附加信息 (可选，用于详情展示)
	description?: string;
}

/**
 * 图谱边类型
 */
export interface GraphLink {
	source: string; // 源节点 ID
	target: string; // 目标节点 ID
	type: 'import' | 'reference' | 'contains'; // 关系类型
}

/**
 * 图谱数据
 */
export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}