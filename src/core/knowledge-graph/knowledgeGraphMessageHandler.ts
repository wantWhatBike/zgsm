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
import { isKnowledgeGraphSupported } from "./utils"
import { ErrorHandler } from "./errors/ErrorHandler"

/**
 * 知识图谱消息处理器
 * 负责处理所有知识图谱相关的消息
 */
export class KnowledgeGraphMessageHandler {
  private logger: ILogger
  private clineProvider: ClineProvider
  private graphViewPanel: vscode.WebviewPanel | undefined
  private graphViewPanelDisposables: vscode.Disposable[] = []

  constructor(clineProvider: ClineProvider) {
    this.clineProvider = clineProvider
    this.logger = createLogger(Package.outputChannel)
  }

  /**
   * 处理知识图谱消息
   */
  async handleMessage(message: any): Promise<void> {
    try {
      // 检查 API 提供者是否支持知识图谱
      const isSupported = await isKnowledgeGraphSupported(this.clineProvider)
      if (!isSupported) {
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
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, `处理消息: ${message.type || 'unknown'}`)
      const errorMessage = ErrorHandler.formatError(wrappedError)
      this.logger.error(`[KnowledgeGraphMessageHandler] ${errorMessage}`)
      this.sendErrorResponse(message.type || 'unknown', wrappedError.message)
    }
  }

	/**
	 * 处理启用/禁用消息 - 简化版本，使用单一数据源
	 * 移除冗余的状态同步，只通过 postStateToWebview 统一同步
	 */
	private async handleEnabledMessage(message: any): Promise<void> {
  	const isEnabled = message.bool ?? false
  	
  	try {
  		// 设置提供者和日志（确保Manager有必要的依赖）
  		knowledgeGraphManager.setProvider(this.clineProvider)
  		knowledgeGraphManager.setLogger(this.logger)
  		
  		// 委托给Manager处理核心业务逻辑
  		await knowledgeGraphManager.setKnowledgeGraphEnabled(isEnabled)
  		
  		// 统一通过 postStateToWebview 同步状态到前端
  		// 这会触发前端的 ExtensionState 更新，包括 knowledgeGraphEnabled 字段
  		await this.clineProvider.postStateToWebview()
  		
  		this.logger.info(`[KnowledgeGraphMessageHandler] 知识图谱状态已切换: ${isEnabled}`)
  		
  	} catch (error) {
  		// 统一错误处理
  		const wrappedError = ErrorHandler.wrapError(error, "切换知识图谱状态")
  		this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
  		
  		// 同步实际状态到前端（可能已回滚）
  		await this.clineProvider.postStateToWebview()
  		
  		// 通知用户错误
  		throw wrappedError
  	}
  }


