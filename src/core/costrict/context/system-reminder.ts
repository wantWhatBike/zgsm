/**
 * System Reminder Builder
 *
 * 负责构建系统提醒信息，包括：
 * - Plan Mode 约束（当激活时）
 * - Todo List 显示（可配置）
 *
 * 系统提醒会被包裹在 <system-reminder> 标签中注入到用户消息。
 */

import * as fs from "fs/promises"
import { formatReminderSection } from "../../environment/reminder"
import type { Task } from "../../task/Task"

export interface SystemReminderOptions {
	/** 是否启用 todo list 显示 */
	todoListEnabled?: boolean
}

/**
 * Constants for plan mode functionality
 */

/**
 * Base directory for storing plan files
 */
export const PLAN_DIR_PATH = ".cospec/plans"

/**
 * Get the plan file path for a specific task
 */
export function getPlanFilePath(taskId: string): string {
	const shortId = taskId.substring(0, 8)
	return `${PLAN_DIR_PATH}/${shortId}.plan.md`
}

export type PlanModeState = {
	active: boolean
	planFilePath: string
	enteredAt: number
}

// ============================================================================
// Plan Mode State Persistence (从消息历史中恢复状态)
// ============================================================================

/**
 * 从消息历史中提取最新的 plan mode 状态
 *
 * Plan mode state 通过检测 API 消息中的 tool_use 块来恢复：
 * 1. EnterPlanMode 工具被调用时（tool_use.name === "enter_plan_mode"），状态推断为 active
 * 2. ExitPlanMode 工具被调用时（tool_use.name === "exit_plan_mode"），状态推断为 inactive
 * 3. planFilePath 从 taskId 派生，不需要持久化
 * 4. 任务恢复时，从最后一个 enter_plan_mode/exit_plan_mode 工具调用推断状态
 */
function getLatestPlanModeState(messages: any[]): PlanModeState | undefined {
	// 从后往前查找最新的 plan mode 工具调用
	// 查找 assistant 消息中的 tool_use 块
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]

		// 检查 API 消息格式（assistant messages with content blocks）
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			// 检查每个 content block 是否是 tool_use
			for (const block of msg.content) {
				if (block.type === "tool_use") {
					// 检查是否是 enter_plan_mode 工具
					if (block.name === "enter_plan_mode") {
						return {
							active: true,
							planFilePath: "", // 将在 restorePlanModeStateForTask 中重新生成
							enteredAt: msg.ts || Date.now(),
						}
					}

					// 检查是否是 exit_plan_mode 工具
					if (block.name === "exit_plan_mode") {
						return {
							active: false,
							planFilePath: "", // 将在 restorePlanModeStateForTask 中重新生成
							enteredAt: msg.ts || Date.now(),
						}
					}
				}
			}
		}
	}

	return undefined
}

/**
 * 恢复任务的 plan mode 状态（从消息历史）
 * 单一数据源：apiConversationHistory 是唯一真相来源
 *
 * 注意：
 * 1. planFilePath 从 taskId 派生，不需要从消息中恢复
 * 2. 如果 apiConversationHistory 为空，不执行恢复（任务初始化时可能尚未加载）
 */
export function restorePlanModeStateForTask(task: Task): void {
	// 防御性检查：如果 apiConversationHistory 为空，跳过恢复
	// 这可能发生在 overwriteClineMessages() 在 apiConversationHistory 加载之前被调用
	if (!task.apiConversationHistory || task.apiConversationHistory.length === 0) {
		return
	}

	const state = getLatestPlanModeState(task.apiConversationHistory)
	if (state) {
		// planFilePath 从 taskId 重新生成，确保路径一致性
		task.planModeState = {
			active: state.active,
			planFilePath: getPlanFilePath(task.taskId),
			enteredAt: state.enteredAt,
		}
	}
}

// ============================================================================
// Plan Mode Reminder 相关类型和辅助函数
// ============================================================================

/**
 * Plan Mode 场景类型
 * - initial: 首次进入 plan mode
 * - subagent: 子任务中的 plan mode
 * - re-entry: 重新进入 plan mode (plan 文件已存在)
 */
type PlanModeType = "initial" | "subagent" | "re-entry"

