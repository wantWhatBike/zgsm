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
 * ✅ 中止错误类（用户主动中止操作，如暂停）
 * 
 * 设计目的：
 * - 区分用户主动中止和系统错误，避免字符串匹配
 * - 不可重试（用户意图明确）
 * - 可恢复（用户可以继续）
 */
export class AbortedError extends KnowledgeGraphError {
  constructor(message: string = "操作被中止", context?: string) {
    super(
      message,
      ERROR_CODES.ABORTED,
      false,  // 不可重试
      false,  // 不需要上报
      { context }
    )
    this.name = "AbortedError"
  }
}