  /**
   * 处理轮询状态消息 - 简化版本，直接返回后端状态
   */
  private async handleGetStatusMessage(): Promise<void> {
    try {
      // 检查是否已初始化
      if (!knowledgeGraphManager.isManagerInitialized()) {
        // 未初始化，返回默认状态
        this.logger.debug(`[KnowledgeGraphMessageHandler] 知识图谱未初始化，返回默认状态`)
        this.sendStatusResponse(DEFAULT_BUILD_STATE)
        return
      }
      
      // 已初始化但未启用，返回禁用状态
      if (!knowledgeGraphManager.isServiceEnabled()) {
        this.logger.debug(`[KnowledgeGraphMessageHandler] 知识图谱已禁用，返回禁用状态`)
        this.sendStatusResponse({
          ...DEFAULT_BUILD_STATE,
          status: KNOWLEDGE_GRAPH_STATUS.PENDING,
          lastUpdateTime: new Date().toISOString(),
        })
        return
      }
      
      // 获取实时构建状态
      const buildState = knowledgeGraphManager.getBuildStatus()
      
      if (buildState) {
        this.sendStatusResponse(buildState)
        return
      }
      
      // 兜底：返回默认状态
      this.logger.debug(`[KnowledgeGraphMessageHandler] 无法获取状态，返回默认状态`)
      this.sendStatusResponse(DEFAULT_BUILD_STATE)

    } catch (error) {
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "获取知识图谱状态")
      this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
      
      const errorState = {
        ...DEFAULT_BUILD_STATE,
        status: KNOWLEDGE_GRAPH_STATUS.ERROR,
        error: wrappedError.message,
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
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "知识图谱构建")
      this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.BUILD, wrappedError.message)
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
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "暂停构建")
      this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.PAUSE, wrappedError.message)
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
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "继续构建")
      this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.RESUME, wrappedError.message)
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
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "清除知识图谱")
      this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
      this.sendErrorResponse(KNOWLEDGE_GRAPH_MESSAGES.CLEAR, wrappedError.message)
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
    try {
      // 如果面板已存在，直接显示
      if (this.graphViewPanel) {
        this.graphViewPanel.reveal()
        return
      }
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

      // 修复 #13: 处理来自 Webview 的消息 - 使用disposable管理
      const messageDisposable = panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.type) {
            case KNOWLEDGE_GRAPH_MESSAGES.GET_GRAPH_DATA:
              await this.handleGetGraphDataMessageForPanel(panel.webview)
              break
            case KNOWLEDGE_GRAPH_MESSAGES.OPEN_FILE:
              await this.handleOpenFileMessage(message)
              break
          }
        }
      )
      this.graphViewPanelDisposables.push(messageDisposable)

      // 修复 #13: 面板关闭时清理所有资源
      const disposeListener = panel.onDidDispose(() => {
        this.cleanupGraphViewPanel()
      })
      this.graphViewPanelDisposables.push(disposeListener)
    } catch (error) {
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "打开图谱视图")
      const errorMessage = ErrorHandler.formatError(wrappedError)
      this.logger.error(`[KnowledgeGraphMessageHandler] ${errorMessage}`)
      vscode.window.showErrorMessage(`打开知识图谱可视化失败: ${wrappedError.message}`)
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

      // ✅ 获取最大可视化文件数配置
      const maxVisualizationFiles = knowledgeGraphManager.getMaxVisualizationFiles()
      const graphData = await graphRetriever.getGraphData(workspacePath, maxVisualizationFiles)

      // 发送到主 webview
      this.clineProvider.postMessageToWebview({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        payload: graphData,
      })
    } catch (error) {
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "获取图谱数据")
      this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
      this.clineProvider.postMessageToWebview({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        error: wrappedError.message,
      })
    }
  }

  /**
   * 处理获取图谱数据消息（从图谱视图面板）
   */
  private async handleGetGraphDataMessageForPanel(webview: vscode.Webview): Promise<void> {
    try {
      const workspacePath = getWorkspacePath()
      if (!workspacePath) {
        throw new Error("未找到工作区路径")
      }

      const graphRetriever = knowledgeGraphManager.getGraphRetriever()
      if (!graphRetriever) {
        throw new Error("图谱检索器未初始化")
      }

      // ✅ 获取最大可视化文件数配置
      const maxVisualizationFiles = knowledgeGraphManager.getMaxVisualizationFiles()
      const graphData = await graphRetriever.getGraphData(workspacePath, maxVisualizationFiles)

      // 发送到图谱视图面板
      webview.postMessage({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        payload: graphData,
      })
    } catch (error) {
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "获取图谱数据（视图面板）")
      this.logger.error(`[KnowledgeGraphMessageHandler] ${ErrorHandler.formatError(wrappedError)}`)
      webview.postMessage({
        type: KNOWLEDGE_GRAPH_MESSAGES.GRAPH_DATA_RESPONSE,
        error: wrappedError.message,
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
    } catch (error) {
      // 修复 #7: 统一错误处理
      const wrappedError = ErrorHandler.wrapError(error, "打开文件")
      const errorMessage = ErrorHandler.formatError(wrappedError)
      this.logger.error(`[KnowledgeGraphMessageHandler] ${errorMessage}`)
      vscode.window.showErrorMessage(`打开文件失败: ${wrappedError.message}`)
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

    // 修复 #14: 生成 HTML，包含完整的 CSP 和模块支持
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

  /**
   * 清理图谱视图面板资源
   * 修复 #13: 确保所有资源被正确释放
   */
  private cleanupGraphViewPanel(): void {
    // 清理所有disposables
    this.graphViewPanelDisposables.forEach(d => d.dispose())
    this.graphViewPanelDisposables = []
    
    // 清理面板引用
    this.graphViewPanel = undefined
  }
}

/**
 * 知识图谱消息处理器单例管理
 * 修复：简化单例模式，确保类型安全
 */
class KnowledgeGraphMessageHandlerSingleton {
  private static instance: KnowledgeGraphMessageHandler | undefined

  /**
   * 获取或创建实例
   * @param clineProvider 如果实例不存在，需要提供 provider 来创建
   */
  public static getInstance(clineProvider?: ClineProvider): KnowledgeGraphMessageHandler {
    if (!this.instance) {
      if (!clineProvider) {
        throw new Error("KnowledgeGraphMessageHandler not initialized. Call with clineProvider first.")
      }
      this.instance = new KnowledgeGraphMessageHandler(clineProvider)
    }
    return this.instance
  }

  /**
   * 检查实例是否已初始化
   */
  public static isInitialized(): boolean {
    return this.instance !== undefined
  }

  /**
   * 销毁实例
   */
  public static dispose(): void {
    this.instance = undefined
  }
}

/**
 * 初始化或获取知识图谱消息处理器
 * 修复：统一的函数，避免null问题
 */
export function getKnowledgeGraphMessageHandler(clineProvider?: ClineProvider): KnowledgeGraphMessageHandler {
  return KnowledgeGraphMessageHandlerSingleton.getInstance(clineProvider)
}

/**
 * 检查处理器是否已初始化
 */
export function isKnowledgeGraphMessageHandlerInitialized(): boolean {
  return KnowledgeGraphMessageHandlerSingleton.isInitialized()
}

/**
 * 销毁知识图谱消息处理器
 */
export function disposeKnowledgeGraphMessageHandler(): void {
  KnowledgeGraphMessageHandlerSingleton.dispose()
}