/**
 * 检查 plan 文件是否存在
 */
async function checkPlanFileExists(path: string): Promise<boolean> {
	// 边界检查: 空路径直接返回 false
	if (!path || path.trim() === "") {
		return false
	}

	try {
		await fs.access(path)
		return true
	} catch {
		return false
	}
}

/**
 * 场景识别结果
 */
interface PlanModeContext {
	type: PlanModeType
	planExists: boolean
}

/**
 * 识别 Plan Mode 场景类型并检测文件存在性
 *
 * 判断逻辑:
 * 1. 如果是子任务 (parentTaskId 存在) → subagent
 * 2. 如果 plan 文件存在 且 不是刚进入 → re-entry
 * 3. 其他情况 → initial
 *
 * @returns PlanModeContext - 包含场景类型和文件存在性
 */
async function getPlanModeType(task: Task): Promise<PlanModeContext> {
	const planPath = task.planModeState?.planFilePath || ""

	// 统一检查文件存在性（只调用一次）
	const planExists = await checkPlanFileExists(planPath)

	// 1. 子任务检测
	if (task.parentTaskId) {
		return { type: "subagent", planExists }
	}

	// 2. 重入检测: plan 文件存在 && 非刚进入
	if (planExists && task.planModeState?.enteredAt !== undefined) {
		const timeSinceEntry = Date.now() - task.planModeState.enteredAt
		// 边界安全: enteredAt 必须是有效时间戳且时间差 >= 1000ms
		if (timeSinceEntry >= 1000) {
			return { type: "re-entry", planExists }
		}
	}

	// 3. 默认: 初始进入
	return { type: "initial", planExists }
}

/**
 * 构建 Plan Mode Reminder
 *
 * 根据不同场景生成对应的提示词:
 * - initial: 完整的 5 阶段工作流
 * - subagent: 简化版,专注于回答查询
 * - re-entry: 重入指导,处理已存在的 plan 文件
 */
