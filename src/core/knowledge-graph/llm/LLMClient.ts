/**
 * LLM客户端 - 复用项目已有的ZGSM provider机制
 */

import { ZgsmAiHandler } from "../../../api/providers/zgsm"
import { LLMResponse } from "../types"
import { ERROR_CODES, RETRY_CONFIG, LLM_CONFIG } from "../constants"
import { KnowledgeGraphError, ErrorHandler } from "../errors/KnowledgeGraphError"
import { createHash } from "crypto"
import { createLogger, ILogger } from "../../../utils/logger"
import { ProviderSettings } from "@roo-code/types"
import { ApiHandlerOptions } from "../../../shared/api"
import { any } from "zod"

export class LLMClient {
  private zgsmHandler: ZgsmAiHandler
  private modelId: string
  private retryCount: number = 0
  private contextWindows: number
  private logger: ILogger
  private apiConfiguration: ProviderSettings

  constructor(modelId?: string, apiConfiguration?:ProviderSettings) {
    // 从task中获取API配置
    this.apiConfiguration = apiConfiguration || {}
    // 将ProviderSettings转换为ApiHandlerOptions
    const apiHandlerOptions = this.convertToApiHandlerOptions(this.apiConfiguration)
    this.zgsmHandler = new ZgsmAiHandler(apiHandlerOptions)
    this.modelId = modelId || this.apiConfiguration.zgsmModelId || 'auto'
    this.logger = createLogger()
    // 根据模型设置上下文窗口大小
    this.contextWindows = this.getModelContextWindow(this.modelId)
  }

  /**
   * TODO: 根据模型ID获取上下文窗口大小
   */
  private getModelContextWindow(modelId: string): number {
    return 128 * 1000
  }

  /**
   * 将ProviderSettings转换为ApiHandlerOptions
   */
  private convertToApiHandlerOptions(providerSettings: ProviderSettings): ApiHandlerOptions {
    // ApiHandlerOptions是ProviderSettings去掉apiProvider字段，再加上一些可选字段
    const { apiProvider, ...rest } = providerSettings as any
    return {
      ...rest,
      // 可以在这里添加ApiHandlerOptions特有的字段
    } as ApiHandlerOptions
  }

  /**
   * 发送消息到LLM并获取响应 - 复用ZGSM API机制
   */
  async sendMessage(prompt: string, options: {
    maxTokens?: number
    temperature?: number
    systemPrompt?: string
  } = {}): Promise<LLMResponse<string|undefined>> {
    try {
      // 验证输入参数
      if (!prompt || prompt.trim().length === 0) {
        throw new Error("Prompt cannot be empty")
      }

      // 确保请求ID唯一性
      const requestId = "kg-req-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8)
      
      this.logger.info(`[LLMClient] 发送消息到LLM，模型: ${this.modelId}`)
      this.logger.info(`[RequestID]: ${requestId}`)
      
      // 构建用户消息 - 确保内容格式正确
      const trimmedPrompt = prompt.trim()
      
      // 关键问题：检查空字符串问题
      if (trimmedPrompt.length === 0) {
        this.logger.error(`[LLMClient] 用户消息内容为空！`)
        throw new Error("User message content is empty")
      }
      
      // 强制确保systemPrompt不为空字符串 - 修复空systemPrompt问题
      const effectiveSystemPrompt = (options.systemPrompt || '').trim() || '你是代码分析专家，专门分析项目结构和技术栈。请严格按照JSON格式返回分析结果。'
      
      this.logger.info(`[LLMClient] 准备发送消息，用户消息内容长度: ${trimmedPrompt.length}`)
      this.logger.info(`[LLMClient] 系统提示词长度: ${effectiveSystemPrompt.length}`)
      this.logger.info(`[LLMClient] 用户消息前100字符: ${trimmedPrompt.substring(0, 100)}...`)
      
      // 修复：将用户消息作为文本块数组，确保API能正确解析
      const userMessages = [{
        role: "user" as const,
        content: [{
          type: "text" as const,
          text: trimmedPrompt
        }]
      }]

      // 使用ZGSM处理器发送请求
      const stream = this.zgsmHandler.createMessage(
        effectiveSystemPrompt,
        userMessages,
        {
          taskId: requestId,
          instanceId: "kg-" + Math.random().toString(36).substring(2, 9),

        }
      )

      let responseText = ""
      let inputTokens = 0
      let outputTokens = 0
      let totalCost = 0
      const startTime = Date.now()

      // 处理流式响应
      for await (const chunk of stream) {
        if (chunk.type === "text") {
          responseText += chunk.text
        } else if (chunk.type === "usage") {
          inputTokens += chunk.inputTokens
          outputTokens += chunk.outputTokens
          totalCost = chunk.totalCost || 0
        }
      }

      const duration = Date.now() - startTime

      // 验证响应内容
      if (!responseText.trim()) {
        throw ErrorHandler.createInvalidResponseError("LLM返回空响应")
      }

      this.logger.info(`[ResponseID]: ${requestId}`)

      const usage = {
        inputTokens,
        outputTokens,
        cost: totalCost
      }

      return {
        success: true,
        error: "",
        data: responseText.trim(),
        usage,
        duration
      }

    } catch (error) {
      this.logger.error(`[LLMClient] 发送消息失败: ${error}`)
      return this.handleError(error)
    }
  }

