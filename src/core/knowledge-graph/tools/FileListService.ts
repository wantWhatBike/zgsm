/**
 * 文件列表服务
 */

import { FileFilter } from "./FileFilter"
import * as path from "path"
import * as fs from "fs/promises"
import { createLogger, ILogger } from '../../../utils/logger'

export class FileListService {
  private fileFilter: FileFilter
  private logger: ILogger

  constructor(fileFilter?: FileFilter) {
    this.fileFilter = fileFilter || new FileFilter()
    this.logger = createLogger('KnowledgeGraph')
  }

  /**
   * 获取项目文件列表
   */
  async getProjectFiles(workspacePath: string): Promise<string[]> {
    const allFiles = await this.walkDirectory(workspacePath)
    // 将绝对路径转换为相对路径进行过滤
    const relativeFiles = allFiles.map(file => path.relative(workspacePath, file))
    const filteredRelativeFiles = await this.fileFilter.filterFiles(relativeFiles, workspacePath)
    // 转换回绝对路径返回
    return filteredRelativeFiles.map(file => path.resolve(workspacePath, file))
  }

  /**
   * 获取变更的文件
   */
  async getChangedFiles(
    workspacePath: string,
    previousFiles: Set<string>
  ): Promise<string[]> {
    const currentFiles = await this.getProjectFiles(workspacePath)
    return currentFiles.filter(file => !previousFiles.has(file))
  }

  /**
   * 递归遍历目录
   */
  private async walkDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = []
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        
        if (entry.isDirectory()) {
          // 递归处理子目录
          const subFiles = await this.walkDirectory(fullPath)
          files.push(...subFiles)
        } else if (entry.isFile()) {
          files.push(fullPath)
        }
      }
    } catch (error) {
      // 如果无法读取目录，跳过该目录
      this.logger.warn(`无法读取目录: ${dirPath}`, error)
    }
    
    return files
  }

  /**
   * 获取文件统计信息
   */
  async getFileStats(filePaths: string[]): Promise<{
    totalFiles: number
    totalSize: number
    byType: Record<string, number>
    byExtension: Record<string, number>
  }> {
    const stats = {
      totalFiles: filePaths.length,
      totalSize: 0,
      byType: {} as Record<string, number>,
      byExtension: {} as Record<string, number>
    }

    for (const filePath of filePaths) {
      try {
        const fileStats = await fs.stat(filePath)
        stats.totalSize += fileStats.size
        
        // 按类型统计
        const fileType = this.fileFilter.getFileType(filePath)
        stats.byType[fileType] = (stats.byType[fileType] || 0) + 1
        
        // 按扩展名统计
        const ext = path.extname(filePath).toLowerCase() || 'no-extension'
        stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1
      } catch (error) {
        // 如果无法读取文件，跳过该文件
        continue
      }
    }

    return stats
  }

  /**
   * 获取文件类型分布
   */
  async getFileTypeDistribution(filePaths: string[]): Promise<Record<string, number>> {
    const distribution: Record<string, number> = {}
    
    for (const filePath of filePaths) {
      const fileType = this.fileFilter.getFileType(filePath)
      distribution[fileType] = (distribution[fileType] || 0) + 1
    }
    
    return distribution
  }

  /**
   * 过滤文件列表
   */
  async filterFiles(filePaths: string[], basePath?: string): Promise<string[]> {
    return this.fileFilter.filterFiles(filePaths, basePath)
  }
}