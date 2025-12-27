import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { PLAN_DIR_PATH, getPlanFilePath } from "../costrict/prompts/system"
import * as fs from "fs/promises"
import * as path from "path"

const ENTER_PLAN_MODE_RESULT = `
Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns by Using the new_task tool with mode="ask". (1-3 times)
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use ask_multiple_choice if you need to clarify the approach
5. Design a concrete implementation strategy
6. Save the complete plan file to the specified path.
7. When ready, use exit_plan_mode to present your plan for approval

Remember: DO NOT write or edit any files yet(except the plan file). This is a read-only exploration and planning phase.
`

export class EnterPlanModeTool extends BaseTool<"enter_plan_mode"> {
	readonly name = "enter_plan_mode" as const

	parseLegacy(_params: Partial<Record<string, string>>): Record<string, never> {
		return {}
	}

	async execute(_params: Record<string, never>, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks
		try {
			// Check if already in plan mode
			if (task.planModeState?.active) {
				pushToolResult(
					`Already in plan mode. The current plan file is at: ${task.planModeState.planFilePath}\n\nContinue working on your plan or use ExitPlanMode when ready.`,
				)
				return
			}

			// TODO: 让用户选择进行计划模式，或者直接执行

			const planFilePath = getPlanFilePath(task.taskId)

			// Ensure plan directory exists
			const cwd = task.cwd
			const absolutePlanDir = path.join(cwd, PLAN_DIR_PATH)
			await fs.mkdir(absolutePlanDir, { recursive: true })

			task.planModeState = {
				active: true,
				planFilePath,
				enteredAt: Date.now(),
			}

			pushToolResult(ENTER_PLAN_MODE_RESULT)
		} catch (error) {
			await handleError("entering plan mode", error as Error)
		}
	}

	override async handlePartial(_task: Task, _block: ToolUse<"enter_plan_mode">): Promise<void> {
		// No partial handling needed.
	}
}

export const enterPlanModeTool = new EnterPlanModeTool()


