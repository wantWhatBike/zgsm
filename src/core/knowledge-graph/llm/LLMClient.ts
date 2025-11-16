/**
 * LLM客户端 - 复用项目已有的ZGSM provider机制
 */

import { ZgsmAiHandler } from "../../../api/providers/zgsm"
import { LLMResponse, KnowledgeGraphError } from "../types"
import { ERROR_CODES, RETRY_CONFIG } from "../constants"
import { createHash } from "crypto"
import { createLogger, ILogger } from "../../../utils/logger"
import { ProviderSettings } from "@roo-code/types"
import { ApiHandlerOptions } from "../../../shared/api"
import { any } from "zod"

export class LLMClient {
  private zgsmHandler: ZgsmAiHandler
  private modelId: string
  private retryCount: number = 0
  // TODO 获取到模型窗口大小
  private contextWindows: number = 64 * 1000
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
        throw new KnowledgeGraphError(
          "LLM返回空响应",
          ERROR_CODES.INVALID_RESPONSE,
          false,
          false
        )
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
      this.logger.error(`[LLMClient] 发送消息失败:`, error)
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
      
      this.logger.info(`[LLMClient] 发送结构化请求，原始提示词长度: ${userPrompt.length}`)
      this.logger.info(`[LLMClient] 构建的JSON提示词长度: ${jsonPrompt.length}`)
      
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
      this.logger.error(`[LLMClient] 发送结构化请求失败:`, error)
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
   * 清理JSON响应
   */
  private cleanJsonResponse(response: string): string {
    // 移除可能的markdown代码块标记
    let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '')
    
    // 移除前后空白
    cleaned = cleaned.trim()
    
    // 移除可能的解释性文本（在JSON前后的文本）
    cleaned = cleaned.replace(/^[^{\[]*/, '').replace(/[^}\]]*$/, '')
    
    // 尝试找到JSON数组的开始和结束
    const arrayStart = cleaned.indexOf('[')
    const arrayEnd = cleaned.lastIndexOf(']')
    
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayStart < arrayEnd) {
      // 优先处理数组格式
      return cleaned.substring(arrayStart, arrayEnd + 1)
    }
    
    // 如果没有数组，尝试找到JSON对象的开始和结束
    const objStart = cleaned.indexOf('{')
    const objEnd = cleaned.lastIndexOf('}')
    
    if (objStart !== -1 && objEnd !== -1 && objStart < objEnd) {
      return cleaned.substring(objStart, objEnd + 1)
    }
    
    // 如果都没找到，返回清理后的原始内容
    return cleaned
  }

  /**
   * 增强的JSON解析方法
   */
  private parseJsonResponse<T>(response: string): T {
    // 首先尝试直接解析
    try {
      return JSON.parse(response)
    } catch (directError) {
      // 如果直接解析失败，尝试清理后解析
      try {
        const cleaned = this.cleanJsonResponse(response)
        return JSON.parse(cleaned)
      } catch (cleanedError) {
        // 如果清理后仍然失败，尝试逐行解析（处理JSONL格式）
        try {
          const lines = response.split('\n').filter(line => line.trim())
          const results: any[] = []
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line.trim())
              results.push(parsed)
            } catch (lineError) {
              // 跳过无法解析的行
              continue
            }
          }
          
          if (results.length > 0) {
            return (results.length === 1 ? results[0] : results) as T
          }
        } catch (jsonlError) {
          // JSONL解析也失败
        }
        
        // 最后尝试提取可能的JSON片段
        try {
          return this.extractJsonFromText<T>(response)
        } catch (extractError) {
          throw new KnowledgeGraphError(
            `JSON解析失败: ${cleanedError instanceof Error ? cleanedError.message : String(cleanedError)}. 原始响应: ${response.substring(0, 500)}...`,
            ERROR_CODES.INVALID_RESPONSE,
            false,
            false
          )
        }
      }
    }
  }

  /**
   * 从文本中提取JSON片段
   */
  private extractJsonFromText<T>(text: string): T {
    // 使用正则表达式查找JSON对象或数组
    const jsonObjectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
    const jsonArrayRegex = /\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/g
    
    // 先尝试数组
    const arrayMatches = text.match(jsonArrayRegex)
    if (arrayMatches) {
      for (const match of arrayMatches) {
        try {
          return JSON.parse(match)
        } catch (e) {
          continue
        }
      }
    }
    
    // 再尝试对象
    const objectMatches = text.match(jsonObjectRegex)
    if (objectMatches) {
      for (const match of objectMatches) {
        try {
          return JSON.parse(match)
        } catch (e) {
          continue
        }
      }
    }
    
    throw new Error('无法从文本中提取有效的JSON')
  }

  /**
   * 错误处理
   */
  private handleError<T>(error: any): LLMResponse<T|undefined> {
    let errorMessage = error instanceof Error ? error.message : String(error)
    
    // 根据错误类型设置重试策略
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      this.logger.warn(`[LLMClient] 遇到限流错误: ${errorMessage}`)
    } else if (errorMessage.includes('context') || errorMessage.includes('too long')) {
      this.logger.warn(`[LLMClient] 上下文超限错误: ${errorMessage}`)
    } else if (errorMessage.includes('timeout')) {
      this.logger.warn(`[LLMClient] 超时错误: ${errorMessage}`)
    } else {
      this.logger.error(`[LLMClient] 未知错误: ${errorMessage}`)
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
