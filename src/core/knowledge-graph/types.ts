/**
 * 知识图谱类型定义
 */

// 文件摘要
export interface FileSummary {
  path: string
  type: 'source' | 'config' | 'document' | 'test'
  description: string
  keywords: string[]
  core_functions: Record<string, string>
  dependencies: string[]
  timestamp: string
  size: number
  lastModified: number
}

// 目录摘要
export interface DirectorySummary {
  path: string
  type: 'module' | 'utils' | 'config' | 'feature'
  description: string
  keywords: string[]
  key_files: string[]
  upstream: string[]
  downstream: string[]
  collaboration: string
  timestamp: string
}

// 依赖关系
export interface DependencyRelation {
  from: string
  to: string
  type: 'import' | 'reference' | 'inheritance' | 'composition'
  strength: number
  timestamp: string
}

// 项目根信息
export interface RootInfo {
  project_positioning: string
  tech_stack: string[]
  core_modules: string[]
  entry_points: string[]
  key_terms: Record<string, string>
  core_dependencies: string[]
  config_files: string[]
  environment_requirements: string[]
  build_steps: string[]
  deployment_info: {
    dockerfile?: string
    docker_compose?: string
    kubernetes?: string
  }
}

// 知识图谱配置
export interface KnowledgeGraphConfig {
  enabled: boolean
  model: string
  maxConcurrency: number
  batchSize: number
  maxFiles?: number
  fileSizeLimit?: number
  storageType: 'file'
  cacheDir?: string
  breakpointResume?: boolean
  exportFormats?: ExportFormat[]
  autoStart?: boolean
  exportFormat?: string
  includeSourceMaps?: boolean
  enableDetailedLogging?: boolean
}

// 知识图谱状态
export interface KnowledgeGraphStatus {
  enabled: boolean
  isRunning: boolean
  isPaused: boolean
  progress: number
  totalFiles: number
  processedFiles: number
  currentFile: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  error?: string
  lastUpdated?: string
}

// 构建选项
export interface BuildOptions {
  workspacePath?: string
  config?: KnowledgeGraphConfig
  onProgress?: (progress: BuildProgress) => void
  resumeFromPrevious?: boolean
  forceRebuild?: boolean
}

// 构建进度
export interface BuildProgress {
  phase: 'root_analysis' | 'file_analysis' | 'directory_analysis' | 'dependency_analysis' | 'completed'
  current: number
  total: number
  message: string
  percentage: number
}

// 搜索结果
export interface SearchResult {
  type: 'file' | 'directory' | 'function' | 'dependency'
  path: string
  name: string
  description: string
  relevance: number
  highlights: string[]
}

// 导出格式
export type ExportFormat = 'json' | 'jsonl' | 'markdown' | 'zip'


// 构建状态
export interface BuildState {
  phase: BuildProgress['phase']
  completedFiles: string[]
  completedDirectories: string[]
  lastUpdateTime: string
}

// 错误类型
export class KnowledgeGraphError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
    public retryable: boolean = true
  ) {
    super(message)
    this.name = 'KnowledgeGraphError'
  }
}

// LLM响应
export interface LLMResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cost: number
  }
}

// 文件分析结果
export interface FileAnalysisResult {
  summary: FileSummary
  dependencies: string[]
  complexity: number
  codeQuality: {
    lines: number
    functions: number
    classes: number
    comments: number
  }
}

// 目录分析结果
export interface DirectoryAnalysisResult {
  summary: DirectorySummary
  fileSummaries: FileSummary[]
  subdirectories: string[]
  dependencyGraph: DependencyRelation[]
}

/**
 * 存储配置
 */
export interface StorageConfig {
  type: 'file'
  path: string
  maxSize?: number
  compression?: boolean
  encryption?: boolean
}

/**
 * 搜索查询
 */
export interface SearchQuery {
  type: 'exact' | 'fuzzy' | 'combined'
  terms: string[]
}

/**
 * 导出选项
 */
export interface ExportOptions {
  format: ExportFormat
  outputPath: string
  includeMetadata?: boolean
}

/**
 * 导出结果
 */
export interface ExportResult {
  format: ExportFormat
  outputPath: string
  size: number
  recordCount: number
  exportTime: string
}
