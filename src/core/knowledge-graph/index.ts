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

// 项目探索器模式
export { ProjectExplorerMode } from "./modes/ProjectExplorerMode"