/**
 * 知识图谱主入口文件
 * 提供统一的知识图谱功能接口和生命周期管理
 */
import * as vscode from "vscode"

// 核心服务和管理器
export { KnowledgeGraphManager, knowledgeGraphManager } from "./KnowledgeGraphManager"


// 生命周期管理
export {
	initializeKnowledgeGraph,
	disposeKnowledgeGraph
} from "./lifecycle"

// 扩展集成
export {
	activateKnowledgeGraph,
	deactivateKnowledgeGraph,
	getKnowledgeGraphStatus,
	isKnowledgeGraphAvailable
} from "./extension-integration"

// 类型定义
export * from "./types"

// 常量配置
export * from "./constants"

// 分析器
export { RootAnalyzer } from "./analyzers/RootAnalyzer"
export { FileAnalyzer } from "./analyzers/FileAnalyzer"
export { DirectoryAnalyzer } from "./analyzers/DirectoryAnalyzer"
export { DependencyAnalyzer } from "./analyzers/DependencyAnalyzer"

// 搜索引擎
export { SearchEngine } from "./search/SearchEngine"

// 导出器
export { Exporter } from "./export/Exporter"

// 工具类
export { ProgressTracker } from "./tools/ProgressTracker"
export { FileFilter } from "./tools/FileFilter"

// LLM客户端
export { LLMClient } from "./llm/LLMClient"

// 存储相关
export { FileStorage } from "./storage/FileStorage"

// 错误处理
export { KnowledgeGraphError } from "./types"

// 项目探索器模式
export { ProjectExplorerMode } from "./modes/ProjectExplorerMode"

/**
 * 初始化知识图谱功能（兼容现有架构）
 * @param context VSCode扩展上下文
 * @param clineProvider ClineProvider实例
 */
export async function initialize(
	context: vscode.ExtensionContext,
	clineProvider: any
): Promise<void> {
	const { activateKnowledgeGraph } = await import("./extension-integration")
	return await activateKnowledgeGraph(context, clineProvider)
}

/**
 * 销毁知识图谱功能
 */
export async function dispose(): Promise<void> {
	const { deactivateKnowledgeGraph } = await import("./extension-integration")
	return await deactivateKnowledgeGraph()
}