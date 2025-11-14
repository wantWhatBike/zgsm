/**
 * 知识图谱生命周期集成
 * 负责在VSCode扩展激活时初始化知识图谱管理器
 */
import * as vscode from "vscode"
import { knowledgeGraphManager } from "./KnowledgeGraphManager"
// import { disposeKnowledgeGraphMessageHandler, getKnowledgeGraphMessageHandler, initializeKnowledgeGraphMessageHandler, KnowledgeGraphMessageHandler } from "./webview/knowledgeGraphMessageHandler"
import type { ClineProvider } from "../webview/ClineProvider"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { ExportFormat } from "./types"

let knowledgeGraphHandler: any | null = null

/**
 * 初始化知识图谱功能
 */
export async function initializeKnowledgeGraph(context: vscode.ExtensionContext, clineProvider: ClineProvider): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	logger.info("[KnowledgeGraphLifecycle] 开始初始化知识图谱功能")

	try {
		// 设置日志和提供者
		knowledgeGraphManager.setLogger(logger)
		knowledgeGraphManager.setProvider(clineProvider)

		// 创建WebUI处理器 - 暂时注释掉，等待后续实现
		// initializeKnowledgeGraphMessageHandler(clineProvider)
		// knowledgeGraphHandler = getKnowledgeGraphMessageHandler()

		// 初始化知识图谱管理器
		await knowledgeGraphManager.initialize()

		// 注册命令
		registerCommands(context)

		// 注册事件监听器
		registerEventListeners(context)

		logger.info("[KnowledgeGraphLifecycle] 知识图谱功能初始化完成")
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "初始化知识图谱功能失败"
		logger.error(`[KnowledgeGraphLifecycle] ${errorMessage}`)
		throw new Error(errorMessage)
	}
}

/**
 * 注册命令
 */
