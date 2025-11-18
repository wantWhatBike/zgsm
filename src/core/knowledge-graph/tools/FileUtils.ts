/**
 * 文件过滤器 - 过滤不需要分析的文件
 */

import { IGNORE_PATTERNS, INCLUDE_EXTS } from "../constants"
import * as path from "path"
import * as fs from "fs/promises"
import { createLogger, ILogger } from "../../../utils/logger"
import { FileInfo } from "../types"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import Anthropic from "@anthropic-ai/sdk"

export class FileFilter {
  private ignorePatterns: string[]
  private includeExts: string[]
  private maxFileSize: number
  private maxFiles: number
  private logger: ILogger

  constructor(
    ignorePatterns: string[] = IGNORE_PATTERNS,
    includeExts: string[] =  INCLUDE_EXTS,
    maxFileSize: number = 1024 * 1024, // 1MB
    maxFiles: number = 50000
  ) {
    this.ignorePatterns = ignorePatterns
    this.maxFileSize = maxFileSize
    this.maxFiles = maxFiles
    this.includeExts = includeExts
    this.logger = createLogger()
  }

  /**
   * 过滤文件列表
   */
  async filterFiles(files: FileInfo[], basePath?: string): Promise<FileInfo[]> {
    this.logger.info(`[FileFilter] 开始过滤文件: ${files.length}个`)

    // 1. 应用忽略模式
    files = this.applyIgnorePatterns(files)
    this.logger.info(`[FileFilter] 应用忽略模式后，剩余文件数: ${files.length}`)
    
    // 2. 检查文件大小
    files = await this.filterBySize(files)
    this.logger.info(`[FileFilter] 检查文件大小后，剩余文件数: ${files.length}`)
    
    // 3. 仅处理代码，根据后缀过滤
    files = await this.filterByExt(files)
    this.logger.info(`[FileFilter] 根据后缀过滤后，剩余文件数: ${files.length}`)

    this.logger.info(`[FileFilter] 过滤完成，剩余：${files.length}个文件`)
    return files
  }


  /**
   * 应用忽略模式
   */
  private applyIgnorePatterns(files: FileInfo[]): FileInfo[] {
    return files.filter(file => {
      // 检查是否匹配任何忽略模式
      for (const pattern of this.ignorePatterns) {
        if (this.matchesPattern(file.path, pattern)) {
          return false
        }
      }
      return true
    })
  }

  /**
   * 按文件大小过滤
   */
  private async filterBySize(files: FileInfo[]): Promise<FileInfo[]> {
    return files.filter(
      file=> {
        if (file.size <= this.maxFileSize) {
          return true
        }else {
          return false
        }
      }
    )
  }

  /**
   * 按扩展名过滤
   */
  private async filterByExt(files: FileInfo[]): Promise<FileInfo[]> {

    return files.filter(
      file=> {
        const fileExt = path.extname(file.path);
        return INCLUDE_EXTS.includes(fileExt);
      }
    )
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
export async function safeReadFile(filePath: string, maxSize: number = 5000): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath)
    
    // 检查文件大小
    if (stats.size > maxSize) { // 1MB
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


export  async function getFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5'); // 可选sha1、sha256
    const stream = createReadStream(filePath);
    stream.pipe(hash); // 流式处理，内存占用低
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// 辅助函数：将字符串转换为ContentBlockParam[]
export function stringToContentBlocks(text: string): Anthropic.Messages.ContentBlockParam[] {
  return [{ type: 'text', text }]; // 包装为文本块数组
}

// 异步检查（推荐，非阻塞）
export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await fs.access(path); // 检查路径是否可访问（存在且有权限）
    return true;
  } catch {
    return false;
  }
};