/**
 * 存储接口定义
 */

import {
  StorageConfig
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

export type { StorageConfig }