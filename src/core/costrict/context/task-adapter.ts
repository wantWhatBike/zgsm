/**
 * Task Context Adapter
 *
 * 提供 Task 与上下文注入模块之间的适配层。
 * 将 Task 实例的状态提取和上下文注入逻辑封装在此模块，
 * 避免在 Task.ts 中添加大量上下文管理代码。
 *
 * 职责：
 * 1. 从 Task 实例提取所需的状态信息
 * 2. 构建上下文注入所需的参数
 * 3. 调用上下文注入器并更新 Task 状态
 * 4. 提供简洁的一站式 API
 */

import type { Task } from "../../task/Task"
import type { Anthropic } from "@anthropic-ai/sdk"
import { getShell } from "../../../utils/shell"
import { injectContextIntoMessage } from "./context-injector"
import type { EnvironmentContextOptions } from "./environment-context"

/**
 * 为 Task 注入上下文（一站式方法）
 *
 * 此方法封装了完整的上下文注入流程：
 * 1. 自动从 Task 提取所需状态
 * 2. 构建上下文和提醒选项
 * 3. 调用注入器
 *
 * 优势：
 * - Task.ts 零侵入：调用点只需一行代码
 * - 参数自动提取：无需手动构建复杂的选项对象
 *
 * @param task - Task 实例
 * @param content - 用户消息内容块数组
 * @param includeFileDetails - 是否包含文件详情
 * @returns 注入后的内容块数组
 *
 * @example
 * ```typescript
 * // Task.ts 中的使用（仅一行！）
 * lastUserMsg.content = await injectContextForTask(this, lastUserMsg.content, true)
 * ```
 */
export async function injectContextForTask(
	task: Task,
	content: Anthropic.Messages.ContentBlockParam[],
	includeFileDetails: boolean,
): Promise<Anthropic.Messages.ContentBlockParam[]> {
	// 1. 从 Task 提取状态
	const state = await task.providerRef.deref()?.getState()

	// 2. 构建上下文选项
	const contextOptions: EnvironmentContextOptions = {
		globalCustomInstructions: state?.customInstructions,
		language: state?.language,
		rooIgnoreInstructions: task.rooIgnoreController?.getInstructions(),
		shell: getShell(state?.terminalShellIntegrationDisabled),
		settings: {
			maxConcurrentFileReads: state?.maxConcurrentFileReads ?? 10,
			todoListEnabled: state?.apiConfiguration?.todoListEnabled ?? true,
			browserToolEnabled: state?.browserToolEnabled,
			useAgentRules: true,
			newTaskRequireTodos: false,
			terminalShellIntegrationDisabled: state?.terminalShellIntegrationDisabled,
		},
		includeFileDetails,
	}

	// 3. 构建提醒选项
	const reminderOptions = {
		todoListEnabled: state?.apiConfiguration?.todoListEnabled ?? true,
	}

	// 4. 调用注入器并返回结果
	return await injectContextIntoMessage(task, content, contextOptions, reminderOptions)
}
