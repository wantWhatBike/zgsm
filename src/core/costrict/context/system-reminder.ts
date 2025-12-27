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
	try {
		await fs.access(path)
		return true
	} catch {
		return false
	}
}

/**
 * 识别 Plan Mode 场景类型
 *
 * 判断逻辑:
 * 1. 如果是子任务 (parentTaskId 存在) → subagent
 * 2. 如果 plan 文件存在 且 不是刚进入 (>1秒) → re-entry
 * 3. 其他情况 → initial
 */
async function getPlanModeType(task: Task): Promise<PlanModeType> {
	// 1. 子任务检测
	if (task.parentTaskId) {
		return "subagent"
	}

	// 2. 重入检测: plan 文件存在 && 非刚进入 (>1秒)
	if (task.planModeState?.planFilePath) {
		const exists = await checkPlanFileExists(task.planModeState.planFilePath)
		const isRecent =
			task.planModeState.enteredAt && Date.now() - task.planModeState.enteredAt < 1000

		if (exists && !isRecent) {
			return "re-entry"
		}
	}

	// 3. 默认: 初始进入
	return "initial"
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
	const type = await getPlanModeType(task)
	const planPath = task.planModeState?.planFilePath || ""
	const planExists = await checkPlanFileExists(planPath)

	// ========== 共享变量: CoStrict 工具名称 ==========
	// 注意: 使用实际的工具名 (来自 packages/types/src/tool.ts),
	//       而非显示名 (TOOL_DISPLAY_NAMES)
	const toolNames = {
		edit: "apply_diff",
		write: "write_to_file",
		ask: "ask_multiple_choice",
		exit: "exit_plan_mode",
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
Answer the user's query comprehensively, using the ${toolNames.ask} tool if you need to ask the user clarifying questions. If you do use the ${toolNames.ask}, make sure to ask all clarifying questions you need to fully understand the user's intent before proceeding.`
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
4. Continue on with the plan process and most importantly you should always edit the plan file one way or the other before calling ${toolNames.exit}

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
- **Multiple agents**: Use up to ${planAgent.max} agents for complex tasks that benefit from different perspectives

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

2. **Launch up to ${exploreAgent.max} ${toolNames.newTask}(mode="${exploreAgent.mode}") agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - ${exploreAgent.max} agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigates testing patterns

3. After exploring the code, use the ${toolNames.ask} tool to clarify ambiguities in the user request up front.

### Phase 2: Design
Goal: Design an implementation approach.

Launch ${toolNames.newTask}(mode="${planAgent.mode}") agent(s) to design the implementation based on the user's intent and your exploration results from Phase 1.

You can launch up to ${planAgent.max} agent(s) in parallel.

**Guidelines:**
- **Default**: Launch at least 1 ${toolNames.newTask}(mode="${planAgent.mode}") agent for most tasks - it helps validate your understanding and consider alternatives
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
3. Use ${toolNames.ask} to clarify any remaining questions with the user

### Phase 4: Final Plan
Goal: Write your final plan to the plan file (the only file you can edit).
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified

### Phase 5: Call ${toolNames.exit}
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call ${toolNames.exit} to indicate to the user that you are done planning.
This is critical - your turn should only end with either asking the user a question or calling ${toolNames.exit}. Do not stop unless it's for these 2 reasons.

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

	// 1. Plan Mode Reminder (动态生成)
	if (task.planModeState?.active) {
		const planReminder = await buildPlanModeReminder(task)
		reminders.push(planReminder)
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
	return reminders.map((reminder) => `<system-reminder>\n${reminder}\n</system-reminder>`).join("\n\n")
}
