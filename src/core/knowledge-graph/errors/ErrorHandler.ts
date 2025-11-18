/**
 * 统一错误处理工具类
 * 消除重复的错误处理逻辑，提供统一的错误处理和重试机制
 */

import { KnowledgeGraphError } from "../errors/KnowledgeGraphError"
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
   * 批量操作错误处理
   */
  static async handleBatchOperation<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    context: string,
    logger?: ILogger,
    continueOnError: boolean = true
  ): Promise<{ results: R[], errors: Array<{ item: T, error: unknown }> }> {
    const results: R[] = []
    const errors: Array<{ item: T, error: unknown }> = []

    for (const item of items) {
      try {
        const result = await this.withRetry(
          () => operation(item),
          `${context}[${JSON.stringify(item)}]`,
          logger
        )
        results.push(result)
      } catch (error) {
        errors.push({ item, error })
        
        if (!continueOnError) {
          throw this.handleAnalysisError(error, context)
        }
        
        logger?.error(`[ErrorHandler] ${context} 处理项目失败:`, error)
      }
    }

    return { results, errors }
  }
}