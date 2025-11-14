/**
 * 知识图谱消息处理器
 * 处理所有知识图谱相关的消息，从主消息处理器中抽离出来
 */
import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"
import { knowledgeGraphManager } from "./KnowledgeGraphManager"
import { KnowledgeGraphConfig, ExportFormat } from "./types"
import { ILogger } from "../../utils/logger"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { getWorkspacePath } from "../../utils/path"

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
    this.logger.info("[KnowledgeGraphMessageHandler] 初始化知识图谱消息处理器")
  }

  /**
   * 处理知识图谱消息
   */
  async handleMessage(message: any): Promise<void> {
    try {
      this.logger.info(`[KnowledgeGraphMessageHandler] 处理消息: ${message.type}`)

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
          // 尝试使用 KnowledgeGraphWebviewHandler 处理
          await this.fallbackToWebviewHandler(message)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "处理消息时发生未知错误"
      this.logger.error(`[KnowledgeGraphMessageHandler] 处理消息失败: ${error.type || 'unknown'}: ${errorMessage}`)
      this.sendErrorResponse(message.type || 'unknown', errorMessage)
    }
  }

  /**
   * 处理启用/禁用消息
   */
  private async handleEnabledMessage(message: any): Promise<void> {
    const isEnabled = message.bool ?? false
    const oldEnabled = this.clineProvider.contextProxy.getValue("knowledgeGraphEnabled") ?? false
    
    this.logger.info(`[KnowledgeGraphMessageHandler] 启用状态变化: ${oldEnabled} -> ${isEnabled}, message.bool: ${message.bool}`)
    
    // 检查管理器是否已经正确初始化
    const isManagerInitialized = knowledgeGraphManager && knowledgeGraphManager.isManagerInitialized()
    this.logger.info(`[KnowledgeGraphMessageHandler] 管理器初始化状态: ${isManagerInitialized}`)
    
    // 如果状态相同但管理器未初始化，仍需要执行初始化
    const needsInitialization = isEnabled && !isManagerInitialized
    
    if (oldEnabled === isEnabled && !needsInitialization) {
      this.logger.info(`[KnowledgeGraphMessageHandler] 状态未变化且管理器已初始化，跳过处理`)
      // 即使跳过处理，也要发送响应确保前端状态同步
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphEnabled",
        payload: isEnabled,
      })
      return
    }
    
    if (needsInitialization) {
      this.logger.info(`[KnowledgeGraphMessageHandler] 状态相同但管理器未初始化，执行初始化`)
    }

    try {
      this.logger.info(`[KnowledgeGraphMessageHandler] 开始处理状态变化，isEnabled: ${isEnabled}`)
      
      // 更新全局状态
      await this.clineProvider.contextProxy.setValue("knowledgeGraphEnabled", isEnabled)
      this.logger.info(`[KnowledgeGraphMessageHandler] 全局状态已更新`)
      
      // 如果启用知识图谱，需要初始化管理器
      if (isEnabled) {
        this.logger.info(`[KnowledgeGraphMessageHandler] 开始初始化知识图谱管理器`)
        try {
          // 设置提供者和日志
          knowledgeGraphManager.setProvider(this.clineProvider)
          knowledgeGraphManager.setLogger(this.logger)
          this.logger.info(`[KnowledgeGraphMessageHandler] 提供者和日志已设置`)
          
          // 初始化知识图谱管理器
          await knowledgeGraphManager.initialize()
          this.logger.info("[KnowledgeGraphMessageHandler] 知识图谱管理器初始化成功")
        } catch (initError) {
          this.logger.error(`[KnowledgeGraphMessageHandler] 知识图谱管理器初始化失败: ${initError instanceof Error ? initError.message : String(initError)}`)
          // 初始化失败时，回滚状态
          await this.clineProvider.contextProxy.setValue("knowledgeGraphEnabled", false)
          throw initError
        }
      } else {
        // 如果禁用知识图谱，停止服务
        this.logger.info(`[KnowledgeGraphMessageHandler] 开始停止知识图谱服务`)
        try {
          await knowledgeGraphManager.stopService()
          this.logger.info("[KnowledgeGraphMessageHandler] 知识图谱服务已停止")
        } catch (stopError) {
          this.logger.warn(`[KnowledgeGraphMessageHandler] 停止知识图谱服务时出现警告: ${stopError instanceof Error ? stopError.message : String(stopError)}`)
        }
      }
      
      // 发送响应到 webview - 确保发送正确的消息类型
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphEnabled",
        payload: isEnabled,
      })
      this.logger.info(`[KnowledgeGraphMessageHandler] 响应已发送到webview`)
      
      this.logger.info(`[KnowledgeGraphMessageHandler] 知识图谱已${isEnabled ? "启用" : "禁用"}, 状态: ${isEnabled}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "切换知识图谱状态失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 切换知识图谱状态失败: ${errorMessage}`)
      
      // 发送错误响应
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphEnabled",
        payload: false, // 失败时设置为false
      })
      
      throw error
    }
  }

  /**
   * 处理轮询状态消息 - 修复进度状态异常问题
   */
  private async handleGetStatusMessage(): Promise<void> {
    try {
      // 首先检查管理器是否正在构建
      const isBuilding = knowledgeGraphManager && knowledgeGraphManager.isCurrentlyBuilding()
      const isPaused = knowledgeGraphManager && knowledgeGraphManager.isCurrentlyPaused()
      
      if (isBuilding || isPaused) {
        // 如果正在构建或暂停，获取实时构建状态
        const status = knowledgeGraphManager.getBuildStatus()
        
        // 从构建状态中获取失败文件信息（如果有的话）
        const failedFiles: string[] = []
        
        // 如果存在错误信息，尝试从中提取失败文件
        if (status.error) {
          // 简单的错误解析，实际项目中可能需要更复杂的解析逻辑
          const errorLines = status.error.split('\n')
          for (const line of errorLines) {
            // 尝试匹配文件路径（简单的正则表达式）
            const fileMatch = line.match(/[\w\-\/\\]+\.(js|ts|jsx|tsx|py|java|cpp|c|h|md|json|yaml|yml)/gi)
            if (fileMatch) {
              failedFiles.push(...fileMatch)
            }
          }
        }
        
        // 获取当前阶段信息
        const buildProgress = knowledgeGraphManager.getBuildProgress()
        const currentStage = buildProgress ? this.mapPhaseToStage(buildProgress.phase) : this.getCurrentStage(status.status)
        
        // 构建符合前端期望的 KnowledgeGraphStatusInfo 格式
        const buildingStatusInfo = {
          status: this.mapStatusToFrontendFormat(status.status),
          process: Math.max(0, Math.min(100, status.progress)), // 确保进度在0-100范围内
          totalFiles: status.totalFiles,
          totalSucceed: status.processedFiles,
          totalFailed: failedFiles.length,
          failedReason: status.error || "",
          failedFiles: failedFiles,
          processTs: Math.floor(Date.now() / 1000),
          currentStage: currentStage,
          stageProgress: buildProgress ? buildProgress.percentage : status.progress
        }
        
        this.logger.info(`[KnowledgeGraphMessageHandler] 构建状态: ${buildingStatusInfo.status}, 进度: ${buildingStatusInfo.process}%, 阶段: ${buildingStatusInfo.currentStage}`)
        
        this.clineProvider.postMessageToWebview({
          type: "knowledgeGraphStatusResponse",
          payload: { status: buildingStatusInfo }
        })
        return
      }
      
      // 如果没有正在构建，检查存储状态
      const storageStatus = await knowledgeGraphManager.getKnowledgeGraphStatus()
      
      let totalFiles = 0
      let processedFiles = 0
      let lastUpdated = "-"
      let hasValidData = false
      
      if (storageStatus.exists && storageStatus.info) {
        // 修复：正确获取文件摘要数量而不是存储文件总数
        totalFiles = storageStatus.info.fileCount || 0
        processedFiles = totalFiles
        
        // 检查是否有有效的构建数据：需要有文件数量且有根信息
        hasValidData = totalFiles > 0 && storageStatus.rootInfo !== null
        
        if (storageStatus.info.lastUpdated) {
          const date = new Date(storageStatus.info.lastUpdated)
          lastUpdated = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        }
      }
      
      // 构建符合前端期望的 KnowledgeGraphStatusInfo 格式
      // 只有当存储存在且有有效数据时才认为是成功状态
      const storageStatusInfo = {
        status: (storageStatus.exists && hasValidData) ? "success" : "pending",
        process: (storageStatus.exists && hasValidData) ? 100 : 0,
        totalFiles: totalFiles,
        totalSucceed: processedFiles,
        totalFailed: 0,
        failedReason: "",
        failedFiles: [],
        processTs: Math.floor(Date.now() / 1000),
        currentStage: (storageStatus.exists && hasValidData) ? "completed" : "root_analysis",
        stageProgress: (storageStatus.exists && hasValidData) ? 100 : 0
      }
      
      this.logger.info(`[KnowledgeGraphMessageHandler] 存储状态: ${storageStatusInfo.status}, 进度: ${storageStatusInfo.process}%, 文件数: ${storageStatusInfo.totalFiles}`)
      
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: { status: storageStatusInfo }
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取知识图谱状态失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 获取知识图谱状态失败: ${errorMessage}`)
      
      // 发送默认状态
      const defaultStatusInfo = {
        status: "pending" as const,
        process: 0,
        totalFiles: 0,
        totalSucceed: 0,
        totalFailed: 0,
        failedReason: errorMessage,
        failedFiles: [],
        processTs: Math.floor(Date.now() / 1000),
        currentStage: "root_analysis" as const,
        stageProgress: 0
      }
      
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: { status: defaultStatusInfo }
      })
    }
  }

  /**
   * 处理开始构建消息
   */
  private async handleStartBuildMessage(message: any): Promise<void> {
    try {
      await knowledgeGraphManager.buildKnowledgeGraph({
        onProgress: (progress) => {
          this.logger.info(`[KnowledgeGraphMessageHandler] 知识图谱构建进度: ${progress.percentage}% - ${progress.message}`)
        }
      })
      
      this.logger.info("[KnowledgeGraphMessageHandler] 知识图谱构建已开始")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "开始知识图谱构建失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 开始知识图谱构建失败: ${errorMessage}`)
      throw error
    }
  }

  /**
   * 处理暂停构建消息
   */
  private async handlePauseBuildMessage(): Promise<void> {
    try {
      await knowledgeGraphManager.pauseBuild()
      this.logger.info("[KnowledgeGraphMessageHandler] 知识图谱构建已暂停")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "暂停知识图谱构建失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 暂停知识图谱构建失败: ${errorMessage}`)
      throw error
    }
  }

  /**
   * 处理继续构建消息
   */
  private async handleResumeBuildMessage(): Promise<void> {
    try {
      await knowledgeGraphManager.resumeBuild()
      this.logger.info("[KnowledgeGraphMessageHandler] 知识图谱构建已继续")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "继续知识图谱构建失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 继续知识图谱构建失败: ${errorMessage}`)
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
        status: "pending" as const,
        process: 0,
        totalFiles: 0,
        totalSucceed: 0,
        totalFailed: 0,
        failedReason: "",
        failedFiles: [],
        processTs: Math.floor(Date.now() / 1000),
        currentStage: "root_analysis" as const,
        stageProgress: 0
      }
      
      // 发送清空后的状态
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: { status: clearedStatusInfo }
      })
      
      this.logger.info("[KnowledgeGraphMessageHandler] 知识图谱已清除")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "清除知识图谱失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 清除知识图谱失败: ${errorMessage}`)
      
      // 即使清除失败，也发送一个重置状态
      const errorStatusInfo = {
        status: "failed" as const,
        process: 0,
        totalFiles: 0,
        totalSucceed: 0,
        totalFailed: 0,
        failedReason: errorMessage,
        failedFiles: [],
        processTs: Math.floor(Date.now() / 1000),
        currentStage: "root_analysis" as const,
        stageProgress: 0
      }
      
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: { status: errorStatusInfo }
      })
      
      throw error
    }
  }


  /**
   * 后备处理 - 直接处理消息
   */
  private async fallbackToWebviewHandler(message: any): Promise<void> {
    this.logger.warn(`[KnowledgeGraphMessageHandler] 使用后备处理消息: ${message.type}`)
    // 对于未知消息类型，直接记录警告但不抛出错误
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
      case "idle":
      default:
        return "pending"
    }
  }

  /**
   * 获取当前阶段
   */
  private getCurrentStage(status: string): "root_analysis" | "file_summary" | "directory_summary" | "dependency_graph" | "completed" {
    switch (status) {
      case "running":
        return "file_summary"
      case "completed":
        return "completed"
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
      case "dependency_analysis":
        return "dependency_graph"
      case "completed":
        return "completed"
      default:
        return "root_analysis"
    }
  }

  /**
   * 发送成功响应
   */
  private sendSuccessResponse(type: string, data: any): void {
    this.clineProvider.postMessageToWebview({
      type: "knowledgeGraphStatusResponse",
      payload: {
        status: data
      }
    })
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
 * 知识图谱消息处理器单例实例
 */
export let knowledgeGraphMessageHandler: KnowledgeGraphMessageHandler | null = null

/**
 * 初始化知识图谱消息处理器
 */
export function initializeKnowledgeGraphMessageHandler(clineProvider: ClineProvider): void {
  if (!knowledgeGraphMessageHandler) {
    knowledgeGraphMessageHandler = new KnowledgeGraphMessageHandler(clineProvider)
  }
}

/**
 * 获取知识图谱消息处理器
 */
export function getKnowledgeGraphMessageHandler(): KnowledgeGraphMessageHandler | null {
  return knowledgeGraphMessageHandler
}

/**
 * 销毁知识图谱消息处理器
 */
export function disposeKnowledgeGraphMessageHandler(): void {
  if (knowledgeGraphMessageHandler) {
    knowledgeGraphMessageHandler = null
  }
}