function registerCommands(context: vscode.ExtensionContext): void {
	// 构建知识图谱命令
	context.subscriptions.push(
		vscode.commands.registerCommand("costrict.knowledgeGraph.build", async () => {
			try {
				await knowledgeGraphManager.buildKnowledgeGraph()
				vscode.window.showInformationMessage("知识图谱构建已开始")
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "构建失败"
				vscode.window.showErrorMessage(`知识图谱构建失败: ${errorMessage}`)
			}
		})
	)

	// 暂停构建命令
	context.subscriptions.push(
		vscode.commands.registerCommand("costrict.knowledgeGraph.pause", async () => {
			try {
				await knowledgeGraphManager.pauseBuild()
				vscode.window.showInformationMessage("知识图谱构建已暂停")
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "暂停失败"
				vscode.window.showErrorMessage(`暂停构建失败: ${errorMessage}`)
			}
		})
	)

	// 继续构建命令
	context.subscriptions.push(
		vscode.commands.registerCommand("costrict.knowledgeGraph.resume", async () => {
			try {
				await knowledgeGraphManager.resumeBuild()
				vscode.window.showInformationMessage("知识图谱构建已继续")
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "继续失败"
				vscode.window.showErrorMessage(`继续构建失败: ${errorMessage}`)
			}
		})
	)

	// 清除知识图谱命令
	context.subscriptions.push(
		vscode.commands.registerCommand("costrict.knowledgeGraph.clear", async () => {
			try {
				await knowledgeGraphManager.clearKnowledgeGraph()
				vscode.window.showInformationMessage("知识图谱已清除")
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "清除失败"
				vscode.window.showErrorMessage(`清除知识图谱失败: ${errorMessage}`)
			}
		})
	)

	// 导出知识图谱命令
	context.subscriptions.push(
		vscode.commands.registerCommand("costrict.knowledgeGraph.export", async () => {
			try {
				const result = await vscode.window.showSaveDialog({
					defaultUri: vscode.Uri.file("knowledge-graph-export.json"),
					filters: {
						"JSON Files": ["json"],
						"JSONL Files": ["jsonl"],
						"Markdown Files": ["md"],
						"ZIP Files": ["zip"]
					}
				})

				if (result) {
					const format = getExportFormat(result.fsPath) as ExportFormat
					const exportResult = await knowledgeGraphManager.exportKnowledgeGraph(format, result.fsPath)
					vscode.window.showInformationMessage(`知识图谱导出成功: ${exportResult.outputPath}`)
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "导出失败"
				vscode.window.showErrorMessage(`导出知识图谱失败: ${errorMessage}`)
			}
		})
	)

	// 搜索知识图谱命令
	context.subscriptions.push(
		vscode.commands.registerCommand("costrict.knowledgeGraph.search", async () => {
			const query = await vscode.window.showInputBox({
				prompt: "输入搜索查询",
				placeHolder: "搜索知识图谱..."
			})

			if (query) {
				try {
					const results = await knowledgeGraphManager.searchKnowledgeGraph(query)
					if (results.length > 0) {
						// 显示搜索结果
						const items = results.map(result => ({
							label: result.name || result.path,
							description: result.description,
							detail: `类型: ${result.type}, 相关度: ${result.relevance}`
						}))

						const selected = await vscode.window.showQuickPick(items, {
							placeHolder: "选择要查看的结果"
						})

						if (selected) {
							// 打开对应的文件或显示详细信息
							const result = results.find(r => (r.name || r.path) === selected.label)
							if (result && result.path) {
								const uri = vscode.Uri.file(result.path)
								await vscode.window.showTextDocument(uri)
							}
						}
					} else {
						vscode.window.showInformationMessage("未找到匹配的结果")
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "搜索失败"
					vscode.window.showErrorMessage(`搜索知识图谱失败: ${errorMessage}`)
				}
			}
		})
	)
}

/**
 * 注册事件监听器
 */
function registerEventListeners(context: vscode.ExtensionContext): void {
	// 监听工作空间变化
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
			// 当工作空间变化时，重新初始化知识图谱
			if (event.added.length > 0 || event.removed.length > 0) {
				const logger = createLogger(Package.outputChannel)
				logger.info("[KnowledgeGraphLifecycle] 工作空间变化，重新初始化知识图谱")
				
				try {
					await knowledgeGraphManager.restartService()
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "重新初始化失败"
					logger.error(`[KnowledgeGraphLifecycle] ${errorMessage}`)
				}
			}
		})
	)

	// 监听配置变化
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (event) => {
			if (event.affectsConfiguration("costrict.knowledgeGraph")) {
				const logger = createLogger(Package.outputChannel)
				logger.info("[KnowledgeGraphLifecycle] 知识图谱配置发生变化")
				
				// 重新加载配置
				try {
					// 获取新的配置并更新
					const config = vscode.workspace.getConfiguration("costrict.knowledgeGraph")
					const newConfig = {
						enabled: config.get("enabled", true),
						model: config.get("model", "gpt-4"),
						maxConcurrency: config.get("maxConcurrency", 5),
						batchSize: config.get("batchSize", 10)
					}
					
					knowledgeGraphManager.updateConfig(newConfig)
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "配置更新失败"
					logger.error(`[KnowledgeGraphLifecycle] ${errorMessage}`)
				}
			}
		})
	)
}

/**
 * 获取导出格式
 */
function getExportFormat(filePath: string): string {
	const ext = filePath.toLowerCase().split('.').pop()
	switch (ext) {
		case 'json':
			return 'json'
		case 'jsonl':
			return 'jsonl'
		case 'md':
		case 'markdown':
			return 'markdown'
		case 'zip':
			return 'zip'
		default:
			return 'json'
	}
}

/**
 * 销毁知识图谱功能
 */
export async function disposeKnowledgeGraph(): Promise<void> {
	const logger = createLogger(Package.outputChannel)
	logger.info("[KnowledgeGraphLifecycle] 销毁知识图谱功能")

	try {
		// 销毁处理器 - 暂时注释掉，等待后续实现
		// disposeKnowledgeGraphMessageHandler()
		knowledgeGraphHandler = null

		// 销毁管理器
		await knowledgeGraphManager.dispose()
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "销毁知识图谱功能失败"
		logger.error(`[KnowledgeGraphLifecycle] ${errorMessage}`)
	}
}

/**
 * 获取知识图谱处理器
 */
export function getKnowledgeGraphHandler(): any | null {
	return knowledgeGraphHandler
}