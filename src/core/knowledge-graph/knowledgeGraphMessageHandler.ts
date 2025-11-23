/**
 * 知识图谱消息处理器
 * 处理所有知识图谱相关的消息，从主消息处理器中抽离出来
 */
import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"
import { knowledgeGraphManager } from "./KnowledgeGraphManager"
import { ILogger } from "../../utils/logger"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { DEFAULT_BUILD_STATE } from "./constants"
import { KNOWLEDGE_GRAPH_MESSAGES, API_PROVIDER, KNOWLEDGE_GRAPH_STATUS, GraphData } from "@roo-code/types"
import { getWorkspacePath } from "../../utils/path"
import { getNonce } from "../webview/getNonce"
import { getUri } from "../webview/getUri"

/**
 * 知识图谱消息处理器
 * 负责处理所有知识图谱相关的消息
 */
export class KnowledgeGraphMessageHandler {
  private logger: ILogger
  private clineProvider: ClineProvider
  private graphViewPanel: vscode.WebviewPanel | undefined

  constructor(clineProvider: ClineProvider) {
    this.clineProvider = clineProvider
    this.logger = createLogger(Package.outputChannel)
  }

  /**
   * 处理知识图谱消息
   */
  async handleMessage(message: any): Promise<void> {
    this.logger.info(`[KnowledgeGraphMessageHandler] 收到消息: ${message.type}`, JSON.stringify(message))
    try {
      // 检查 API 提供者是否为 zgsm - 使用常量
      const { apiConfiguration } = await this.clineProvider.getState()
      if (apiConfiguration?.apiProvider !== API_PROVIDER.ZGSM) {
        this.logger.warn("[KnowledgeGraphMessageHandler] 仅 CoStrict 提供商支持知识图谱功能")
        this.sendErrorResponse(message.type, "仅 CoStrict 提供商支持知识图谱功能")
        return
      }

      this.logger.info(`[KnowledgeGraphMessageHandler] 开始处理消息: ${message.type}`)
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

        case KNOWLEDGE_GRAPH_MESSAGES.OPEN_GRAPH_VIEW:
          await this.handleOpenGraphViewMessage()
          break

        case KNOWLEDGE_GRAPH_MESSAGES.GET_GRAPH_DATA:
          await this.handleGetGraphDataMessage()
          break

        case KNOWLEDGE_GRAPH_MESSAGES.OPEN_FILE:
          await this.handleOpenFileMessage(message)
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
  		
  		// 获取当前实际状态（可能回滚了）
  		const currentEnabled = await knowledgeGraphManager.isKnowledgeGraphEnabled()
 
  		// 发送错误响应，并附带错误信息和当前实际状态
  		this.clineProvider.postMessageToWebview({
  			type: KNOWLEDGE_GRAPH_MESSAGES.ENABLED,
  			payload: currentEnabled, // 返回实际状态
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
        status: KNOWLEDGE_GRAPH_STATUS.ERROR,
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
      // 操作成功后立即获取最新状态
      await this.handleGetStatusMessage()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "知识图谱构建失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 构建失败: ${errorMessage}`)
      // 不再抛出错误，而是发送错误状态给前端，保持通信闭环
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.BUILD, errorMessage)
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
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.PAUSE, errorMessage)
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
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.RESUME, errorMessage)
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
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.CLEAR, errorMessage)
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
      status: KNOWLEDGE_GRAPH_STATUS.ERROR,
      error: error,
    }
    
    this.sendStatusResponse(errorState)
  }

  /**
   * 处理打开图谱视图消息
   */
  private async handleOpenGraphViewMessage(): Promise<void> {
    this.logger.info("[KnowledgeGraphMessageHandler] 收到打开图谱视图请求")
    try {
      // 如果面板已存在，直接显示
      if (this.graphViewPanel) {
        this.logger.info("[KnowledgeGraphMessageHandler] 图谱视图面板已存在，直接显示")
        this.graphViewPanel.reveal()
        return
      }

      this.logger.info("[KnowledgeGraphMessageHandler] 创建新的图谱视图面板")
      // 创建新的 Webview Panel
      const panel = vscode.window.createWebviewPanel(
        'knowledgeGraphView',
        '知识图谱可视化',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.clineProvider.context.extensionUri],
        }
      )

      this.graphViewPanel = panel

      // 设置 Webview HTML 内容
      panel.webview.html = this.getWebviewContent(panel.webview)

      // 处理来自 Webview 的消息
      panel.webview.onDidReceiveMessage(
        async (message) => {
          this.logger.info(`[KnowledgeGraphMessageHandler] 图谱视图面板收到消息: ${message.type}`)
          switch (message.type) {
            case KNOWLEDGE_GRAPH_MESSAGES.GET_GRAPH_DATA:
              this.logger.info("[KnowledgeGraphMessageHandler] 处理图谱视图面板的数据请求")
              await this.handleGetGraphDataMessageForPanel(panel.webview)
              break
            case KNOWLEDGE_GRAPH_MESSAGES.OPEN_FILE:
              this.logger.info(`[KnowledgeGraphMessageHandler] 处理打开文件请求: ${message.filePath}`)
              await this.handleOpenFileMessage(message)
              break
          }
        },
        null,
        []
      )

      // 面板关闭时清理
      panel.onDidDispose(
        () => {
          this.graphViewPanel = undefined
        },
        null,
        []
      )

      this.logger.info("[KnowledgeGraphMessageHandler] 知识图谱可视化面板已打开")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "打开图谱视图失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 打开图谱视图失败: ${errorMessage}`)
      vscode.window.showErrorMessage(`打开知识图谱可视化失败: ${errorMessage}`)
    }
  }

  /**
   * 处理获取图谱数据消息（从设置页面）
   */
  private async handleGetGraphDataMessage(): Promise<void> {
    try {
      const workspacePath = getWorkspacePath()
      if (!workspacePath) {
        throw new Error("未找到工作区路径")
      }

      const graphRetriever = knowledgeGraphManager.getGraphRetriever()
      if (!graphRetriever) {
        throw new Error("图谱检索器未初始化")
      }

      const graphData = await graphRetriever.getGraphData(workspacePath)

      // 发送到主 webview
      this.clineProvider.postMessageToWebview({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        payload: graphData,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取图谱数据失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 获取图谱数据失败: ${errorMessage}`)
      this.clineProvider.postMessageToWebview({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        error: errorMessage,
      })
    }
  }

  /**
   * 处理获取图谱数据消息（从图谱视图面板）
   */
  private async handleGetGraphDataMessageForPanel(webview: vscode.Webview): Promise<void> {
    try {
      this.logger.info("[KnowledgeGraphMessageHandler] 开始获取图谱数据（图谱视图面板）")
      const workspacePath = getWorkspacePath()
      if (!workspacePath) {
        throw new Error("未找到工作区路径")
      }
      this.logger.info(`[KnowledgeGraphMessageHandler] 工作区路径: ${workspacePath}`)

      const graphRetriever = knowledgeGraphManager.getGraphRetriever()
      if (!graphRetriever) {
        throw new Error("图谱检索器未初始化")
      }

      this.logger.info("[KnowledgeGraphMessageHandler] 调用 GraphRetriever.getGraphData")
      const graphData = await graphRetriever.getGraphData(workspacePath)
      this.logger.info(`[KnowledgeGraphMessageHandler] 图谱数据获取成功: ${graphData.nodes.length} 个节点, ${graphData.links.length} 条边`)

      // 发送到图谱视图面板
      this.logger.info("[KnowledgeGraphMessageHandler] 发送图谱数据到视图面板")
      webview.postMessage({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        payload: graphData,
      })
      this.logger.info("[KnowledgeGraphMessageHandler] 图谱数据已发送到视图面板")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取图谱数据失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 获取图谱数据失败: ${errorMessage}`)
      webview.postMessage({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        error: errorMessage,
      })
    }
  }

  /**
   * 处理打开文件消息
   */
  private async handleOpenFileMessage(message: any): Promise<void> {
    try {
      const filePath = message.filePath
      if (!filePath) {
        throw new Error("文件路径不能为空")
      }

      const workspacePath = getWorkspacePath()
      if (!workspacePath) {
        throw new Error("未找到工作区路径")
      }

      const fullPath = vscode.Uri.file(filePath.startsWith(workspacePath) ? filePath : `${workspacePath}/${filePath}`)
      const document = await vscode.workspace.openTextDocument(fullPath)
      await vscode.window.showTextDocument(document)

      this.logger.info(`[KnowledgeGraphMessageHandler] 已打开文件: ${filePath}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "打开文件失败"
      this.logger.error(`[KnowledgeGraphMessageHandler] 打开文件失败: ${errorMessage}`)
      vscode.window.showErrorMessage(`打开文件失败: ${errorMessage}`)
    }
  }

  /**
   * 获取 Webview HTML 内容
   */
  private getWebviewContent(webview: vscode.Webview): string {
    this.logger.info("[KnowledgeGraphMessageHandler] 生成 Webview HTML 内容")
    
    // 获取资源 URI
    const stylesUri = getUri(webview, this.clineProvider.context.extensionUri, [
      'webview-ui',
      'build',
      'assets',
      'index.css',
    ])
    const scriptUri = getUri(webview, this.clineProvider.context.extensionUri, [
      'webview-ui',
      'build',
      'assets',
      'index.js',
    ])
    const codiconsUri = getUri(webview, this.clineProvider.context.extensionUri, ['assets', 'codicons', 'codicon.css'])

    // 生成 nonce 用于 CSP
    const nonce = getNonce()

    // 获取 OpenRouter base URL（如果需要）
    const openRouterBaseUrl = "https://openrouter.ai"
    const openRouterDomain = openRouterBaseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"

    this.logger.info(`[KnowledgeGraphMessageHandler] Script URI: ${scriptUri}`)
    this.logger.info(`[KnowledgeGraphMessageHandler] Styles URI: ${stylesUri}`)

    // 生成 HTML，包含完整的 CSP 和模块支持
    return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
    <meta name="theme-color" content="#000000">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com data:; media-src ${webview.cspSource}; script-src ${webview.cspSource} 'wasm-unsafe-eval' 'nonce-${nonce}' https://us-assets.i.posthog.com 'strict-dynamic'; connect-src ${webview.cspSource} ${openRouterDomain} https://avatars.githubusercontent.com https://openrouter.ai https://api.requesty.ai https://us.i.posthog.com https://us-assets.i.posthog.com;">
    <link rel="stylesheet" type="text/css" href="${stylesUri}">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>知识图谱可视化</title>
</head>
<body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script nonce="${nonce}">
        // 设置 URL 参数以标识这是知识图谱可视化视图
        // 注意：不要在这里调用 acquireVsCodeApi()，它会在 vscode.ts 中调用
        if (!window.location.search.includes('view=graph-visualizer')) {
            window.history.replaceState({}, '', window.location.pathname + '?view=graph-visualizer');
        }
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`
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