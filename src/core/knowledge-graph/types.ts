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
  functions: Record<string, string>
  dependencies: string[]
  timestamp: string
  // 继承 FileInfo 的字段以保持一致性
  size: number
  lastModified: number
}

// 调用链信息（精简版，只保留上游）
export interface FunctionCallChain {
  callers: Array<{         // 调用者列表（从根到当前函数）
    filePath: string       // 调用者所在文件
    symbolName: string     // 调用者函数名
    line: number          // 调用位置行号
  }>
  depth: number           // 调用深度
}

// 匹配的函数信息
export interface MatchedFunction {
  name: string                    // 函数名
  description: string             // 函数描述（来自 FileSummary.functions）
  callChain?: FunctionCallChain  // 调用链信息（可选）
}

// search_codes 返回结果
export interface SearchCodesResult {
  path: string                    // 文件路径
  description: string             // 文件描述
  match_functions: MatchedFunction[]  // 匹配的函数列表（对象数组）
  dependencies: string[]          // 文件依赖
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

// 关键文件快照（用于检测项目配置变更）
export interface KeyFileSnapshot {
  hash: string | null  // 文件内容 hash，不存在时为 null
  exists: boolean      // 文件是否存在
  size?: number        // 文件大小（字节）
}

// 项目根信息
export interface RootInfo {
  project_description: string
  tech_stack: string[]
  core_modules: string[]
  core_dependencies: string[]
  environment_requirements: string[]
  build_steps: string[]
  // ✅ 新增：关键文件快照，用于检测项目配置变更
  keyFilesSnapshot?: Record<string, KeyFileSnapshot>
  lastAnalyzedTime?: string  // 最后分析时间
}

// 知识图谱配置
export interface KnowledgeGraphConfig {
  model: string
  maxFiles: number
  fileSizeLimit: number
  fileLinesLimit: number
  cacheDir: string
  exportFormat: string
  // Auto-rebuild configuration
  autoRebuildEnabled?: boolean
  autoRebuildIntervalMinutes?: number
  // Test files configuration
  includeTestFiles?: boolean
  // Visualization configuration
  maxVisualizationFiles?: number
  // LLM configuration
  contextWindowSize?: number
  contextWindowThreshold?: number
  llmTimeoutMs?: number
  llmMaxRetries?: number
}

import type { BuildProgress, KnowledgeGraphBuildState } from "@roo-code/types"

export type { BuildProgress, KnowledgeGraphBuildState }



// 定义返回结果类型接口，提升类型清晰度和复用性
export interface FileChanges {
  added: FileInfo[];
  modified: FileInfo[];
  deleted: FileInfo[];
  unchangedCount?: number; // 未变更且已成功处理的文件数量
  successCount: number; // files.json 中状态为 success 的文件数量（单一数据源）
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
  type: 'exact' | 'fuzzy'
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

