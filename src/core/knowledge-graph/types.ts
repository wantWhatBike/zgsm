/**
 * 知识图谱类型定义
 */

// 文件信息
export interface FileInfo {
  path: string
  size: number
  lastModified: number
  hash: string
}

// 文件摘要
export interface FileSummary {
  path: string
  type: 'source' | 'config' | 'test'
  description: string
  keywords: string[]
  core_functions: Record<string, string>
  dependencies: string[]
  timestamp: string
  // 继承 FileInfo 的字段以保持一致性
  size: number
  lastModified: number
}

// 目录摘要
export interface DirectorySummary {
  path: string
  type: 'module' | 'utils' | 'config'
  description: string
  keywords: string[]
  key_files: string[]
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
  project_description: string
  tech_stack: string[]
  core_modules: string[]
  core_dependencies: string[]
  environment_requirements: string[]
  build_steps: string[]
}

// 知识图谱配置
export interface KnowledgeGraphConfig {
  enabled: boolean
  model: string
  maxConcurrency: number
  batchSize: number
  maxFiles: number
  fileSizeLimit: number
  fileLinesLimit: number
  storageType: 'file' | 'database'
  cacheDir: string
  exportFormat: string
}

// 构建进度 - 移到前面避免循环依赖
export interface BuildProgress {
  phase: 'root_analysis' | 'file_analysis' | 'directory_analysis' | 'dependency_analysis' | 'completed'
  message: string
  totalFiles: number
  filesToProcess: number
	totalProcessedFiles: number
  batchProcessedFilePaths: string[]
  batchFailedFiles: number
  // 新增耗时统计字段
  batchDuration?: number
  batchIndex?: number
}

// 知识图谱状态
export interface KnowledgeGraphBuildState {
  progress: number
  totalFiles: number
  totalFilesToProcess: number
  processedFiles: number
  failedFiles: number
  currentFile: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error'
  error?: string
  // 新增字段
  taskId?: string
  startTime?: string
  phase: BuildProgress['phase']
  lastUpdateTime: string
  totalDuration: number
  
  // LLM 统计信息
  llmStatistics?: {
    // Token 统计
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
    // 请求统计
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    // 成本和耗时统计
    totalDuration: number
  }
  
  // 各阶段耗时统计
  phaseDurations?: {
    fileCollection?: number
    rootAnalysis?: number
    fileSummary?: number
    directorySummary?: number
  }
}



// 定义返回结果类型接口，提升类型清晰度和复用性
export interface FileChanges {
  added: FileInfo[];
  modified: FileInfo[];
  deleted: FileInfo[];
}


/**
 * LLM 调用的使用量统计（输入/输出 tokens、成本等）
 */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}


/**
 * LLM 调用成功时的响应结构
 * @template T - 响应数据的类型（此处为 string，对应函数返回的 responseText）
 */
export interface LLMResponse<T> {
  success: boolean;
  error: string,
  data: T; 
  usage: LLMUsage;
  duration: number;
}


// 构建选项 - 增强版本
export interface BuildOptions {
  config?: KnowledgeGraphConfig
  onProgress?: (progress: BuildProgress) => void
  resumeFromPrevious?: boolean
  forceRebuild?: boolean
  // 新增选项
  enableIncrementalUpdate?: boolean
  maxRetries?: number
  retryFailedOnly?: boolean
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



// 存储配置
export interface StorageConfig {
  type: 'file' | 'database'
  path: string
  maxSize?: number
}

// 搜索查询
export interface SearchQuery {
  type: 'exact' | 'fuzzy' | 'combined'
  filePath?: string
  terms?: string[]
}

// 导出选项
export interface ExportOptions {
  format: ExportFormat
  outputPath: string
  includeMetadata?: boolean
}

// 导出结果
export interface ExportResult {
  format: ExportFormat
  outputPath: string
  exportTime: string
}
