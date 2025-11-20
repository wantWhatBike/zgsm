/**
 * 知识图谱消息处理器
 * 处理所有知识图谱相关的消息，从主消息处理器中抽离出来
 */
import type { ClineProvider } from "../webview/ClineProvider"
import { knowledgeGraphManager } from "./KnowledgeGraphManager"
import { ILogger } from "../../utils/logger"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { DEFAULT_BUILD_STATE } from "./constants"
import { KNOWLEDGE_GRAPH_MESSAGES, API_PROVIDER } from "@roo-code/types"

/**
 * 知识图谱消息处理器
 * 负责处理所有知识图谱相关的消息
 */
export class KnowledgeGraphMessageHandler {
  private logger: ILogger
  private clineProvider: ClineProvider

  constructor(clineProvider: ClineProvider) {
    this.clineProvider = clineProvider
    this.logger = createLogger(Package.outputChannel)
  }

  /**
   * 处理知识图谱消息
   */
  async handleMessage(message: any): Promise<void> {
    try {
      // 检查 API 提供者是否为 zgsm - 使用常量
      const { apiConfiguration } = await this.clineProvider.getState()
      if (apiConfiguration?.apiProvider !== API_PROVIDER.ZGSM) {
        this.logger.warn("[KnowledgeGraphMessageHandler] 仅 CoStrict 提供商支持知识图谱功能")
        this.sendErrorResponse(message.type, "仅 CoStrict 提供商支持知识图谱功能")
        return
      }

      switch (message.type) {
        case KNOWLEDGE_GRAPH_MESSAGES.ENABLED:
          await this.handleEnabledMessage(message)
          break

        case KNOWLEDGE_GRAPH_MESSAGES.GET_STATUS:
          await this.handleGetStatusMessage()
          break

        case KNOWLEDGE_GRAPH_MESSAGES.BUILD:
          await this.handleStartBuildMessage()
          break

        case KNOWLEDGE_GRAPH_MESSAGES.PAUSE:
          await this.handlePauseBuildMessage()
          break

        case KNOWLEDGE_GRAPH_MESSAGES.RESUME:
          await this.handleResumeBuildMessage()
          break

        case KNOWLEDGE_GRAPH_MESSAGES.CLEAR:
          await this.handleClearBuildMessage()
          break
        default:
          this.logger.warn(`[KnowledgeGraphMessageHandler] 未知消息类型: ${message.type}`)
          this.sendErrorResponse(message.type, `未知消息类型: ${message.type}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "处理消息时发生未知错误"
      this.logger.error(`[KnowledgeGraphMessageHandler] 处理消息失败: ${message.type || 'unknown'}: ${errorMessage}`)
      this.sendErrorResponse(message.type || 'unknown', errorMessage)
    }
  }

  /**
   * 处理启用/禁用消息 - 重构版本，职责简化
   */
  private async handleEnabledMessage(message: any): Promise<void> {
    const isEnabled = message.bool ?? false
    
    try {
      // 设置提供者和日志（确保Manager有必要的依赖）
      knowledgeGraphManager.setProvider(this.clineProvider)
      knowledgeGraphManager.setLogger(this.logger)
      
      // 委托给Manager处理核心业务逻辑
      await knowledgeGraphManager.setKnowledgeGraphEnabled(isEnabled)
      
      // 发送成功响应到 webview
      this.clineProvider.postMessageToWebview({
        type: KNOWLEDGE_GRAPH_MESSAGES.ENABLED,
        payload: isEnabled,
      })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "切换知识图谱状态失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 状态切换失败: ${errorMessage}`)
      
      // 发送错误响应，并附带错误信息
      this.clineProvider.postMessageToWebview({
        type: KNOWLEDGE_GRAPH_MESSAGES.ENABLED,
        payload: false, // 失败时设置为false
        error: errorMessage // 传递具体错误信息给前端
      })
    }
  }


  /**
   * 处理轮询状态消息 - 简化版本，直接返回后端状态
   */
  private async handleGetStatusMessage(): Promise<void> {
    try {
      // 获取实时构建状态
      const buildState = knowledgeGraphManager.getBuildStatus()
      
      if (buildState) {
        this.sendStatusResponse(buildState)
        return
      }
      
      this.logger.warn(`[KnowledgeGraphMessageHandler] 未获取到知识图谱状态，使用默认状态`)
      
      // 返回默认状态
      this.sendStatusResponse(DEFAULT_BUILD_STATE)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取知识图谱状态失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 获取知识图谱状态失败: ${errorMessage}`)
      
      const errorState = {
        ...DEFAULT_BUILD_STATE,
        status: "error" as const,
        error: errorMessage,
      }
      
      this.sendStatusResponse(errorState)
    }
  }

  /**
   * 处理开始构建消息
   */
  private async handleStartBuildMessage(): Promise<void> {
    try {
      await knowledgeGraphManager.startBuild()
      
      await this.handleGetStatusMessage()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "知识图谱构建失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 构建失败: ${errorMessage}`)
      throw error
    }
  }

