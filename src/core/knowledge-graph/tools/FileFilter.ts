/**
 * 文件过滤器 - 过滤不需要分析的文件
 */

import { IGNORE_PATTERNS, FILE_TYPE_MAPPING } from "../constants"
import * as path from "path"
import * as fs from "fs/promises"
import { createLogger, ILogger } from "../../../utils/logger"

export class FileFilter {
  private ignorePatterns: string[]
  private maxFileSize: number
  private maxFiles: number
  private logger: ILogger

  constructor(
    ignorePatterns: string[] = IGNORE_PATTERNS,
    maxFileSize: number = 1024 * 1024, // 1MB
    maxFiles: number = 50000
  ) {
    this.ignorePatterns = ignorePatterns
    this.maxFileSize = maxFileSize
    this.maxFiles = maxFiles
    this.logger = createLogger()
  }

  /**
   * 过滤文件列表
   */
  async filterFiles(filePaths: string[], basePath?: string): Promise<string[]> {
    this.logger.info(`[FileFilter] 开始过滤文件，初始文件数: ${filePaths.length}`)
    let filteredFiles = [...filePaths]

    // 1. 应用忽略模式
    filteredFiles = this.applyIgnorePatterns(filteredFiles)
    this.logger.info(`[FileFilter] 应用忽略模式后，剩余文件数: ${filteredFiles.length}`)

    // 2. 检查文件大小
    filteredFiles = await this.filterBySize(filteredFiles, basePath)
    this.logger.info(`[FileFilter] 检查文件大小后，剩余文件数: ${filteredFiles.length}`)

    // 3. 限制文件数量
    const beforeLimit = filteredFiles.length
    filteredFiles = this.limitFileCount(filteredFiles)
    if (filteredFiles.length < beforeLimit) {
      this.logger.info(`[FileFilter] 限制文件数量后，最终文件数: ${filteredFiles.length} (限制了 ${beforeLimit - filteredFiles.length} 个文件)`)
    }

    this.logger.info(`[FileFilter] 文件过滤完成，最终文件数: ${filteredFiles.length}`)
    return filteredFiles
  }

  /**
   * 应用忽略模式
   */
  private applyIgnorePatterns(filePaths: string[]): string[] {
    return filePaths.filter(filePath => {
      // 检查是否匹配任何忽略模式
      for (const pattern of this.ignorePatterns) {
        if (this.matchesPattern(filePath, pattern)) {
          return false
        }
      }
      return true
    })
  }

  /**
   * 按文件大小过滤
   */
  private async filterBySize(filePaths: string[], basePath?: string): Promise<string[]> {
    const validFiles: string[] = []
    let skippedCount = 0

    for (const filePath of filePaths) {
      try {
        // 如果提供了 basePath，则构建绝对路径；否则假设已经是绝对路径
        const fullPath = basePath ? path.resolve(basePath, filePath) : filePath
        const stats = await fs.stat(fullPath)
        
        // 检查文件大小
        if (stats.size <= this.maxFileSize) {
          validFiles.push(filePath)
        } else {
          skippedCount++
          if (skippedCount <= 5) { // 只记录前5个大文件
            this.logger.debug(`[FileFilter] 跳过大文件: ${filePath} (${stats.size} bytes)`)
          }
        }
      } catch (error) {
        // 如果无法读取文件，跳过该文件
        this.logger.debug(`[FileFilter] 无法读取文件: ${filePath}`, error)
        continue
      }
    }

    if (skippedCount > 0) {
      this.logger.info(`[FileFilter] 因文件大小跳过 ${skippedCount} 个文件`)
    }

    return validFiles
  }

  /**
   * 限制文件数量
   */
  private limitFileCount(filePaths: string[]): string[] {
    if (filePaths.length <= this.maxFiles) {
      return filePaths
    }

    this.logger.warn(`[FileFilter] 文件数量超过限制 (${filePaths.length} > ${this.maxFiles})，开始筛选`)

    // 优先保留源代码文件
    const sourceFiles = filePaths.filter(path => this.isSourceCodeFile(path))
    const otherFiles = filePaths.filter(path => !this.isSourceCodeFile(path))

    this.logger.info(`[FileFilter] 源代码文件: ${sourceFiles.length}, 其他文件: ${otherFiles.length}`)

    if (sourceFiles.length >= this.maxFiles) {
      // 如果源代码文件足够多，只保留源代码文件
      const selected = sourceFiles.slice(0, this.maxFiles)
      this.logger.info(`[FileFilter] 保留前 ${this.maxFiles} 个源代码文件`)
      return selected
    } else {
      // 否则先保留所有源代码文件，再从其他文件中补充
      const remainingSlots = this.maxFiles - sourceFiles.length
      const selected = [...sourceFiles, ...otherFiles.slice(0, remainingSlots)]
      this.logger.info(`[FileFilter] 保留所有 ${sourceFiles.length} 个源代码文件和 ${remainingSlots} 个其他文件`)
      return selected
    }
  }

