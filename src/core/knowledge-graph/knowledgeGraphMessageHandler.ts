/**
 * 知识图谱消息处理器
 * 处理所有知识图谱相关的消息，从主消息处理器中抽离出来
 */
import type { ClineProvider } from "../webview/ClineProvider"
import { knowledgeGraphManager } from "./KnowledgeGraphManager"
import { ILogger } from "../../utils/logger"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"

// 默认状态信息常量
const DEFAULT_STATUS_INFO = {
  status: "pending" as const,
  process: 0,
  totalFiles: 0,
  totalSucceed: 0,
  totalFailed: 0,
  failedReason: "",
  failedFiles: [],
  currentStage: "root_analysis" as const,
  stageProgress: 0
}

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
      // 检查 API 提供者是否为 zgsm
      const { apiConfiguration } = await this.clineProvider.getState()
      if (apiConfiguration?.apiProvider !== "zgsm") {
        this.logger.warn("[KnowledgeGraphMessageHandler] 仅 CoStrict 提供商支持知识图谱功能")
        this.sendErrorResponse(message.type, "仅 CoStrict 提供商支持知识图谱功能")
        return
      }

      switch (message.type) {
        case "knowledgeGraphEnabled":
          await this.handleEnabledMessage(message)
          break

        case "knowledgeGraphGetStatus":
          await this.handleGetStatusMessage()
          break

        case "knowledgeGraphBuild":
          await this.handleStartBuildMessage(message)
          break

        case "knowledgeGraphPause":
          await this.handlePauseBuildMessage()
          break

        case "knowledgeGraphResume":
          await this.handleResumeBuildMessage()
          break

        case "knowledgeGraphClear":
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
   * 处理启用/禁用消息
   */
  private async handleEnabledMessage(message: any): Promise<void> {
    const isEnabled = message.bool ?? false
    
    // 从 BuildStateTracer 获取当前状态而不是从 clineProvider
    const enabled = knowledgeGraphManager.isKnowledgeGraphEnabled()
    const oldEnabled = enabled ?? false
    
    // 检查管理器是否已经正确初始化
    const isManagerInitialized = knowledgeGraphManager && knowledgeGraphManager.isManagerInitialized()
    const needsInitialization = isEnabled && !isManagerInitialized
    
    if (oldEnabled === isEnabled && !needsInitialization) {
      // 状态未变化且管理器已初始化，跳过处理
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphEnabled",
        payload: isEnabled,
      })
      return
    }

    try {
      // 如果启用知识图谱，需要初始化管理器
      if (isEnabled) {
         this.logger?.info("启用知识图谱服务")
        try {
          // 设置提供者和日志
          knowledgeGraphManager.setProvider(this.clineProvider)
          knowledgeGraphManager.setLogger(this.logger)
          // 初始化知识图谱管理器
          await knowledgeGraphManager.initialize()
          
          // 更新 BuildStateTracer 中的启用状态
          await knowledgeGraphManager.enableKnowledgeGraph(true)
        } catch (initError) {
          this.logger.error(`[KnowledgeGraph] 初始化失败: ${initError instanceof Error ? initError.message : String(initError)}`)
          throw initError
        }
      } else {
        // 如果禁用知识图谱，停止服务
        this.logger?.info("停止知识图谱服务")
        try {
          // 更新 BuildStateTracer 中的启用状态
          await knowledgeGraphManager.enableKnowledgeGraph(false)
          await knowledgeGraphManager.dispose()
        } catch (stopError) {
          this.logger.warn(`[KnowledgeGraph] 停止服务警告: ${stopError instanceof Error ? stopError.message : String(stopError)}`)
        }
      }
      
      // 发送响应到 webview
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphEnabled",
        payload: isEnabled,
      })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "切换知识图谱状态失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 状态切换失败: ${errorMessage}`)
      
      // 发送错误响应
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphEnabled",
        payload: false, // 失败时设置为false
      })
      
      throw error
    }
  }


  /**
   * 处理轮询状态消息 - 简化版本，只返回状态信息，轮询控制由前端负责
   */
  private async handleGetStatusMessage(): Promise<void> {
    try {
      // 默认状态信息
      const defaultStatusInfo = {
        ...DEFAULT_STATUS_INFO,
        processTs: Math.floor(Date.now() / 1000)
      }

      // 获取实时构建状态
      const buildState = knowledgeGraphManager.getBuildStatus()
      
      if (buildState) {
        // 获取当前阶段信息
        const currentStage = this.mapStatusToStage(buildState.status, buildState.phase)
        
        // 构建符合前端期望的 KnowledgeGraphStatusInfo 格式
        const buildStatusInfo = {
          status: this.mapStatusToFrontendFormat(buildState.status),
          process: Math.max(0, Math.min(100, buildState.progress)), // 确保进度在0-100范围内
          totalFiles: Math.max(buildState.totalFiles, 0), // 确保不为负数
          totalSucceed: Math.max(buildState.processedFiles, 0), // 确保不为负数
          totalFailed: Math.max(buildState.failedFiles || 0, 0),
          failedReason: buildState.error || "",
          failedFiles: [],
          processTs: Math.floor(Date.now() / 1000),
          currentStage: currentStage,
          stageProgress: Math.max(0, Math.min(100, buildState.progress))
        }
        
        // 简化响应：只返回状态信息，不包含轮询控制
        this.clineProvider.postMessageToWebview({
          type: "knowledgeGraphStatusResponse",
          payload: {
            status: buildStatusInfo
          }
        })
        return
      }
      
      this.logger.warn(`[KnowledgeGraphMessageHandler] 未获取到知识图谱状态，使用默认状态`)
      
      // 简化响应：只返回默认状态信息
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: {
          status: defaultStatusInfo
        }
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取知识图谱状态失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 获取知识图谱状态失败: ${errorMessage}`)
      const errorStatusInfo = {
        ...DEFAULT_STATUS_INFO,
        failedReason: errorMessage,
        processTs: Math.floor(Date.now() / 1000)
      }
      
      // 简化响应：只返回错误状态信息
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: {
          status: errorStatusInfo
        }
      })
    }
  }

  /**
   * 处理开始构建消息
   */
  private async handleStartBuildMessage(message: any): Promise<void> {
    try {
      await knowledgeGraphManager.startBuild()
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
      
      // 构建清空后的状态信息
      const clearedStatusInfo = {
        ...DEFAULT_STATUS_INFO,
        processTs: Math.floor(Date.now() / 1000)
      }
      
      // 简化响应：只发送清空后的状态
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: {
          status: clearedStatusInfo
        }
      })
      
      this.logger.info("[KnowledgeGraphMessageHandler] 已清除")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "清除失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 清除失败: ${errorMessage}`)
      
      // 即使清除失败，也发送一个重置状态
      const errorStatusInfo = {
        ...DEFAULT_STATUS_INFO,
        status: "failed" as const,
        failedReason: errorMessage,
        processTs: Math.floor(Date.now() / 1000)
      }
      
      // 简化响应：只返回错误状态信息
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: {
          status: errorStatusInfo
        }
      })
      
      throw error
    }
  }



  /**
   * 将状态映射到前端格式
   */
  private mapStatusToFrontendFormat(status: string): "success" | "failed" | "running" | "pending" | "paused" {
    switch (status) {
      case "completed":
        return "success"
      case "error":
        return "failed"
      case "running":
        return "running"
      case "paused":
        return "paused"
      default:
        return "pending"
    }
  }

  /**
   * 获取当前阶段
   */
  private mapStatusToStage(status: string, phase?: string): "root_analysis" | "file_summary" | "directory_summary" | "dependency_graph" | "completed" {
    if (status === "completed") {
      return "completed"
    }
    
    if (phase) {
      return this.mapPhaseToStage(phase)
    }
    
    // 根据状态推断阶段
    switch (status) {
      case "running":
        return "file_summary"
      case "paused":
        return "file_summary"
      default:
        return "root_analysis"
    }
  }

  /**
   * 将构建阶段映射到前端阶段
   */
  private mapPhaseToStage(phase: string): "root_analysis" | "file_summary" | "directory_summary" | "dependency_graph" | "completed" {
    switch (phase) {
      case "root_analysis":
        return "root_analysis"
      case "file_analysis":
        return "file_summary"
      case "directory_analysis":
        return "directory_summary"
      case "completed":
        return "completed"
      default:
        return "root_analysis"
    }
  }

  /**
   * 发送错误响应
   */
  private sendErrorResponse(type: string, error: string): void {
    this.clineProvider.postMessageToWebview({
      type: "knowledgeGraphStatusResponse",
      payload: {
        success: false,
        error: error
      }
    })
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