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