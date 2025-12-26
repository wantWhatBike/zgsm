/**
 * Context Module
 *
 * 提供上下文构建和注入的统一接口。
 *
 * 模块结构：
 * - environment-context: 环境上下文构建
 * - system-reminder: 系统提醒构建
 * - context-injector: 上下文注入编排
 * - directory-layout: 目录结构生成
 */

// High-level API (recommended for most use cases)
export { injectContextForTask, removeHistoricalInjectedBlocks } from "./context-injector"

// Low-level builders (advanced usage)
export { buildEnvironmentContext } from "./environment-context"
export { buildSystemReminder } from "./system-reminder"

// Core injector (for custom orchestration)
export { injectContextIntoMessage, removeInjectedBlocks } from "./context-injector"

// Types
export type { EnvironmentContextOptions } from "./environment-context"
export type { SystemReminderOptions } from "./system-reminder"
