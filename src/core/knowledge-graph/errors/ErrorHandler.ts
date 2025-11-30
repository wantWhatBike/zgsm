/**
 * 统一错误处理工具类
 * 消除重复的错误处理逻辑，提供统一的错误处理和重试机制
 */

import { KnowledgeGraphError, AbortedError } from "../errors/KnowledgeGraphError"
import { ERROR_CODES, RETRY_CONFIG } from "../constants"
import { ILogger } from "../../../utils/logger"

export class ErrorHandler {
  /**
   * 处理分析错误，统一错误格式
   */
  static handleAnalysisError(error: unknown, context: string): KnowledgeGraphError {
    if (error instanceof KnowledgeGraphError) {
      return error
    }
    
    const message = error instanceof Error ? error.message : String(error)
    return new KnowledgeGraphError(
      `${context}失败: ${message}`,
      ERROR_CODES.NETWORK_ERROR,
      true,
      true,
      context
    )
  }

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
   * 创建文件读取错误
   */
  static createFileReadError(filePath: string, originalError: Error): KnowledgeGraphError {
    return new KnowledgeGraphError(
      `读取文件失败: ${filePath}`,
      ERROR_CODES.FILE_READ_ERROR,
      true,
      false,
      { filePath, originalError: originalError.message }
    )
  }

  /**
   * 智能重试机制
   * 根据错误类型采用不同的重试策略
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    logger?: ILogger,
    maxRetries: number = RETRY_CONFIG.maxRetries
  ): Promise<T> {
    let lastError: unknown
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        
        if (attempt < maxRetries - 1) {
          const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
          const delay = this.calculateRetryDelay(errorMessage, attempt)
          
          logger?.warn(`[ErrorHandler] ${context} 重试 (${attempt + 1}/${maxRetries}), 延迟: ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    throw this.handleAnalysisError(lastError, context)
  }

  /**
   * 根据错误类型计算重试延迟
   */
  private static calculateRetryDelay(errorMessage: string, attempt: number): number {
    if (this.isRateLimitError(errorMessage)) {
      // 限流错误：指数退避，较长延迟
      return Math.min(
        RETRY_CONFIG.initialDelay * 2 * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        60000 // 最大60秒
      )
    } else if (this.isNetworkError(errorMessage)) {
      // 网络错误：快速重试
      return Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(1.5, attempt),
        10000 // 最大10秒
      )
    } else if (this.isTimeoutError(errorMessage)) {
      // 超时错误：中等延迟重试
      return Math.min(
        RETRY_CONFIG.initialDelay * 2 * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        30000 // 最大30秒
      )
    } else {
      // 其他错误：标准重试
      return RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt)
    }
  }

  /**
   * 判断是否为限流错误
   */
  private static isRateLimitError(errorMessage: string): boolean {
    return errorMessage.includes('rate limit') ||
           errorMessage.includes('429') ||
           errorMessage.includes('too many requests')
  }

  /**
   * 判断是否为网络错误
   */
  private static isNetworkError(errorMessage: string): boolean {
    return errorMessage.includes('network') ||
           errorMessage.includes('connection') ||
           errorMessage.includes('econnreset') ||
           errorMessage.includes('enotfound')
  }

  /**
   * 判断是否为超时错误
   */
  private static isTimeoutError(errorMessage: string): boolean {
    return errorMessage.includes('timeout') ||
           errorMessage.includes('timed out')
  }


  /**
   * ✅ 安全检查是否应该中止（防御性编程）
   * 捕获中止检查函数的异常，避免影响重试逻辑
   */
  private static shouldAbortOperation(shouldAbort?: () => boolean, logger?: ILogger): boolean {
    if (!shouldAbort) return false
    
    try {
      return shouldAbort()
    } catch (error) {
      // 暂停检查失败，视为不暂停（保守策略，记录警告）
      logger?.warn(`[ErrorHandler] 暂停检查失败，继续执行: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 智能重试机制 - 根据错误类型采用不同策略
   * @param operation 要执行的操作
   * @param context 上下文描述（用于日志）
   * @param logger 日志记录器
   * @param maxRetries 最大重试次数
   * @param shouldAbort 可选的中止检查函数，返回 true 时中止重试（如用户暂停）
   */
  static async withLLMRetry<T>(
    operation: () => Promise<T>,
    context: string,
    logger?: ILogger,
    maxRetries: number = RETRY_CONFIG.maxRetries,
    shouldAbort?: () => boolean
  ): Promise<T> {
    let lastError: unknown
    
    // ✅ 调试日志：开始重试机制
    if (maxRetries > 1) {
      logger?.debug(`[ErrorHandler] ${context} - 启用重试机制（最大重试: ${maxRetries} 次）`)
    }
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // ✅ 每次重试前检查是否应该中止（防御性：捕获异常）
      if (this.shouldAbortOperation(shouldAbort, logger)) {
        logger?.info(`[ErrorHandler] ${context} 操作被中止（用户暂停或系统停止）`)
        throw new AbortedError(`${context} 被中止`, context)
      }
      
      try {
        const result = await operation()
        // ✅ 调试日志：首次成功或重试成功
        if (attempt > 0) {
          logger?.info(`[ErrorHandler] ✅ ${context} 重试成功（第 ${attempt + 1} 次尝试）`)
        }
        return result
      } catch (error) {
        lastError = error
        
        if (attempt < maxRetries - 1) {
          // ✅ 重试前再次检查中止状态（防御性：捕获异常）
          if (this.shouldAbortOperation(shouldAbort, logger)) {
            logger?.info(`[ErrorHandler] ${context} 重试被中止（用户暂停或系统停止）`)
            throw new AbortedError(`${context} 被中止`, context)
          }
          
          const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
          
          // 检查是否应该停止重试
          if (this.isContextExceededError(errorMessage) || this.isInvalidResponseError(errorMessage)) {
            logger?.warn(`[ErrorHandler] ⚠️ ${context} 错误不可重试，停止重试: ${error instanceof Error ? error.message : String(error)}`)
            break
          }
          
          const delay = this.calculateRetryDelay(errorMessage, attempt)
          logger?.warn(`[ErrorHandler] ⚠️ ${context} 第 ${attempt + 1} 次尝试失败，${delay}ms 后重试（${attempt + 2}/${maxRetries}）`)
          logger?.debug(`[ErrorHandler] 错误详情: ${error instanceof Error ? error.message : String(error)}`)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          // ✅ 调试日志：所有重试失败
          logger?.error(`[ErrorHandler] ❌ ${context} 所有重试失败（${maxRetries} 次）`)
        }
      }
    }
    
    throw this.handleAnalysisError(lastError, context)
  }

  /**
   * 判断是否为上下文超限错误（不应重试）
   */
  static isContextExceededError(errorMessage: string): boolean {
    return errorMessage.includes('context') ||
           errorMessage.includes('too long') ||
           errorMessage.includes('maximum context length')
  }

  /**
   * 判断是否为无效响应错误（不应重试）
   */
  static isInvalidResponseError(errorMessage: string): boolean {
    return errorMessage.includes('invalid response') ||
           errorMessage.includes('empty response') ||
           errorMessage.includes('parse error')
  }

  /**
   * 创建无效响应错误
   */
  static createInvalidResponseError(message: string, context?: string): KnowledgeGraphError {
    return new KnowledgeGraphError(
      message,
      ERROR_CODES.INVALID_RESPONSE,
      false, // 不可重试
      true,  // 可恢复
      context
    )
  }
}