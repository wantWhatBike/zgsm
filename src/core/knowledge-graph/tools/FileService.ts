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

  constructor(fileFilter?: FileFilter, logger?: ILogger) {
    this.fileFilter = fileFilter || new FileFilter()
    this.logger = logger || createLogger('FileService')
  }

  /**
   * 获取项目文件列表 - 优化版本
   */
  async getProjectFilteredFiles(workspacePath: string): Promise<FileInfo[]> {
    this.logger.info(`[FileService] 开始收集工作区文件：${workspacePath}`)
    
    // 1. 收集所有文件路径
    const filePaths = await this.collectFilePaths(workspacePath)
    this.logger.info(`[FileService] 收集到文件：${filePaths.length}个`)
    
    // 2. 将路径封装为FileInfo（不计算hash）
    const fileInfos = await this.createFileInfos(filePaths, workspacePath)
    
    // 3. 过滤文件
    const filteredFiles = await this.fileFilter.filterFiles(fileInfos, workspacePath)
    
    // 4. 只对过滤后的文件计算hash
    const filesWithHash = await this.calculateHashForFiles(filteredFiles, workspacePath)
    
    return filesWithHash
  }

  /**
   * 收集文件路径 - 只负责遍历目录收集路径
   */
  private async collectFilePaths(dirPath: string): Promise<string[]> {
    const filePaths: string[] = []
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
            filePaths.push(fullPath)
          }
        }
      } catch (error) {
        // 如果无法读取目录，跳过该目录
        this.logger.warn(`[FileService] 无法读取目录: ${currentDir}`)
      }
    }

    return filePaths
  }

  /**
   * 创建FileInfo对象 - 只负责获取文件基本信息，不计算hash
   */
  private async createFileInfos(filePaths: string[], workspacePath: string): Promise<FileInfo[]> {
    const fileInfos: FileInfo[] = []
    
    for (const filePath of filePaths) {
      try {
        const fileStats = await fs.stat(filePath)
        const relativePath = path.relative(workspacePath, filePath)
        
        fileInfos.push({
          path: relativePath,
          size: fileStats.size,
          lastModified: fileStats.mtime.getTime(),
          hash: '' // 暂时为空，后续计算
        })
      } catch (error) {
        // 跳过无法访问的文件
        this.logger.warn(`[FileService] 无法获取文件信息: ${filePath}`)
      }
    }
    
    return fileInfos
  }

  /**
   * 为文件列表计算hash - 限制并发数量避免资源占用过高
   */
  private async calculateHashForFiles(files: FileInfo[], workspacePath: string): Promise<FileInfo[]> {
    const results: FileInfo[] = []
    const concurrency = 4 // 固定4个并发，适合低配置环境
    
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency)
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const absolutePath = path.isAbsolute(file.path) ? file.path : path.join(workspacePath, file.path)
            const hash = await this.getFileHashCached(absolutePath, file.lastModified, file.size)
            
            return {
              ...file,
              hash
            }
          } catch (error) {
            this.logger.warn(`[FileService] 计算文件hash失败: ${file.path}`)
            return {
              ...file,
              hash: this.generateSimpleHash(file.path, file.lastModified, file.size)
            }
          }
        })
      )
      results.push(...batchResults)
    }
    
    return results
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
   * 过滤文件列表
   */
  async filterFiles(files: FileInfo[], basePath?: string): Promise<FileInfo[]> {
    return this.fileFilter.filterFiles(files, basePath)
  }
}