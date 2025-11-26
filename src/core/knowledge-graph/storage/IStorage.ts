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
  initialize(): Promise<void>
  exists(): Promise<boolean>
  clear(table: string): Promise<void>
  load(table: string): Promise<string | null>
  overwrite(table: string, data:any): Promise<void>
  add(table: string, data:any): Promise<void>
  addBatch(table: string, data:any[]): Promise<void>
  deleteItems(table: string, predicate: (item: any) => boolean): Promise<void>
  // 资源释放方法（可选，兼容现有实现）
  dispose?(): Promise<void>
}

export type { StorageConfig }