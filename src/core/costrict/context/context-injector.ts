/**
 * Context Injector
 *
 * 负责将环境上下文和系统提醒注入到用户消息中。
 *
 * 职责：
 * 1. 清理旧的注入块（防止重复注入）
 * 2. 构建新的上下文和提醒
 * 3. 根据变化检测决定是否注入
 * 4. 组装最终的消息内容
 */

import type { Task } from "../../task/Task"
import type { Anthropic } from "@anthropic-ai/sdk"
import { buildEnvironmentContext, type EnvironmentContextOptions } from "./environment-context"
import { buildSystemReminder, type SystemReminderOptions } from "./system-reminder"
import { getShell } from "../../../utils/shell"

/**
 * 检查文本块是否为注入块（单一或复合）
 *
 * 注入块特征：
 * - 以任一注入标签开头
 * - 以任一注入标签结尾
 * - 覆盖单一块和复合块的所有组合
 *
 * @param text - 文本内容
 * @returns 是否为注入块
 */
function isInjectedBlock(text: string): boolean {
	const trimmed = text.trim()

	// 所有可能的开始标签
	const startTags = ['<system_info>', '<user_rules description="These are rules set by the user that you should follow if appropriate.">', '<environment_details>', '<system-reminder>']

	// 所有可能的结束标签
	const endTags = ['</system_info>', '</user_rules>', '</environment_details>', '</system-reminder>']

	// 以任一标签开头 且 以任一标签结尾
	const startsWithAnyTag = startTags.some((tag) => trimmed.startsWith(tag))
	const endsWithAnyTag = endTags.some((tag) => trimmed.endsWith(tag))

	return startsWithAnyTag && endsWithAnyTag
}

/**
 * 移除已注入的上下文块
 *
 * 清理的标签：
 * - system_info: 系统信息
 * - rules: 自定义规则
 * - environment_details: 环境详情
 * - system-reminder: 系统提醒
 *
 * 支持清理单一块和复合块（包含1个或多个标签的组合）
 *
 * @param content - 用户消息内容块数组
 * @returns 清理后的内容块数组
 */
export function removeInjectedBlocks(
	content: Anthropic.Messages.ContentBlockParam[],
): Anthropic.Messages.ContentBlockParam[] {
	return content.filter((block) => {
		if (block.type === "text" && typeof block.text === "string") {
			return !isInjectedBlock(block.text)
		}
		return true
	})
}

/**
 * 清理历史消息中的注入块（保留最后一条用户消息）
 *
 * 用于在发送给 LLM 之前，移除历史用户消息中的重复注入块，
 * 只保留最后一条用户消息中的注入块（最新的环境上下文）。
 *
 * 设计原则：
 * - 单一数据源：只有最新一轮的环境上下文被发送给 LLM
 * - Token 优化：避免重复发送相同的 project_layout 等大型上下文
 * - 最小侵入：不修改持久化的 apiConversationHistory
 *
 * @param messages - API 消息数组
 * @returns 清理后的消息数组（除最后一条用户消息外，其他用户消息的注入块被移除）
 */
export function removeHistoricalInjectedBlocks(
	messages: Array<{ role: string; content: string | Anthropic.Messages.ContentBlockParam[] }>,
): Array<{ role: string; content: string | Anthropic.Messages.ContentBlockParam[] }> {
	// 找到最后一条用户消息的索引
	let lastUserMessageIndex = -1
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			lastUserMessageIndex = i
			break
		}
	}

	// 如果没有用户消息，直接返回
	if (lastUserMessageIndex === -1) {
		return messages
	}

	// 清理除最后一条用户消息外的所有用户消息中的注入块
	return messages.map((msg, index) => {
		// 只处理用户消息，且不是最后一条
		if (msg.role === "user" && index !== lastUserMessageIndex && Array.isArray(msg.content)) {
			return {
				...msg,
				content: removeInjectedBlocks(msg.content),
			}
		}
		return msg
	})
}

/**
 * 注入上下文到用户消息
 *
 * 注入流程：
 * 1. 清理旧的注入块（防止重复）
 * 2. 构建环境上下文（总是注入）
 * 3. 构建系统提醒（有则注入）
 * 4. 组装最终内容
 *
 * 设计原则：
 * - 单一数据源：Task 当前状态
 * - 总是清理旧的，总是注入新的
 * - LLM 只需要看到最新状态，历史状态会造成干扰
 *
 * @param task - Task 实例
 * @param userContent - 原始用户消息内容块数组
 * @param contextOptions - 环境上下文构建选项
 * @param reminderOptions - 系统提醒构建选项
 * @returns 注入后的内容块数组
 */
export async function injectContextIntoMessage(
	task: Task,
	userContent: Anthropic.Messages.ContentBlockParam[],
	contextOptions: EnvironmentContextOptions,
	reminderOptions?: SystemReminderOptions,
): Promise<Anthropic.Messages.ContentBlockParam[]> {
	// 1. Clean old injected blocks
	const cleanContent = removeInjectedBlocks(userContent)

	// 2. Build environment context (always inject)
	const environmentContext = await buildEnvironmentContext(task, contextOptions)

	// 3. Build system reminder (inject if exists)
	const reminderText = await buildSystemReminder(task, reminderOptions)

	// 4. Assemble final content
	const result: Anthropic.Messages.ContentBlockParam[] = [
		...cleanContent,
		{ type: "text" as const, text: environmentContext },
	]

	// Add reminder if it exists
	if (reminderText) {
		result.push({ type: "text" as const, text: reminderText })
	}

	return result
}


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