async function buildPlanModeReminder(task: Task): Promise<string> {
	const { type, planExists } = await getPlanModeType(task)
	const planPath = task.planModeState?.planFilePath || ""

	// ========== 共享变量: CoStrict 工具名称 ==========
	// 注意: 使用实际的工具名 (来自 packages/types/src/tool.ts),
	//       而非显示名 (TOOL_DISPLAY_NAMES)
	const toolNames = {
		edit: "apply_diff",
		write: "write_to_file",
		ask_user_questions: "ask_multiple_choice",
		exit_plan_mode: "exit_plan_mode",
		newTask: "new_task",
	}

	// Plan File Info (根据文件存在性动态生成)
	const planFileInfo = planExists
		? `A plan file already exists at ${planPath}. You can read it and make incremental edits using the ${toolNames.edit} tool${type === "subagent" ? " if you need to" : ""}.`
		: `No plan file exists yet. You should create your plan at ${planPath} using the ${toolNames.write} tool${type === "subagent" ? " if you need to" : ""}.`

	// ========== 根据场景类型生成对应的 Reminder ==========

	// 场景 1: 子任务 (最简单)
	if (type === "subagent") {
		return `Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received (for example, to make edits). Instead, you should:

## Plan File Info:
${planFileInfo}
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.
Answer the user's query comprehensively, using the ${toolNames.ask_user_questions} tool if you need to ask the user clarifying questions. If you do use the ${toolNames.ask_user_questions}, make sure to ask all clarifying questions you need to fully understand the user's intent before proceeding.`
	}

	// 场景 2: 重入 (中等复杂度)
	if (type === "re-entry") {
		return `## Re-entering Plan Mode

You are returning to plan mode after having previously exited it. A plan file exists at ${planPath} from your previous planning session.

**Before proceeding with any new planning, you should:**
1. Read the existing plan file to understand what was previously planned
2. Evaluate the user's current request against that plan
3. Decide how to proceed:
   - **Different task**: If the user's request is for a different task—even if it's similar or related—start fresh by overwriting the existing plan
   - **Same task, continuing**: If this is explicitly a continuation or refinement of the exact same task, modify the existing plan while cleaning up outdated or irrelevant sections
4. Continue on with the plan process and most importantly you should always edit the plan file one way or the other before calling ${toolNames.exit_plan_mode}

Treat this as a fresh planning session. Do not assume the existing plan is relevant without evaluating it first.`
	}

	// 场景 3: 初始进入 (最复杂,包含完整工作流)
	// CoStrict 使用 new_task 工具 + mode 参数来创建子代理
	const exploreAgent = {
		mode: "ask", // new_task 的 mode 参数
		max: 3, // 最大代理数量
	}
	const planAgent = {
		mode: "architect", // new_task 的 mode 参数
		max: 1, // 最大代理数量
	}

	// 多代理指南 (仅当 planAgent.max > 1 时显示)
	const multiAgentGuidelines =
		planAgent.max > 1
			? `
- **Multiple agents**: Use the ${toolNames.newTask} tool to launch agents up to ${planAgent.max} for complex tasks that benefit from different perspectives

Examples of when to use multiple agents:
- The task touches multiple parts of the codebase
- It's a large refactor or architectural change
- There are many edge cases to consider
- You'd benefit from exploring different approaches

Example perspectives by task type:
- New feature: simplicity vs performance vs maintainability
- Bug fix: root cause vs workaround vs prevention
- Refactoring: minimal change vs clean architecture
`
			: ""

	return `Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received.

## Plan File Info:
${planFileInfo}
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions. Critical: In this phase you should only use the ${toolNames.newTask} tool with mode="${exploreAgent.mode}".

1. Focus on understanding the user's request and the code associated with their request

2. **Use the ${toolNames.newTask}(mode="${exploreAgent.mode}") tool to launch agents up to ${exploreAgent.max}** to explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - ${exploreAgent.max} agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigates testing patterns

3. After exploring the code, use the ${toolNames.ask_user_questions} tool to clarify ambiguities in the user request up front.

### Phase 2: Design
Goal: Design an implementation approach.

Use the ${toolNames.newTask}(mode="${planAgent.mode}") tool to launch agent(s) to design the implementation based on the user's intent and your exploration results from Phase 1.

You can launch up to ${planAgent.max} agent(s).

**Guidelines:**
- **Default**: Use the ${toolNames.newTask}(mode="${planAgent.mode}") to Launch at least 1 agent for most tasks - it helps validate your understanding and consider alternatives
- **Skip agents**: Only for truly trivial tasks (typo fixes, single-line changes, simple renames)
${multiAgentGuidelines}
In the ${toolNames.newTask} message parameter:
- Provide comprehensive background context from Phase 1 exploration including filenames and code path traces
- Describe requirements and constraints
- Request a detailed implementation plan

### Phase 3: Review
Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.
1. Read the critical files identified by agents to deepen your understanding
2. Ensure that the plans align with the user's original request
3. Use the ${toolNames.ask_user_questions} tool to clarify any remaining questions with the user

### Phase 4: Final Plan
Goal: Write your final plan to the plan file (the only file you can edit).
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified

### Phase 5: Call the ${toolNames.exit_plan_mode} tool
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call ${toolNames.exit_plan_mode} to indicate to the user that you are done planning.
This is critical - your turn should only end with either asking the user a question or calling ${toolNames.exit_plan_mode}. Do not stop unless it's for these 2 reasons.

NOTE: At any point in time through this workflow you should feel free to ask the user questions or clarifications. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.`
}

// ============================================================================
// 主入口函数
// ============================================================================

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

	// 1. Todo List Reminder
	const todoListEnabled = options?.todoListEnabled ?? true
	if (todoListEnabled) {
		const todoReminder = formatReminderSection(task.todoList)
		if (todoReminder) {
			reminders.push(todoReminder)
		}
	}

	// 2. Plan Mode Reminder (动态生成)
	if (task.planModeState?.active) {
		const planReminder = await buildPlanModeReminder(task)
		reminders.push(planReminder)
	}

	// Return undefined if no reminders
	if (reminders.length === 0) {
		return undefined
	}

	// Wrap each reminder in its own <system-reminder> tag
	return reminders.map((reminder) => `<system-reminder>\n${reminder}\n</system-reminder>`).join("\n\n")
}