  /**
   * 发送结构化请求并解析JSON响应
   * TODO 智能化重试
   */
  async sendStructuredRequest<T = any>(
    userPrompt: string,
    responseSchema: any,
    options: {
      maxTokens?: number
      temperature?: number
      systemPrompt?: string
    } = {}
  ): Promise<LLMResponse<T|undefined>> {
    try {
      // 验证输入prompt
      if (!userPrompt || userPrompt.trim().length === 0) {
        throw new Error("Structured request prompt cannot be empty")
      }
      
      // 添加JSON格式要求到提示词
      const jsonPrompt = `${userPrompt}\n\n请严格按照以下JSON格式返回，不要包含任何其他内容：\n${JSON.stringify(responseSchema, null, 2)}`
      
      
      // 修复：确保systemPrompt不为空并记录有效的systemPrompt
      const effectiveSystemPrompt = (options.systemPrompt || '').trim() || '你是代码分析专家，专门分析项目结构和技术栈。请严格按照JSON格式返回分析结果。'
      
      // 使用有效的systemPrompt发送请求
      const response = await this.sendMessage(jsonPrompt, {
        ...options,
        systemPrompt: effectiveSystemPrompt
      })
      
      if (!response.success || !response.data) {
        return response as LLMResponse<T>
      }

      // 解析JSON响应
      let parsedData: T
      try {
        // 使用增强的JSON解析方法
        parsedData = this.parseJsonResponse<T>(response.data!)
      } catch (parseError) {
        this.logger.error(`[LLMClient] JSON解析详细错误:`, {
          error: parseError,
          responseLength: response.data!.length,
          responsePreview: response.data!.substring(0, 200)
        })
        throw parseError
      }

      return {
        success: true,
        error: "",
        data: parsedData,
        usage: response.usage,
        duration: 0,
      }

    } catch (error) {
      this.logger.error(`[LLMClient] 结构化请求失败: ${error}`)
      return this.handleError(error)
    }
  }

