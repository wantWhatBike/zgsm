/**
 * 知识图谱错误类
 */

import { ERROR_CODES } from '../constants'

export class KnowledgeGraphError extends Error {
  public readonly code: string
  public readonly retryable: boolean
  public readonly shouldReport: boolean
  public readonly details?: any

  constructor(
    message: string,
    code: string = ERROR_CODES.NETWORK_ERROR,
    retryable: boolean = false,
    shouldReport: boolean = false,
    details?: any
  ) {
    super(message)
    this.name = 'KnowledgeGraphError'
    this.code = code
    this.retryable = retryable
    this.shouldReport = shouldReport
    this.details = details
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      retryable: this.retryable,
      shouldReport: this.shouldReport,
      details: this.details,
      stack: this.stack
    }
  }
}

/**
 * 错误处理工具类
 */
export class ErrorHandler {
  /**
   * 包装错误为KnowledgeGraphError
   */
  static wrapError(error: unknown, context?: string): KnowledgeGraphError {
    if (error instanceof KnowledgeGraphError) {
      return error
    }

    if (error instanceof Error) {
      return new KnowledgeGraphError(
        context ? `${context}: ${error.message}` : error.message,
        ERROR_CODES.NETWORK_ERROR,
        false,
        false,
        { originalError: error.message, stack: error.stack }
      )
    }

    return new KnowledgeGraphError(
      context ? `${context}: ${String(error)}` : String(error),
      ERROR_CODES.NETWORK_ERROR,
      false,
      false,
      { originalError: String(error) }
    )
  }

  /**
   * 判断错误是否可重试
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof KnowledgeGraphError) {
      return error.retryable
    }
    return false
  }

  /**
   * 获取错误代码
   */
  static getErrorCode(error: unknown): string {
    if (error instanceof KnowledgeGraphError) {
      return error.code
    }
    return ERROR_CODES.NETWORK_ERROR
  }

  /**
   * 格式化错误信息
   */
  static formatError(error: unknown): string {
    if (error instanceof KnowledgeGraphError) {
      return `[${error.code}] ${error.message}`
    }
    
    if (error instanceof Error) {
      return error.message
    }
    
    return String(error)
  }

  /**
   * 创建特定类型的错误
   */
  static createFileTooLargeError(filePath: string, size: number): KnowledgeGraphError {
    return new KnowledgeGraphError(
      `文件过大: ${filePath} (${this.formatFileSize(size)})`,
      ERROR_CODES.FILE_TOO_LARGE,
      false,
      false,
      { filePath, size }
    )
  }

  static createFileReadError(filePath: string, originalError: Error): KnowledgeGraphError {
    return new KnowledgeGraphError(
      `读取文件失败: ${filePath}`,
      ERROR_CODES.FILE_READ_ERROR,
      true,
      false,
      { filePath, originalError: originalError.message }
    )
  }

  static createLLMRateLimitError(retryAfter?: number): KnowledgeGraphError {
    return new KnowledgeGraphError(
      'LLM API 限流',
      ERROR_CODES.LLM_RATE_LIMIT,
      true,
      true,
      { retryAfter }
    )
  }

  static createLLMContextExceededError(): KnowledgeGraphError {
    return new KnowledgeGraphError(
      'LLM 上下文超出限制',
      ERROR_CODES.LLM_CONTEXT_EXCEEDED,
      false,
      true
    )
  }

  static createStorageError(operation: string, details?: any): KnowledgeGraphError {
    return new KnowledgeGraphError(
      `存储操作失败: ${operation}`,
      ERROR_CODES.STORAGE_ERROR,
      true,
      true,
      { operation, details }
    )
  }

  static createNetworkError(message: string, details?: any): KnowledgeGraphError {
    return new KnowledgeGraphError(
      `网络错误: ${message}`,
      ERROR_CODES.NETWORK_ERROR,
      true,
      false,
      details
    )
  }

  static createInvalidResponseError(message: string, response?: any): KnowledgeGraphError {
    return new KnowledgeGraphError(
      `无效响应: ${message}`,
      ERROR_CODES.INVALID_RESPONSE,
      false,
      true,
      { response }
    )
  }

  static createTimeoutError(operation: string, timeout: number): KnowledgeGraphError {
    return new KnowledgeGraphError(
      `操作超时: ${operation} (${timeout}ms)`,
      ERROR_CODES.TIMEOUT,
      true,
      false,
      { operation, timeout }
    )
  }

  /**
   * 格式化文件大小
   */
  private static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

/**
 * 重试工具类
 */
export class RetryUtil {
  /**
   * 执行带重试的操作
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000,
    backoffMultiplier: number = 2,
    maxDelay: number = 30000,
    shouldRetry?: (error: unknown) => boolean
  ): Promise<T> {
    let lastError: unknown
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        
        // 检查是否应该重试
        if (attempt === maxRetries) {
          break
        }
        
        if (shouldRetry && !shouldRetry(error)) {
          break
        }
        
        if (!ErrorHandler.isRetryable(error)) {
          break
        }
        
        // 计算延迟时间
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        )
        
        // 等待重试
        await this.delay(delay)
      }
    }
    
    throw ErrorHandler.wrapError(lastError, `重试${maxRetries}次后仍然失败`)
  }

  /**
   * 延迟函数
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}