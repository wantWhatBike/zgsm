/**
 * 存储接口定义
 */

import {
  StorageConfig,
  FileSummary,
  DirectorySummary,
  DependencyRelation,
  RootInfo,
  KnowledgeGraphBuildState,
  FileInfo
} from "../types"

/**
 * 存储信息
 */
export interface StorageInfo {
  type: string
  path: string
  size: number
  itemCount: number
  fileCount?: number // 文件摘要数量
  lastUpdated: string
}

/**
 * 存储错误
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: string = 'STORAGE_ERROR',
    public recoverable: boolean = true
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

/**
 * 通用存储接口
 * 定义所有存储实现必须遵循的契约
 */
export interface IStorage {
  // 初始化和基础操作
  initializeStorage(): Promise<void>
  exists(): Promise<boolean>
  clear(): Promise<void>
  getStorageInfo(): Promise<StorageInfo>

  // 文件记录管理
  initializeFileRecords(files: FileInfo[]): Promise<{
    added: FileInfo[]
    modified: FileInfo[]
    deleted: FileInfo[]
  }>
  getPendingFiles(): Promise<Array<{ path: string; timestamp: number }>>
  updateFileRecord(
    filePath: string,
    status: "pending" | "processing" | "success" | "failed",
    error?: string
  ): Promise<void>

  // 文件摘要操作
  saveFileSummaries(summaries: FileSummary[]): Promise<void>
  getFileSummary(filePath: string): Promise<FileSummary | null>
  getAllFileSummaries(): Promise<FileSummary[]>
  deleteFileSummary(filePath: string): Promise<void>

  // 目录记录管理
  initializeDirectoryRecords(directories: string[]): Promise<{
    added: string[]
    unchanged: string[]
  }>
  getPendingDirectories(): Promise<string[]>
  updateDirectoryRecord(dirPath: string, status: "pending" | "success" | "failed"): Promise<void>

  // 目录摘要操作
  saveDirectorySummaries(summaries: DirectorySummary[]): Promise<void>
  getDirectorySummary(dirPath: string): Promise<DirectorySummary | null>
  getAllDirectorySummaries(): Promise<DirectorySummary[]>
  deleteDirectorySummary(dirPath: string): Promise<void>

  // 依赖关系操作
  saveDependencyRelation(relation: DependencyRelation): Promise<void>
  saveDependencyRelations(relations: DependencyRelation[]): Promise<void>
  getDependencyRelations(): Promise<DependencyRelation[]>
  getDependenciesForPath(path: string): Promise<DependencyRelation[]>
  getDependentsOfPath(path: string): Promise<DependencyRelation[]>
  deleteDependencyRelationsForPath(path: string): Promise<void>

  // 项目根信息操作
  saveRootInfo(rootInfo: RootInfo): Promise<void>
  getRootInfo(): Promise<RootInfo | null>
  deleteRootInfo(): Promise<void>

  // 构建状态管理
  saveKnowledgeGraphBuildStatus(state: KnowledgeGraphBuildState): Promise<void>
  getBuildStatus(): Promise<KnowledgeGraphBuildState | null>
  updateBuildStatus(updates: Partial<KnowledgeGraphBuildState>): Promise<void>
  deleteKnowledgeGraphBuildStatus(): Promise<void>

  // 进度和统计
  updateTaskProgress(
    progress: number,
    currentFile: string,
    stage: "root_analysis" | "file_summary" | "directory_summary" | "dependency_graph" | "completed",
    stageProgress?: number
  ): Promise<void>
  incrementProcessedFiles(): Promise<void>
  incrementFailedFiles(): Promise<void>
  updateRequestStats(
    requestCount: number,
    duration: number,
    tokens: { input: number; output: number }
  ): Promise<void>

  // 导出功能
  saveDirectoryTree(treeContent: string): Promise<void>
  getDirectoryTree(): Promise<string | null>
  saveIndex(indexContent: string): Promise<void>
  getIndex(): Promise<string | null>
  generateDirectoryTree(rootPath: string): Promise<string>
  generateIndex(): Promise<string>

  // 统计信息
  getTaskStatistics(): Promise<{
    files: {
      total: number
      pending: number
      processing: number
      success: number
      failed: number
    }
    directories: {
      total: number
      pending: number
      success: number
      failed: number
    }
    KnowledgeGraphBuildStatus: KnowledgeGraphBuildState | null
  }>
}

export type { StorageConfig }