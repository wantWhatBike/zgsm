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
	status: z.enum(["pending", "running", "paused", "completed", "error"]),
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