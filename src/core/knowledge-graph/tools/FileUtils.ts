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
  private includeTestFiles: boolean
  private logger: ILogger

  constructor(
    ignorePatterns: string[] = IGNORE_PATTERNS,
    includeExts: string[] =  INCLUDE_EXTS,
    maxFileSize: number = 1024 * 1024, // 1MB
    maxFiles: number = 50000,
    logger?: ILogger,
    includeTestFiles: boolean = false
  ) {
    this.ignorePatterns = ignorePatterns
    this.maxFileSize = maxFileSize
    this.maxFiles = maxFiles
    this.includeExts = includeExts
    this.includeTestFiles = includeTestFiles
    this.logger = logger || createLogger('FileFilter')
  }

  /**
   * 过滤文件列表
   */
  async filterFiles(files: FileInfo[], basePath?: string): Promise<FileInfo[]> {
    this.logger.info(`[FileFilter] 开始过滤文件，过滤前: ${files.length}个`)

    // 1. 应用忽略模式
    files = this.applyIgnorePatterns(files)
    this.logger.info(`[FileFilter] 应用忽略模式后，剩余文件数: ${files.length}`)
    
    // 2. 检查文件大小
    files = await this.filterBySize(files)
    this.logger.info(`[FileFilter] 检查文件大小后，剩余文件数: ${files.length}`)
    
    // 3. 仅处理代码，根据后缀过滤
    files = await this.filterByExt(files)
    this.logger.info(`[FileFilter] 根据后缀过滤后，剩余文件数: ${files.length}`)

    // 4. 过滤测试文件（如果不包含测试文件）
    // ✅ 调试日志：测试文件过滤
    if (!this.includeTestFiles) {
      const beforeFilter = files.length
      files = this.filterTestFiles(files)
      const filtered = beforeFilter - files.length
      this.logger.info(`[FileFilter] 过滤测试文件: ${beforeFilter} → ${files.length} (移除 ${filtered} 个)`)
    } else {
      this.logger.info(`[FileFilter] 包含测试文件，跳过过滤`)
    }

    this.logger.info(`[FileFilter] 过滤完成，剩余：${files.length}个文件`)
    return files
  }

  /**
   * 判断是否为测试文件
   */
  private isTestFile(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/')
    const fileName = path.basename(filePath)

    // 路径包含测试目录
    const testDirPatterns = ['/test/', '/tests/', '/__tests__/', '/spec/', '/specs/']
    if (testDirPatterns.some(pattern => normalizedPath.includes(pattern))) {
      return true
    }

    // 文件名包含测试标识
    const testFilePatterns = ['.test.', '.spec.', '_test.', '_spec.']
    if (testFilePatterns.some(pattern => fileName.includes(pattern))) {
      return true
    }

    return false
  }

  /**
   * 过滤测试文件
   */
  private filterTestFiles(files: FileInfo[]): FileInfo[] {
    return files.filter(file => !this.isTestFile(file.path))
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
    return files.filter(file => file.size <= this.maxFileSize)
  }

  /**
   * 按扩展名过滤
   */
  private async filterByExt(files: FileInfo[]): Promise<FileInfo[]> {
    return files.filter(file => {
      const fileExt = path.extname(file.path)
      return this.includeExts.includes(fileExt)
    })
  }


  /**
   * 检查文件是否匹配模式 - 增强版，支持更标准的 glob 模式
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
  	const normalizedPath = filePath.replace(/\\/g, '/')
  	let normalizedPattern = pattern.replace(/\\/g, '/')
 
  	// 处理目录模式：如果模式以 / 结尾，匹配该目录下的所有文件
  	if (normalizedPattern.endsWith('/')) {
  		return normalizedPath.includes(normalizedPattern) || normalizedPath === normalizedPattern.slice(0, -1)
  	}
 
  	// 将 glob 模式转换为正则表达式
  	// 1. 转义特殊字符 (除了 * 和 ?)
  	let regexString = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  	
  	// 2. 处理 ** (匹配任意目录深度)
  	regexString = regexString.replace(/\*\*/g, '.*')
  	
  	// 3. 处理 * (匹配文件名中的字符，不跨目录)
  	// 注意：如果已经替换了 **，这里需要避免重复替换。
  	// 上面的 ** 替换为 .* 后，* 已经被处理了。
  	// 但标准的 * 是不匹配 / 的。
  	// 简易实现：
  	// 如果模式中包含 **，则 * 视为 .*
  	// 否则 * 视为 [^/]*
  	
  	if (!pattern.includes('**')) {
  		regexString = regexString.replace(/\*/g, '[^/]*')
  	}
 
  	// 4. 处理 ? (匹配单个字符)
  	regexString = regexString.replace(/\?/g, '.')
 
  	// 添加首尾锚点，确保全匹配
  	// 注意：如果是目录匹配（如 node_modules/），通常是部分匹配
  	// 这里我们假设 pattern 是相对于根目录的路径模式
  	
  	// 如果模式不包含 /，则匹配文件名（任意深度）
  	if (!pattern.includes('/')) {
  		regexString = `(?:^|/)${regexString}$`
  	} else {
  		// 包含路径，则从头匹配
  		// 处理开头的 /
  		if (regexString.startsWith('/')) {
  			regexString = `^${regexString.slice(1)}`
  		} else {
  			// 相对路径，可能匹配中间的目录？通常 .gitignore 是相对于根的
  			// 这里简化为：如果是相对路径，匹配开头
  			regexString = `^${regexString}`
  		}
  	}
 
  	try {
  		const regex = new RegExp(regexString, 'i')
  		return regex.test(normalizedPath)
  	} catch (e) {
  		// 正则转换失败，回退到简单包含
  		return normalizedPath.includes(normalizedPattern)
  	}
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
 * @returns 文件内容，如果文件过大或读取失败则返回 null
 */
export async function safeReadFile(filePath: string, maxSize: number = 5 * 1024 * 1024): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath)
    
    // 检查文件大小
    if (stats.size > maxSize) {
      // console.warn(`[FileUtils] 文件过大跳过: ${filePath} (${stats.size} bytes)`)
      return null
    }
    
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    // console.error(`[FileUtils] 读取文件失败: ${filePath}`, error)
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