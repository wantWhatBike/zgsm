/**
 * Context Module
 *
 * 提供上下文构建和注入的统一接口。
 *
 * 模块结构：
 * - environment-context: 环境上下文构建
 * - system-reminder: 系统提醒构建
 * - context-injector: 上下文注入编排
 */

// Environment Context
export { buildEnvironmentContext } from "./environment-context"
export type { EnvironmentContextOptions } from "./environment-context"

// System Reminder
export { buildSystemReminder } from "./system-reminder"
export type { SystemReminderOptions } from "./system-reminder"

// Context Injector
export { injectContextIntoMessage, removeInjectedBlocks, removeHistoricalInjectedBlocks } from "./context-injector"

// Task Adapter (high-level API for Task instances)
export { injectContextForTask } from "./context-injector"

// Legacy compatibility (deprecated, will be removed)
import type { EnvironmentContextOptions } from "./environment-context"
import { injectContextIntoMessage } from "./context-injector"

/** @deprecated Use EnvironmentContextOptions instead */
export type BuildContextOptions = EnvironmentContextOptions

/** @deprecated Use injectContextIntoMessage instead */
export const buildAndInjectContext = injectContextIntoMessage
