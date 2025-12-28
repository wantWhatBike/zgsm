import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { MultipleChoiceData } from "@roo-code/types"
import type { ToolUse } from "../../shared/tools"
import * as fs from "fs/promises"
import * as path from "path"

export class ExitPlanModeTool extends BaseTool<"exit_plan_mode"> {
	readonly name = "exit_plan_mode" as const

	parseLegacy(_params: Partial<Record<string, string>>): Record<string, never> {
		return {}
	}

	async execute(_params: Record<string, never>, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks
		try {
			// planModeState must exist if we're exiting plan mode
			if (!task.planModeState?.active) {
				pushToolResult("Not currently in plan mode. Nothing to exit.")
				return
			}

			const planFilePath = task.planModeState.planFilePath

			const multipleChoiceData: MultipleChoiceData = {
				title: "Plan Approval",
				questions: [
					{
						id: "plan_approval",
						prompt: "计划已完成，是否批准开始实施？",
						allow_multiple: false,
						options: [
							{ id: "approve", label: "批准并开始实施" },
							{ id: "revise", label: "继续修改计划" },
						],
					},
				],
			}

			const { text, images } = await task.ask("multiple_choice", JSON.stringify(multipleChoiceData), false)
			let userResponse: Record<string, string[]> | { __skipped: boolean } = {}
			try {
				userResponse = JSON.parse(text || "{}")
			} catch {
				// ignore
			}

			const selected = (userResponse as Record<string, string[]>)["plan_approval"] || []
			const approved = selected.includes("approve")

			// reflect user feedback in chat
			await task.say("user_feedback", text ?? "", images)

			if (!approved) {
				pushToolResult(
					[
						"Plan mode remains active. The user wants you to continue refining the plan.",
						"",
						`Plan File: ${planFilePath}`,
						"",
						"Required workflow:",
						"1. Ask the user via ask_multiple_choice tool:",
						'   - "What aspects of the plan would you like me to revise?"',
						'   - Provide options like: "Implementation approach", "Level of detail", "Technical decisions", etc.',
						"2. Wait for user's feedback",
						"3. Read the current plan file",
						"4. Make the requested updates",
						"5. Call the exit_plan_mode tool when ready",
					].join("\n"),
				)
				return
			}

			// Read plan file content BEFORE exiting plan mode
			let planFileContent = ""
			let hasPlan = false

			try {
				const cwd = task.cwd
				const absolutePlanPath = path.join(cwd, planFilePath)
				planFileContent = await fs.readFile(absolutePlanPath, "utf8")
				hasPlan = planFileContent.trim().length > 0
			} catch (readError: any) {
				const errorMsg = readError instanceof Error ? readError.message : String(readError)

				// For any read errors, STAY in plan mode and ask user to fix
				if (readError.code === "ENOENT") {
					await task.say("error", `Plan file does not exist: ${planFilePath}`)
					pushToolResult(
						`CRITICAL: Cannot exit plan mode. The plan file does not exist at ${planFilePath}.

Plan mode remains active.

Required actions:
1. Use the write_to_file tool to create a plan file at ${planFilePath}
2. Document the implementation approach, steps, and key decisions
3. Use the exit_plan_mode tool again after creating the plan file

The user approved the plan expecting it to exist. You must create a documented plan before implementation.`,
					)
					return
				} else if (readError.code === "EACCES" || readError.code === "EPERM") {
					await task.say("error", `Permission denied reading plan file ${planFilePath}: ${errorMsg}`)
					pushToolResult(
						`CRITICAL: Cannot exit plan mode. Permission denied when reading plan file at ${planFilePath}.

Error: ${errorMsg}

Plan mode remains active. Please resolve the permission issue and try again.`,
					)
					return
				} else {
					// Other unexpected errors
					await task.say("error", `Error reading plan file ${planFilePath}: ${errorMsg}`)
					pushToolResult(
						`CRITICAL: Cannot exit plan mode. Error reading plan file at ${planFilePath}.

Error: ${errorMsg}

Plan mode remains active. Please resolve the issue and try again.`,
					)
					return
				}
			}

			// Handle empty plan file - STAY IN PLAN MODE
			if (!hasPlan) {
				await task.say("error", `Plan file is empty: ${planFilePath}`)

				pushToolResult(
					`CRITICAL: Cannot exit plan mode. The plan file is empty at ${planFilePath}.

You did not write to the plan file during plan mode. Plan mode remains active.

Required actions:
1. Use the write_to_file tool to create a proper plan file at ${planFilePath}
2. Document the implementation approach, steps, and key decisions
3. Use the exit_plan_mode tool again after creating the plan file

The user approved the plan expecting it to exist. You must create a documented plan before implementation.`,
				)
				return
			}

			// Success case: plan file exists and has content - NOW exit plan mode
			task.planModeState.active = false

			// Switch to code mode with error handling
			try {
				await task.providerRef.deref()?.handleModeSwitch("code")
			} catch (modeSwitchError) {
				// If mode switch fails, we've already marked plan mode as inactive
				// Log the error but continue - the plan was approved
				const errorMsg =
					modeSwitchError instanceof Error ? modeSwitchError.message : String(modeSwitchError)
				await task.say(
					"error",
					`Warning: Failed to switch to code mode automatically: ${errorMsg}. You may need to switch modes manually.`,
				)
			}

			pushToolResult(
				`User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${planFilePath}
You can refer back to it if needed during implementation.

## Approved Plan:
${planFileContent}
`,
			)
		} catch (error) {
			await handleError("exiting plan mode", error as Error)
		}
	}

	override async handlePartial(_task: Task, _block: ToolUse<"exit_plan_mode">): Promise<void> {
		// No partial handling needed.
	}
}

export const exitPlanModeTool = new ExitPlanModeTool()


