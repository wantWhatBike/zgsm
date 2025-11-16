/**
 * 文件列表服务
 */

import { FileFilter, getFileHash } from "./FileUtils"
import * as path from "path"
import * as fs from "fs/promises"
import { createLogger, ILogger } from '../../../utils/logger'
import { FileInfo } from "../types"

export class FileService {
  private fileFilter: FileFilter
  private logger: ILogger

  constructor(fileFilter?: FileFilter) {
    this.fileFilter = fileFilter || new FileFilter()
    this.logger = createLogger('KnowledgeGraph')
  }

  /**
   * 获取项目文件列表
   */
  async getProjectFilteredFiles(workspacePath: string): Promise<FileInfo[]> {
    const allFiles = await this.walkDirectory(workspacePath)
    // 将绝对路径转换为相对路径进行过滤
    const relativeFiles = allFiles.map(file => {file.path = path.relative(workspacePath, file.path);return file})
    return  await this.fileFilter.filterFiles(relativeFiles, workspacePath)
  }

  /**
   * 递归遍历目录
   */
  private async walkDirectory(dirPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = []
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        
        if (entry.isDirectory()) {
          // 递归处理子目录
          const subFiles = await this.walkDirectory(fullPath)
          files.push(...subFiles)
        } else if (entry.isFile()) {
          const fileStats = await fs.stat(fullPath)
          const hash = await getFileHash(fullPath)
          files.push({path: fullPath, size: fileStats.size, lastModified: fileStats.mtime.getTime(), hash: hash})
        }
      }
    } catch (error) {
      // 如果无法读取目录，跳过该目录
      this.logger.warn(`无法读取目录: ${dirPath}`, error)
    }
    
    return files
  }


  /**
   * 过滤文件列表
   */
  async filterFiles(files: FileInfo[], basePath?: string): Promise<FileInfo[]> {
    return this.fileFilter.filterFiles(files, basePath)
  }
}