  /**
   * 检查文件是否匹配模式
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // 简单的模式匹配实现
    const normalizedPath = path.normalize(filePath)
    
    // 处理通配符
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
      
      const regex = new RegExp(regexPattern, 'i')
      return regex.test(normalizedPath)
    }
    
    // 处理目录模式
    if (pattern.endsWith('/')) {
      return normalizedPath.includes(pattern.slice(0, -1))
    }
    
    // 精确匹配
    return normalizedPath.includes(pattern)
  }

  /**
   * 检查是否为源代码文件
   */
  private isSourceCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return Object.keys(FILE_TYPE_MAPPING).includes(ext)
  }

  /**
   * 获取文件类型
   */
  getFileType(filePath: string): 'source' | 'config' | 'document' | 'test' | 'other' {
    const ext = path.extname(filePath).toLowerCase()
    const basename = path.basename(filePath)
    
    // 检查测试文件
    if (basename.includes('.test.') || basename.includes('.spec.') || basename.startsWith('test_')) {
      return 'test'
    }
    
    // 检查配置文件
    const configFiles = ['package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.js']
    if (configFiles.includes(basename)) {
      return 'config'
    }
    
    // 检查文档文件
    const docExts = ['.md', '.markdown', '.rst', '.txt']
    if (docExts.includes(ext)) {
      return 'document'
    }
    
    // 检查源代码文件
    const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs']
    if (sourceExts.includes(ext)) {
      return 'source'
    }
    
    return 'other'
  }

  /**
   * 检查文件是否应该被分析
   */
  shouldAnalyzeFile(filePath: string): boolean {
    const fileType = this.getFileType(filePath)
    return fileType === 'source' || fileType === 'config' || fileType === 'document'
  }

  /**
   * 添加自定义忽略模式
   */
  addIgnorePattern(pattern: string): void {
    this.ignorePatterns.push(pattern)
  }

  /**
   * 移除忽略模式
   */
  removeIgnorePattern(pattern: string): void {
    const index = this.ignorePatterns.indexOf(pattern)
    if (index > -1) {
      this.ignorePatterns.splice(index, 1)
    }
  }

  /**
   * 获取当前忽略模式
   */
  getIgnorePatterns(): string[] {
    return [...this.ignorePatterns]
  }

  /**
   * 设置最大文件大小
   */
  setMaxFileSize(size: number): void {
    this.maxFileSize = size
  }

  /**
   * 设置最大文件数量
   */
  setMaxFiles(count: number): void {
    this.maxFiles = count
  }
}

/**
 * 安全读取文件
 */
export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath)
    
    // 检查文件大小
    if (stats.size > 1024 * 1024) { // 1MB
      return null
    }
    
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    return null
  }
}

/**
 * 检查文件是否可读
 */
export async function isFileReadable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK)
    return true
  } catch (error) {
    return false
  }
}

/**
 * 获取文件类型
 */
export function getFileType(filePath: string): 'source' | 'config' | 'document' | 'test' | 'other' {
  const ext = path.extname(filePath).toLowerCase()
  const basename = path.basename(filePath)
  
  // 检查测试文件
  if (basename.includes('.test.') || basename.includes('.spec.') || basename.startsWith('test_')) {
    return 'test'
  }
  
  // 检查配置文件
  const configFiles = ['package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.js']
  if (configFiles.includes(basename)) {
    return 'config'
  }
  
  // 检查文档文件
  const docExts = ['.md', '.markdown', '.rst', '.txt']
  if (docExts.includes(ext)) {
    return 'document'
  }
  
  // 检查源代码文件
  const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs']
  if (sourceExts.includes(ext)) {
    return 'source'
  }
  
  return 'other'
}

/**
 * 创建忽略实例
 */
export function createIgnoreInstance(): FileFilter {
  return new FileFilter()
}