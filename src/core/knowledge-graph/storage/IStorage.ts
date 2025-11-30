/**
 * 存储接口定义
 */

import {
  StorageConfig,
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
 * 存储初始化结果
 */
export interface StorageInitResult {
  migrated: boolean      // 是否发生了数据迁移/清空
  message?: string       // 迁移描述信息
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
  initialize(): Promise<StorageInitResult>
  exists(): Promise<boolean>
  clear(table: string): Promise<void>
  load(table: string): Promise<string | null>
  overwrite(table: string, data:any): Promise<void>
  add(table: string, data:any): Promise<void>
  addBatch(table: string, data:any[]): Promise<void>
  deleteItems(table: string, predicate: (item: any) => boolean): Promise<void>
  
  // ✅ 新增：语义化更新和删除操作
  /**
   * 更新数据（智能处理）
   * - SQLite: 使用 INSERT OR REPLACE（UPSERT）
   * - JSONL: 先删除旧数据再插入新数据
   * @param table 表名/文件名
   * @param data 单个数据对象或数据数组
   */
  update(table: string, data: any | any[]): Promise<void>
  
  /**
   * 批量更新数据
   * @param table 表名/文件名
   * @param data 数据数组
   */
  updateBatch(table: string, data: any[]): Promise<void>
  
  /**
   * 批量删除数据（按路径）
   * - SQLite: DELETE WHERE path IN (...)
   * - JSONL: 读取 -> 过滤 -> 重写
   * @param table 表名/文件名
   * @param paths 要删除的路径数组
   */
  deleteBatch(table: string, paths: string[]): Promise<void>
  
  // 资源释放方法（可选，兼容现有实现）
  dispose?(): Promise<void>
}

export type { StorageConfig }