/**
 * 知识图谱扩展集成
 * 负责将知识图谱功能集成到VSCode扩展中
 */
import * as vscode from "vscode"
import { initializeKnowledgeGraph, disposeKnowledgeGraph, getKnowledgeGraphHandler } from "./lifecycle"
import { knowledgeGraphManager } from "./KnowledgeGraphManager"
import type { ClineProvider } from "../webview/ClineProvider"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"

/**
 * 激活知识图谱功能
 */
export async function activateKnowledgeGraph(context: vscode.ExtensionContext, clineProvider: ClineProvider): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	logger.info("[KnowledgeGraphExtension] 激活知识图谱功能")

	try {
		// 初始化知识图谱
		await initializeKnowledgeGraph(context, clineProvider)
		
		// 注册WebUI消息处理器
		registerWebviewMessageHandler(clineProvider)
		
		logger.info("[KnowledgeGraphExtension] 知识图谱功能激活完成")
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "激活知识图谱功能失败"
		logger.error(`[KnowledgeGraphExtension] ${errorMessage}`)
		
		// 显示错误提示
		vscode.window.showErrorMessage(`知识图谱功能激活失败: ${errorMessage}`)
	}
}

/**
 * 停用知识图谱功能
 */
export async function deactivateKnowledgeGraph(): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	logger.info("[KnowledgeGraphExtension] 停用知识图谱功能")

	try {
		// 销毁知识图谱
		await disposeKnowledgeGraph()
		
		logger.info("[KnowledgeGraphExtension] 知识图谱功能停用完成")
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "停用知识图谱功能失败"
		logger.error(`[KnowledgeGraphExtension] ${errorMessage}`)
	}
}

/**
 * 注册WebUI消息处理器
 */
function registerWebviewMessageHandler(clineProvider: ClineProvider): void {
	// 这里我们不需要拦截消息，因为WebUI会通过现有的消息机制发送知识图谱消息
	// 我们只需要确保KnowledgeGraphWebviewHandler能够处理这些消息
	// 这个消息处理会在ClineProvider的webviewMessageHandler中完成
}

/**
 * 检查是否是知识图谱相关的消息
 */
function isKnowledgeGraphMessage(message: any): boolean {
	const knowledgeGraphMessageTypes = [
		"knowledgeGraphEnabled",
		"knowledgeGraphGetStatus",
		"knowledgeGraphBuild",
		"knowledgeGraphPause",
		"knowledgeGraphResume",
		"knowledgeGraphClear"
	]
	
	return knowledgeGraphMessageTypes.includes(message.type)
}

/**
 * 处理知识图谱消息
 */
async function handleKnowledgeGraphMessage(message: any, clineProvider: ClineProvider): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	
	try {
		logger.info(`[KnowledgeGraphExtension] 处理知识图谱消息: ${message.type}`)
		
		// 获取知识图谱处理器
		const { getKnowledgeGraphHandler } = await import("./lifecycle")
		const handler = getKnowledgeGraphHandler()
		
		if (!handler) {
			throw new Error("知识图谱处理器未初始化")
		}
		
		// 处理消息
		await handler.handleMessage(message)
		
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "处理知识图谱消息失败"
		logger.error(`[KnowledgeGraphExtension] ${errorMessage}`)
		
		// 发送错误响应
		clineProvider.postMessageToWebview({
			type: "knowledgeGraphStatusResponse",
			values: {
				knowledgeGraphResponse: {
					success: false,
					requestType: message.type,
					error: errorMessage
				}
			}
		})
	}
}

/**
 * 获取知识图谱状态
 */
export async function getKnowledgeGraphStatus(): Promise<{
	enabled: boolean
	isRunning: boolean
	isPaused: boolean
	progress: number
	totalFiles: number
	processedFiles: number
	currentFile: string
	status: string
	error?: string
}> {
	try {
		const status = knowledgeGraphManager.getBuildStatus()
		return {
			enabled: status.enabled,
			isRunning: status.isRunning,
			isPaused: status.isPaused,
			progress: status.progress,
			totalFiles: status.totalFiles,
			processedFiles: status.processedFiles,
			currentFile: status.currentFile,
			status: status.status,
			error: status.error
		}
	} catch (error) {
		return {
			enabled: false,
			isRunning: false,
			isPaused: false,
			progress: 0,
			totalFiles: 0,
			processedFiles: 0,
			currentFile: "",
			status: "error",
			error: error instanceof Error ? error.message : "获取状态失败"
		}
	}
}

/**
 * 检查知识图谱是否可用
 */
export function isKnowledgeGraphAvailable(): boolean {
	try {
		// 检查是否有工作空间
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return false
		}
		
		// 检查是否启用了知识图谱
		// 这个检查会在KnowledgeGraphManager内部完成
		return true
	} catch {
		return false
	}
}