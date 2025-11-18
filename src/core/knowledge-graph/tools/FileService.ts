/**
 * 文件列表服务
 */

import { FileFilter, getFileHash } from "./FileUtils"
import * as path from "path"
import * as fs from "fs/promises"
import { createLogger, ILogger } from '../../../utils/logger'
import { FileInfo } from "../types"

interface HashCacheEntry {
  hash: string
  timestamp: number
  size: number
}

export class FileService {
  private fileFilter: FileFilter
  private logger: ILogger
  private hashCache = new Map<string, HashCacheEntry>()
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24小时

  constructor(fileFilter?: FileFilter) {
    this.fileFilter = fileFilter || new FileFilter()
    this.logger = createLogger('OptimizedFileService')
  }

  /**
   * 获取项目文件列表 - 优化版本
   */
  async getProjectFilteredFiles(workspacePath: string): Promise<FileInfo[]> {
    const allFiles = await this.walkDirectoryOptimized(workspacePath)
    // 将绝对路径转换为相对路径进行过滤
    const relativeFiles = allFiles.map(file => ({
      ...file,
      path: path.relative(workspacePath, file.path)
    }))
    return await this.fileFilter.filterFiles(relativeFiles, workspacePath)
  }

  /**
   * 优化的目录遍历 - 使用栈替代递归，避免栈溢出
   */
  private async walkDirectoryOptimized(dirPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = []
    const stack = [dirPath]

    while (stack.length > 0) {
      const currentDir = stack.pop()!
      
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name)
          
          if (entry.isDirectory()) {
            // 添加到栈中继续处理
            stack.push(fullPath)
          } else if (entry.isFile()) {
            try {
              const fileStats = await fs.stat(fullPath)
              const hash = await this.getFileHashCached(fullPath, fileStats.mtime.getTime(), fileStats.size)
              
              files.push({
                path: fullPath,
                size: fileStats.size,
                lastModified: fileStats.mtime.getTime(),
                hash
              })
            } catch (fileError) {
              // 跳过无法访问的文件
              this.logger.warn(`[FileService] 无法处理文件: ${fullPath}`)
            }
          }
        }
      } catch (error) {
        // 如果无法读取目录，跳过该目录
        this.logger.warn(`[FileService] 无法读取目录: ${currentDir}`)
      }
    }

    return files
  }

  /**
   * 带缓存的文件hash计算
   */
  private async getFileHashCached(filePath: string, lastModified: number, size: number): Promise<string> {
    const cacheKey = filePath
    const cached = this.hashCache.get(cacheKey)
    
    // 检查缓存是否有效
    if (cached &&
        cached.timestamp === lastModified &&
        cached.size === size &&
        Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.hash
    }

    // 计算新的hash
    try {
      const hash = await getFileHash(filePath)
      this.hashCache.set(cacheKey, {
        hash,
        timestamp: lastModified,
        size
      })
      
      return hash
    } catch (error) {
      this.logger.warn(`[FileService] 计算文件hash失败: ${filePath}`)
      // 返回基于文件信息的简单hash
      return this.generateSimpleHash(filePath, lastModified, size)
    }
  }

  /**
   * 生成简单hash（当无法计算文件内容hash时的后备方案）
   */
  private generateSimpleHash(filePath: string, lastModified: number, size: number): string {
    const crypto = require('crypto')
    const content = `${filePath}:${lastModified}:${size}`
    return crypto.createHash('md5').update(content).digest('hex')
  }

  /**
   * 清理过期缓存
   */
  public cleanupCache(): void {
    const now = Date.now()
    const keysToDelete: string[] = []
    
    for (const [key, entry] of this.hashCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => this.hashCache.delete(key))
    
    if (keysToDelete.length > 0) {
      this.logger.info(`[FileService] 清理缓存: ${keysToDelete.length}个条目`)
    }
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.hashCache.size,
      hitRate: 0 // 可以在实际使用中添加命中率统计
    }
  }


  /**
   * 过滤文件列表
   */
  async filterFiles(files: FileInfo[], basePath?: string): Promise<FileInfo[]> {
    return this.fileFilter.filterFiles(files, basePath)
  }
}