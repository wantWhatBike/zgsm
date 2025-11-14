/**
 * LLM客户端 - 复用项目已有的ZGSM provider机制
 */

import { ZgsmAiHandler } from "../../../api/providers/zgsm"
import { LLMResponse } from "../types"
import { LLM_CONFIG, ERROR_CODES, RETRY_CONFIG } from "../constants"
import { createHash } from "crypto"
import { createLogger, ILogger } from "../../../utils/logger"
import { ProviderSettings } from "@roo-code/types"
import { ApiHandlerOptions } from "../../../shared/api"

export class LLMClient {
  private zgsmHandler: ZgsmAiHandler
  private modelId: string
  private retryCount: number = 0
  private logger: ILogger
  private apiConfiguration: ProviderSettings

  constructor(apiConfiguration: ProviderSettings, modelId?: string) {
    this.apiConfiguration = apiConfiguration
    // 将ProviderSettings转换为ApiHandlerOptions
    const apiHandlerOptions = this.convertToApiHandlerOptions(apiConfiguration)
    this.zgsmHandler = new ZgsmAiHandler(apiHandlerOptions)
    this.modelId = modelId || apiConfiguration.zgsmModelId || 'gpt-4'
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
  } = {}): Promise<LLMResponse<string>> {
    try {
      // 构建消息内容
      const messages = []
      
      if (options.systemPrompt) {
        messages.push({
          role: "system" as const,
          content: options.systemPrompt
        })
      }
      
      messages.push({
        role: "user" as const,
        content: prompt
      })

      this.logger.info(`[LLMClient] 发送消息到LLM，模型: ${this.modelId}`)
      
      // 使用ZGSM处理器发送请求
      const stream = this.zgsmHandler.createMessage(
        options.systemPrompt || "",
        messages.filter(m => m.role !== "system"),
        {
          taskId: "knowledge-graph-" + Date.now(),
          instanceId: "kg-" + Math.random().toString(36).substr(2, 9)
        }
      )

      let responseText = ""
      let inputTokens = 0
      let outputTokens = 0
      let totalCost = 0

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

      // 验证响应内容
      if (!responseText.trim()) {
        throw new KnowledgeGraphError(
          "LLM返回空响应",
          ERROR_CODES.INVALID_RESPONSE,
          false,
          false
        )
      }

      const usage = {
        inputTokens,
        outputTokens,
        cost: totalCost
      }

      return {
        success: true,
        data: responseText.trim(),
        usage
      }

    } catch (error) {
      this.logger.error(`[LLMClient] 发送消息失败:`, error)
      return this.handleError(error)
    }
  }

  /**
   * 发送结构化请求并解析JSON响应
   */
  async sendStructuredRequest<T = any>(
    prompt: string,
    schema: any,
    options: {
      maxTokens?: number
      temperature?: number
      systemPrompt?: string
    } = {}
  ): Promise<LLMResponse<T>> {
    try {
      // 添加JSON格式要求到提示词
      const jsonPrompt = `${prompt}\n\n请严格按照以下JSON格式返回，不要包含任何其他内容：\n${JSON.stringify(schema, null, 2)}`
      
      const response = await this.sendMessage(jsonPrompt, options)
      
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
        data: parsedData,
        usage: response.usage
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
  ): Promise<LLMResponse<string>[]> {
    const results: LLMResponse<string>[] = []
    
    for (const prompt of prompts) {
      try {
        const result = await this.sendMessage(prompt, options)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error)
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
  private handleError(error: any): LLMResponse<never> {
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
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0
      }
    }
  }

  /**
   * 重试机制
   */
  async retryWithBackoff<T>(
    operation: () => Promise<LLMResponse<T>>,
    maxRetries: number = RETRY_CONFIG.maxRetries
  ): Promise<LLMResponse<T>> {
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
        
        // 检查是否应该重试
        if (result.error.includes('rate limit')) {
          this.logger.warn(`[LLMClient] 限流错误，指数退避重试 (attempt ${attempt + 1}/${maxRetries})`)
          // 指数退避
          const delay = Math.min(
            RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
            RETRY_CONFIG.maxDelay
          )
          await new Promise(resolve => setTimeout(resolve, delay))
        } else if (!result.error.includes('context') && !result.error.includes('too long')) {
          this.logger.info(`[LLMClient] 非上下文错误，简单重试 (attempt ${attempt + 1}/${maxRetries})`)
          // 非上下文相关的错误可以重试
          await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.initialDelay))
        } else {
          // 上下文超限错误不重试
          this.logger.warn(`[LLMClient] 上下文超限错误，停止重试`)
          break
        }
        
      } catch (error) {
        lastError = error
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.initialDelay))
        }
      }
    }
    
    return {
      success: false,
      error: lastError instanceof Error ? lastError.message : String(lastError)
    }
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

// 导入KnowledgeGraphError类型
import { KnowledgeGraphError } from "../types"