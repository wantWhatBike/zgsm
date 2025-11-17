/**
 * 知识图谱主入口文件
 * 提供统一的知识图谱功能接口和生命周期管理
 */

// 核心服务和管理器
export { activateKnowledgeGraph, deactivateKnowledgeGraph, KnowledgeGraphManager, knowledgeGraphManager } from "./KnowledgeGraphManager"
// 类型定义
export * from "./types"

// 常量配置
export * from "./constants"

// 分析器
export { RootAnalyzer } from "./builder/RootAnalyzer"
export { FileAnalyzer } from "./builder/FileAnalyzer"
export { DirectoryAnalyzer } from "./builder/DirectoryAnalyzer"

// 导出器
export { Exporter } from "./export/Exporter"

// 工具类
export { FileFilter } from "./tools/FileUtils"

// LLM客户端
export { LLMClient } from "./llm/LLMClient"

// 存储相关
export { FileStorage } from "./storage/FileStorage"

// 错误处理
export { KnowledgeGraphError } from "./types"

// 项目探索器模式
export { ProjectExplorerMode } from "./modes/ProjectExplorerMode"