  /**
   * 处理暂停构建消息
   */
  private async handlePauseBuildMessage(): Promise<void> {
    try {
      await knowledgeGraphManager.pauseBuild()
      
      await this.handleGetStatusMessage()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "暂停构建失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 暂停失败: ${errorMessage}`)
      throw error
    }
  }

  /**
   * 处理继续构建消息
   */
  private async handleResumeBuildMessage(): Promise<void> {
    try {
      await knowledgeGraphManager.resumeBuild()
      
      await this.handleGetStatusMessage()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "继续构建失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 继续失败: ${errorMessage}`)
      throw error
    }
  }

  /**
   * 处理清除构建消息
   */
  private async handleClearBuildMessage(): Promise<void> {
    try {
      await knowledgeGraphManager.clearKnowledgeGraph()
      
      // 发送清空后的状态 - 使用Manager的真实状态，避免脑裂
      await this.handleGetStatusMessage()
      
      this.logger.info("[KnowledgeGraphMessageHandler] 已清除")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "清除失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 清除失败: ${errorMessage}`)
      
      // 发送错误状态
      const errorState = {
        ...DEFAULT_BUILD_STATE,
        status: "error" as const,
        error: errorMessage,
      }
      
      this.sendStatusResponse(errorState)
      
      throw error
    }
  }




  /**
   * 统一的状态响应发送方法
   */
  private sendStatusResponse(status: any): void {
    this.clineProvider.postMessageToWebview({
      type: KNOWLEDGE_GRAPH_MESSAGES.STATUS_RESPONSE,
      payload: {
        status: status
      }
    })
  }

  /**
   * 发送错误响应 - 统一使用状态结构
   */
  private sendErrorResponse(type: string, error: string): void {
    const errorState = {
      ...DEFAULT_BUILD_STATE,
      status: "error" as const,
      error: error,
    }
    
    this.sendStatusResponse(errorState)
  }
}

/**
 * 知识图谱消息处理器单例管理
 */
class KnowledgeGraphMessageHandlerSingleton {
  private static instance: KnowledgeGraphMessageHandler | null = null

  /**
   * 初始化知识图谱消息处理器
   */
  public static initialize(clineProvider: ClineProvider): KnowledgeGraphMessageHandler {
    if (!this.instance) {
      this.instance = new KnowledgeGraphMessageHandler(clineProvider)
    }
    return this.instance
  }

  /**
   * 获取知识图谱消息处理器
   */
  public static getInstance(): KnowledgeGraphMessageHandler | null {
    return this.instance
  }

  /**
   * 销毁知识图谱消息处理器
   */
  public static dispose(): void {
    this.instance = null
  }
}

/**
 * 初始化知识图谱消息处理器
 */
export function initializeKnowledgeGraphMessageHandler(clineProvider: ClineProvider): KnowledgeGraphMessageHandler {
  return KnowledgeGraphMessageHandlerSingleton.initialize(clineProvider)
}

/**
 * 获取知识图谱消息处理器
 */
export function getKnowledgeGraphMessageHandler(): KnowledgeGraphMessageHandler | null {
  return KnowledgeGraphMessageHandlerSingleton.getInstance()
}

/**
 * 销毁知识图谱消息处理器
 */
export function disposeKnowledgeGraphMessageHandler(): void {
  KnowledgeGraphMessageHandlerSingleton.dispose()
}

// 保持向后兼容的导出
export const knowledgeGraphMessageHandler = KnowledgeGraphMessageHandlerSingleton.getInstance()