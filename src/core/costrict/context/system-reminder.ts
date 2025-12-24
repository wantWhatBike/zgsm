/**
 * System Reminder Builder
 *
 * 负责构建系统提醒信息，包括：
 * - Plan Mode 约束（当激活时）
 * - Todo List 显示（可配置）
 *
 * 系统提醒会被包裹在 <system-reminder> 标签中注入到用户消息。
 */

import { formatReminderSection } from "../../environment/reminder"
import type { Task } from "../../task/Task"

export interface SystemReminderOptions {
	/** 是否启用 todo list 显示 */
	todoListEnabled?: boolean
}

/**
 * 构建系统提醒块
 *
 * 只包含关键提醒信息：
 * 1. Plan Mode 约束（当激活时）
 * 2. Todo List 显示（可配置）
 *
 * @returns 提醒文本（如果有），否则返回 undefined
 */
export async function buildSystemReminder(
	task: Task,
	options?: SystemReminderOptions,
): Promise<string | undefined> {
	const reminders: string[] = []

	// 1. Plan Mode Reminder
	if (task.planModeState?.active) {
		const planFilePath = task.planModeState.planFilePath
		reminders.push(`**PLAN MODE ACTIVE:**
- You MUST NOT edit any files except: ${planFilePath}
- You MUST NOT run any non-readonly commands`)
	}

	// 2. Todo List Reminder
	const todoListEnabled = options?.todoListEnabled ?? true
	if (todoListEnabled) {
		const todoReminder = formatReminderSection(task.todoList)
		if (todoReminder) {
			reminders.push(todoReminder)
		}
	}

	// Return undefined if no reminders
	if (reminders.length === 0) {
		return undefined
	}

	// Wrap each reminder in its own <system-reminder> tag
	return reminders
		.map((reminder) => `<system-reminder>\n${reminder}\n</system-reminder>`)
		.join("\n\n")
}
