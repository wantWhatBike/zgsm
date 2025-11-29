/**
 * LLM客户端 - 复用项目已有的ZGSM provider机制
 */

import { ZgsmAiHandler } from "../../../api/providers/zgsm"
import { LLMResponse } from "../types"
import { ErrorHandler } from "../errors/ErrorHandler"
import { ProgressTracer } from "../tools/ProgressTracer"
import { createLogger, ILogger } from "../../../utils/logger"
import { ProviderSettings } from "@roo-code/types"
import { ApiHandlerOptions } from "../../../shared/api"

/**
 * 带超时的 Promise 包装器
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
    )
  ])
}
import { LLM_CONFIG } from "../constants"

export class LLMClient {
  private zgsmHandler: ZgsmAiHandler
  private modelId: string
  private contextWindow: number
  private logger: ILogger
  private apiConfiguration: ProviderSettings
  private progressTracer: ProgressTracer
  private llmTimeoutMs: number
  private llmMaxRetries: number

  constructor(modelId: string, progressTracer: ProgressTracer, apiConfiguration?:ProviderSettings, logger?: ILogger, config?: { contextWindowSize?: number, llmTimeoutMs?: number, llmMaxRetries?: number }) {
    // 从task中获取API配置
    this.apiConfiguration = apiConfiguration || {}
    // 将ProviderSettings转换为ApiHandlerOptions
    const apiHandlerOptions = this.convertToApiHandlerOptions(this.apiConfiguration)
    this.zgsmHandler = new ZgsmAiHandler(apiHandlerOptions)
    this.modelId = modelId || this.apiConfiguration.zgsmModelId || 'auto'
    this.logger = logger || createLogger('LLMClient')
    // 使用配置的上下文窗口大小或默认值
    this.contextWindow = config?.contextWindowSize || this.getContextWindowByModel(this.modelId)
    // 使用配置的超时时间或默认值
    this.llmTimeoutMs = config?.llmTimeoutMs || LLM_CONFIG.timeout
    // 使用配置的重试次数或默认值
    this.llmMaxRetries = config?.llmMaxRetries || LLM_CONFIG.maxRetries
    // 初始化性能跟踪器
    this.progressTracer = progressTracer
    
    // ✅ 调试日志：打印 LLM 配置
    this.logger.info(`[LLMClient] ========== LLM 客户端初始化 ==========`)
    this.logger.info(`[LLMClient] 模型: ${this.modelId}`)
    this.logger.info(`[LLMClient] 上下文窗口: ${this.contextWindow} tokens`)
    this.logger.info(`[LLMClient] 超时时间: ${this.llmTimeoutMs / 1000} 秒`)
    this.logger.info(`[LLMClient] 最大重试: ${this.llmMaxRetries} 次`)
    this.logger.info(`[LLMClient] ================================================`)
  }

  /**
   * TODO: 根据模型ID获取上下文窗口大小
   */
  private getContextWindowByModel(modelId: string): number {
    return 128 * 1000
  }

  public  getContextWindow() {
	 return this.contextWindow
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
  async sendMessage(systemPrompt: string, userPrompt: string, options: {
    maxTokens?: number
    temperature?: number
  } = {}): Promise<LLMResponse<string|undefined>> {
    return await ErrorHandler.withLLMRetry(
      async () => {
        const startTime = Date.now()
        
        try {
          // 验证输入参数
          if (!userPrompt || userPrompt.trim().length === 0) {
            throw new Error("Prompt cannot be empty")
          }

          // 确保请求ID唯一性
          const requestId = "kg-req-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8)
          
          this.logger.debug(`[LLMClient] ========== LLM 请求开始 ==========`)
          this.logger.debug(`[LLMClient] RequestID: ${requestId}`)
          this.logger.debug(`[LLMClient] 模型: ${this.modelId}`)
          this.logger.debug(`[LLMClient] 超时限制: ${this.llmTimeoutMs / 1000} 秒`)
          
          // 构建用户消息 - 确保内容格式正确
          const trimmedPrompt = userPrompt.trim()
          
          // 关键问题：检查空字符串问题
          if (!userPrompt || userPrompt.trim().length === 0) {
            throw new Error("User prompt content is empty")
          }
          if (!systemPrompt || systemPrompt.trim().length === 0) {
            throw new Error("Systemprompt content is empty")
          }
          
          // 修复：将用户消息作为文本块数组，确保API能正确解析
          const userMessages = [{
            role: "user" as const,
            content: [{
              type: "text" as const,
              text: userPrompt
            }]
          }]

          // 使用ZGSM处理器发送请求
          const stream = this.zgsmHandler.createMessage(
            systemPrompt,
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
        
        // 处理流式响应（带超时控制）
        await withTimeout(
          (async () => {
            for await (const chunk of stream) {
              if (chunk.type === "text") {
                responseText += chunk.text
              } else if (chunk.type === "usage") {
                inputTokens += chunk.inputTokens
                outputTokens += chunk.outputTokens
                totalCost = chunk.totalCost || 0
              }
            }
          })(),
          this.llmTimeoutMs,
          `LLM 请求超时（${this.llmTimeoutMs / 1000}秒），可能是网络问题或模型响应过慢`
        )

          const duration = Date.now() - startTime

          // 验证响应内容
          if (!responseText.trim()) {
            throw ErrorHandler.createInvalidResponseError("LLM返回空响应")
          }

          this.logger.debug(`[LLMClient] ✅ 请求成功`)
          this.logger.debug(`[LLMClient] ResponseID: ${requestId}`)
          this.logger.debug(`[LLMClient] 耗时: ${duration}ms`)
          this.logger.debug(`[LLMClient] 输入 tokens: ${inputTokens}, 输出 tokens: ${outputTokens}`)
          this.logger.debug(`[LLMClient] ================================================`)

          const usage = {
            inputTokens,
            outputTokens,
            cost: totalCost
          }

          // 记录LLM请求统计信息到ProgressTracer
          this.progressTracer.recordLLMRequest(usage, duration, true)

          return {
            success: true,
            error: "",
            data: responseText.trim(),
            usage,
            duration
          }

        } catch (error) {
          const duration = Date.now() - startTime
          
          // 记录失败的LLM请求统计信息
          this.progressTracer.recordLLMRequest(
            { inputTokens: 0, outputTokens: 0, cost: 0 },
            duration,
            false
          )
          
          this.logger.error(`[LLMClient] 发送消息失败: ${error}`)
          throw error
        }
      },
      "LLM消息发送",
      this.logger,
      this.llmMaxRetries
    )
  }

  /**
   * 发送结构化请求并解析JSON响应
   */
  async sendStructuredRequest<T = any>(
    userPrompt: string,
    responseSchema: any,
    systemPrompt?: string,
    options: {
      maxTokens?: number
      temperature?: number
    } = {}
  ): Promise<LLMResponse<T|undefined>> {
    return await ErrorHandler.withLLMRetry(
      async () => {
        // 验证输入prompt
        if (!userPrompt || userPrompt.trim().length === 0) {
          throw new Error("user prompt cannot be empty")
        }
        
        const effectiveSystemPrompt = (systemPrompt || '').trim() || `仅返回纯 JSON 格式响应，不包含任何多余内容（包括解释、注释、Markdown 代码块、文字说明、额外换行等），确保 JSON 语法严格正确可直接解析：\n${JSON.stringify(responseSchema, null, 2)}`
        
        // 使用有效的systemPrompt发送请求
        const response = await this.sendMessage( effectiveSystemPrompt, userPrompt, {
          ...options,
        })
        
        if (!response.success || !response.data) {
          throw new Error(response.error || "LLM请求失败")
        }
                // 添加本次 usage 的 debug 日志
        this.logger.debug(`[LLMClient] 本次请求 usage 统计:`, {
          inputTokens: response.usage?.inputTokens || 0,
          outputTokens: response.usage?.outputTokens || 0,
          cost: response.usage?.cost || 0,
          duration: response.duration || 0
        })

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
          duration: response.duration,
        }
      },
      "LLM结构化请求",
      this.logger,
      this.llmMaxRetries
    )
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
   * 估算token数量
   */
  private estimateTokens(text: string): number {
    // 简单的估算：中文字符算2个token，英文单词算1.3个token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
    return Math.ceil(chineseChars * 2 + englishWords * 1.3)
  }

}