  /**
   * 批量发送请求
   */
  async sendBatchRequests(
    prompts: string[],
    options: {
      maxTokens?: number
      temperature?: number
      systemPrompt?: string
    } = {}
  ): Promise<LLMResponse<string|undefined>[]> {
    const results: LLMResponse<string|undefined>[] = []
    
    for (const prompt of prompts) {
      try {
        const result = await this.sendMessage(prompt, options)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          data: "",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cost: 0
          },
          duration: 0
        })
      }
    }
    
    return results
  }

  /**
   * 清理JSON响应 - 优化内存使用
   */
  private cleanJsonResponse(response: string): string {
    // 一次性处理，减少字符串创建
    const trimmed = response.trim()
    
    // 移除markdown代码块标记
    const withoutCodeBlocks = trimmed.replace(/```(?:json)?\s*/g, '')
    
    // 找到JSON的开始和结束位置
    const arrayStart = withoutCodeBlocks.indexOf('[')
    const arrayEnd = withoutCodeBlocks.lastIndexOf(']')
    const objStart = withoutCodeBlocks.indexOf('{')
    const objEnd = withoutCodeBlocks.lastIndexOf('}')
    
    // 优先处理数组格式
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayStart < arrayEnd) {
      return withoutCodeBlocks.substring(arrayStart, arrayEnd + 1)
    }
    
    // 处理对象格式
    if (objStart !== -1 && objEnd !== -1 && objStart < objEnd) {
      return withoutCodeBlocks.substring(objStart, objEnd + 1)
    }
    
    // 如果都没找到，返回处理后的内容
    return withoutCodeBlocks
  }

  /**
   * 增强的JSON解析方法 - 优化性能和内存使用
   */
  private parseJsonResponse<T>(response: string): T {
    // 首先尝试直接解析
    try {
      return JSON.parse(response)
    } catch (directError) {
      // 尝试清理后解析
      const cleaned = this.cleanJsonResponse(response)
      try {
        return JSON.parse(cleaned)
      } catch (cleanedError) {
        // 尝试JSONL格式解析
        const jsonlResult = this.tryParseJsonLines<T>(response)
        if (jsonlResult !== null) {
          return jsonlResult
        }
        
        // 最后尝试提取JSON片段
        const extractedResult = this.tryExtractJson<T>(response)
        if (extractedResult !== null) {
          return extractedResult
        }
        
        throw ErrorHandler.createInvalidResponseError(
          `JSON解析失败: ${cleanedError instanceof Error ? cleanedError.message : String(cleanedError)}`,
          response.substring(0, 500)
        )
      }
    }
  }

  /**
   * 尝试解析JSONL格式
   */
  private tryParseJsonLines<T>(response: string): T | null {
    try {
      const lines = response.split('\n')
      const results: any[] = []
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        
        try {
          results.push(JSON.parse(trimmed))
        } catch {
          // 跳过无法解析的行
        }
      }
      
      if (results.length > 0) {
        return (results.length === 1 ? results[0] : results) as T
      }
    } catch {
      // JSONL解析失败
    }
    
    return null
  }

  /**
   * 尝试从文本中提取JSON
   */
  private tryExtractJson<T>(response: string): T | null {
    // 使用更高效的正则表达式
    const jsonPatterns = [
      /\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/g,  // 数组模式
      /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g         // 对象模式
    ]
    
    for (const pattern of jsonPatterns) {
      const matches = response.match(pattern)
      if (matches) {
        for (const match of matches) {
          try {
            return JSON.parse(match)
          } catch {
            continue
          }
        }
      }
    }
    
    return null
  }


  /**
   * 错误处理
   */
  private handleError<T>(error: any): LLMResponse<T|undefined> {
    let errorMessage = error instanceof Error ? error.message : String(error)
    
    // 根据错误类型设置重试策略
    // 简化错误分类日志
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      this.logger.warn(`[LLMClient] 限流错误`)
    } else if (errorMessage.includes('context') || errorMessage.includes('too long')) {
      this.logger.warn(`[LLMClient] 上下文超限`)
    } else if (errorMessage.includes('timeout')) {
      this.logger.warn(`[LLMClient] 请求超时`)
    } else {
      this.logger.error(`[LLMClient] 请求错误: ${errorMessage}`)
    }
    
    return {
      success: false,
      error: errorMessage,
      data: undefined,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0
      },
      duration:0
    }
  }

  /**
   * 智能重试机制 - 根据错误类型采用不同策略
   */
  async retryWithBackoff<T>(
    operation: () => Promise<LLMResponse<T>>,
    maxRetries: number = RETRY_CONFIG.maxRetries,
    context?: string
  ): Promise<LLMResponse<T|undefined>> {
    let lastError: any
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await operation()
        if (result.success) {
          return result
        }
        
        if (!result.error || attempt === maxRetries - 1) {
          return result
        }
        
        lastError = result.error
        const errorMessage = result.error.toLowerCase()
        
        // 智能重试策略 - 根据错误类型决定重试行为
        if (this.isRateLimitError(errorMessage)) {
          // 限流错误：指数退避，较长延迟
          this.logger.warn(`[LLMClient] 限流错误，指数退避重试 (attempt ${attempt + 1}/${maxRetries}) ${context || ''}`)
          const delay = Math.min(
            RETRY_CONFIG.initialDelay * 2 * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
            60000 // 最大60秒
          )
          await new Promise(resolve => setTimeout(resolve, delay))
          
        } else if (this.isNetworkError(errorMessage)) {
          // 网络错误：快速重试
          this.logger.warn(`[LLMClient] 网络错误，快速重试 (attempt ${attempt + 1}/${maxRetries}) ${context || ''}`)
          const delay = Math.min(
            RETRY_CONFIG.initialDelay * Math.pow(1.5, attempt),
            10000 // 最大10秒
          )
          await new Promise(resolve => setTimeout(resolve, delay))
          
        } else if (this.isTimeoutError(errorMessage)) {
          // 超时错误：中等延迟重试
          this.logger.warn(`[LLMClient] 超时错误，延迟重试 (attempt ${attempt + 1}/${maxRetries}) ${context || ''}`)
          const delay = Math.min(
            RETRY_CONFIG.initialDelay * 2 * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
            30000 // 最大30秒
          )
          await new Promise(resolve => setTimeout(resolve, delay))
          
        } else if (this.isContextExceededError(errorMessage)) {
          // 上下文超限错误：不重试
          this.logger.warn(`[LLMClient] 上下文超限错误，停止重试 ${context || ''}`)
          break
          
        } else if (this.isInvalidResponseError(errorMessage)) {
          // 无效响应错误：不重试
          this.logger.warn(`[LLMClient] 无效响应错误，停止重试 ${context || ''}`)
          break
          
        } else {
          // 其他错误：标准重试
          this.logger.info(`[LLMClient] 未知错误，标准重试 (attempt ${attempt + 1}/${maxRetries}) ${context || ''}`)
          await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.initialDelay))
        }
        
      } catch (error) {
        lastError = error
        if (attempt < maxRetries - 1) {
          const delay = Math.min(
            RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
            RETRY_CONFIG.maxDelay
          )
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    return {
      success: false,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0
      },
      duration:0,
      data:undefined,
    }
  }

  /**
   * 错误类型判断方法
   */
  private isRateLimitError(errorMessage: string): boolean {
    return errorMessage.includes('rate limit') ||
           errorMessage.includes('429') ||
           errorMessage.includes('too many requests')
  }

  private isNetworkError(errorMessage: string): boolean {
    return errorMessage.includes('network') ||
           errorMessage.includes('connection') ||
           errorMessage.includes('econnreset') ||
           errorMessage.includes('enotfound')
  }

  private isTimeoutError(errorMessage: string): boolean {
    return errorMessage.includes('timeout') ||
           errorMessage.includes('timed out')
  }

  private isContextExceededError(errorMessage: string): boolean {
    return errorMessage.includes('context') ||
           errorMessage.includes('too long') ||
           errorMessage.includes('maximum context length')
  }

  private isInvalidResponseError(errorMessage: string): boolean {
    return errorMessage.includes('invalid response') ||
           errorMessage.includes('empty response') ||
           errorMessage.includes('parse error')
  }

  getContextWindow():number {
    return this.contextWindows
  }

  /**
   * 批量请求处理 - 失败的单独重试
   */
  async sendBatchRequestsWithRetry(
    requests: Array<{prompt: string, options?: any}>,
    context?: string
  ): Promise<LLMResponse<string|undefined>[]> {
    const results: LLMResponse<string|undefined>[] = []
    
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i]
      const requestContext = `${context || ''}[${i + 1}/${requests.length}]`
      
      try {
        const result = await this.retryWithBackoff(
          () => this.sendMessage(request.prompt, request.options),
          RETRY_CONFIG.maxRetries,
          requestContext
        )
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
              usage: {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0
      },
      duration:0,
      data:undefined,
    })
      }
    }
    
    return results
  }

  /**
   * 估算token数量
   */
  private estimateTokens(text: string): number {
    // 简单的估算：中文字符算2个token，英文单词算1.3个token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
    return Math.ceil(chineseChars * 2 + englishWords * 1.3)
  }

  /**
   * 获取缓存键
   */
  getCacheKey(prompt: string, options: any = {}): string {
    const content = `${prompt}:${JSON.stringify(options)}:${this.modelId}`
    return createHash('sha256').update(content).digest('hex')
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return {
      modelId: this.modelId,
      contextWindow: 4096, // 默认值
      maxOutputTokens: 2048,
      supportsImages: false
    }
  }
}
