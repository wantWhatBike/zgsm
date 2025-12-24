import type { ToolName, ModeConfig } from "@roo-code/types"
import { shouldUseSingleFileRead } from "@roo-code/types"

import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS, DiffStrategy } from "../../../shared/tools"
import { Mode, getModeConfig, getGroupName } from "../../../shared/modes"

import { isToolAllowedForMode } from "../../tools/validateToolUse"

import { McpHub } from "../../../services/mcp/McpHub"
import { CodeIndexManager } from "../../../services/code-index/manager"

import { ToolArgs } from "./types"
import { getExecuteCommandDescription } from "./execute-command"
import { getReadFileDescription } from "./read-file"
import { getSimpleReadFileDescription } from "./simple-read-file"
import { getFetchInstructionsDescription } from "./fetch-instructions"
import { getWriteToFileDescription } from "./write-to-file"
import { getSearchFilesDescription } from "./search-files"
import { getListFilesDescription } from "./list-files"
import { getBrowserActionDescription } from "./browser-action"
import { getAskFollowupQuestionDescription } from "./ask-followup-question"
import { getAskMultipleChoiceDescription } from "./ask-multiple-choice"
import { getEnterPlanModeDescription } from "./enter-plan-mode"
import { getExitPlanModeDescription } from "./exit-plan-mode"
import { getAttemptCompletionDescription } from "./attempt-completion"
import { getUseMcpToolDescription } from "./use-mcp-tool"
import { getAccessMcpResourceDescription } from "./access-mcp-resource"
import { getSwitchModeDescription } from "./switch-mode"
import { getNewTaskDescription } from "./new-task"
import { getCodebaseSearchDescription } from "./codebase-search"
import { getUpdateTodoListDescription } from "./update-todo-list"
import { getRunSlashCommandDescription } from "./run-slash-command"
import { getGenerateImageDescription } from "./generate-image"

// Map of tool names to their description functions
const toolDescriptionMap: Record<string, (args: ToolArgs) => string | undefined> = {
	execute_command: (args) => getExecuteCommandDescription(args),
	read_file: (args) => {
		// Check if the current model should use the simplified read_file tool
		const modelId = args.settings?.modelId
		if (modelId && shouldUseSingleFileRead(modelId)) {
			return getSimpleReadFileDescription(args)
		}
		return getReadFileDescription(args)
	},
	fetch_instructions: (args) => getFetchInstructionsDescription(args.settings?.enableMcpServerCreation),
	write_to_file: (args) => getWriteToFileDescription(args),
	search_files: (args) => getSearchFilesDescription(args),
	list_files: (args) => getListFilesDescription(args),
	browser_action: (args) => getBrowserActionDescription(args),
	ask_followup_question: () => getAskFollowupQuestionDescription(),
	ask_multiple_choice: () => getAskMultipleChoiceDescription(),
	enter_plan_mode: () => getEnterPlanModeDescription(),
	exit_plan_mode: () => getExitPlanModeDescription(),
	attempt_completion: (args) => getAttemptCompletionDescription(args),
	use_mcp_tool: (args) => getUseMcpToolDescription(args),
	access_mcp_resource: (args) => getAccessMcpResourceDescription(args),
	codebase_search: (args) => getCodebaseSearchDescription(args),
	switch_mode: () => getSwitchModeDescription(),
	new_task: (args) => getNewTaskDescription(args),
	apply_diff: (args) =>
		args.diffStrategy ? args.diffStrategy.getToolDescription({ cwd: args.cwd, toolOptions: args.toolOptions }) : "",
	update_todo_list: (args) => getUpdateTodoListDescription(args),
	run_slash_command: () => getRunSlashCommandDescription(),
	generate_image: (args) => getGenerateImageDescription(args),
}

export function getToolDescriptionsForMode(
	mode: Mode,
	cwd: string,
	supportsComputerUse: boolean,
	codeIndexManager?: CodeIndexManager,
	diffStrategy?: DiffStrategy,
	browserViewportSize?: string,
	mcpHub?: McpHub,
	customModes?: ModeConfig[],
	experiments?: Record<string, boolean>,
	partialReadsEnabled?: boolean,
	settings?: Record<string, any>,
	enableMcpServerCreation?: boolean,
	modelId?: string,
): string {
	const config = getModeConfig(mode, customModes)
	const args: ToolArgs = {
		cwd,
		supportsComputerUse,
		diffStrategy,
		browserViewportSize,
		mcpHub,
		partialReadsEnabled,
		settings: {
			...settings,
			enableMcpServerCreation,
			modelId,
		},
		experiments,
	}

	const tools = new Set<string>()

	// Add tools from mode's groups
	config.groups.forEach((groupEntry) => {
		const groupName = getGroupName(groupEntry)
		const toolGroup = TOOL_GROUPS[groupName]
		if (toolGroup) {
			toolGroup.tools.forEach((tool) => {
				if (
					isToolAllowedForMode(
						tool as ToolName,
						mode,
						customModes ?? [],
						undefined,
						undefined,
						experiments ?? {},
					)
				) {
					tools.add(tool)
				}
			})
		}
	})

	// Add always available tools
	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool))

	// Conditionally exclude codebase_search if feature is disabled or not configured
	if (
		!codeIndexManager ||
		!(codeIndexManager.isFeatureEnabled && codeIndexManager.isFeatureConfigured && codeIndexManager.isInitialized)
	) {
		tools.delete("codebase_search")
	}

	// Conditionally exclude update_todo_list if disabled in settings
	if (settings?.todoListEnabled === false) {
		tools.delete("update_todo_list")
	}

	// Conditionally exclude generate_image if experiment is not enabled
	if (!experiments?.imageGeneration) {
		tools.delete("generate_image")
	}

	// Conditionally exclude run_slash_command if experiment is not enabled
	if (!experiments?.runSlashCommand) {
		tools.delete("run_slash_command")
	}

	// 🆕 按工具类型分组并添加视觉分隔
	const fileOperationTools = ['read_file', 'write_to_file', 'apply_diff', 'search_files', 'list_files']
	const executionTools = ['execute_command', 'new_task']
	const interactionTools = ['ask_followup_question', 'ask_multiple_choice', 'update_todo_list', 'attempt_completion']
	const planningTools = ['enter_plan_mode', 'exit_plan_mode', 'switch_mode']
	const mcpTools = ['use_mcp_tool', 'access_mcp_resource']
	const codeAnalysisTools = ['codebase_search']
	const browserTools = ['browser_action']
	const experimentalTools = ['run_slash_command', 'generate_image']

	// 按类别组织工具描述
	const sections: string[] = []

	// 文件操作工具组
	const fileOps = Array.from(tools).filter(t => fileOperationTools.includes(t))
	if (fileOps.length > 0) {
		sections.push(
			"====================================",
			"FILE OPERATION TOOLS",
			"====================================",
			...fileOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// 执行工具组
	const execOps = Array.from(tools).filter(t => executionTools.includes(t))
	if (execOps.length > 0) {
		sections.push(
			"",
			"====================================",
			"EXECUTION TOOLS",
			"====================================",
			...execOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// 交互工具组
	const interactOps = Array.from(tools).filter(t => interactionTools.includes(t))
	if (interactOps.length > 0) {
		sections.push(
			"",
			"====================================",
			"INTERACTION & TASK MANAGEMENT TOOLS",
			"====================================",
			...interactOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// 规划工具组
	const planOps = Array.from(tools).filter(t => planningTools.includes(t))
	if (planOps.length > 0) {
		sections.push(
			"",
			"====================================",
			"PLANNING & MODE SWITCHING TOOLS",
			"====================================",
			...planOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// MCP工具组
	const mcpOps = Array.from(tools).filter(t => mcpTools.includes(t))
	if (mcpOps.length > 0) {
		sections.push(
			"",
			"====================================",
			"MCP TOOLS",
			"====================================",
			...mcpOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// 代码分析工具组
	const codeOps = Array.from(tools).filter(t => codeAnalysisTools.includes(t))
	if (codeOps.length > 0) {
		sections.push(
			"",
			"====================================",
			"CODE ANALYSIS TOOLS",
			"====================================",
			...codeOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// 浏览器工具组
	const browserOps = Array.from(tools).filter(t => browserTools.includes(t))
	if (browserOps.length > 0) {
		sections.push(
			"",
			"====================================",
			"BROWSER TOOLS",
			"====================================",
			...browserOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// 实验性工具组
	const expOps = Array.from(tools).filter(t => experimentalTools.includes(t))
	if (expOps.length > 0) {
		sections.push(
			"",
			"====================================",
			"EXPERIMENTAL TOOLS",
			"====================================",
			...expOps.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	// 其他未分类工具
	const otherTools = Array.from(tools).filter(t =>
		!fileOperationTools.includes(t) &&
		!executionTools.includes(t) &&
		!interactionTools.includes(t) &&
		!planningTools.includes(t) &&
		!mcpTools.includes(t) &&
		!codeAnalysisTools.includes(t) &&
		!browserTools.includes(t) &&
		!experimentalTools.includes(t)
	)
	if (otherTools.length > 0) {
		sections.push(
			"",
			"====================================",
			"OTHER TOOLS",
			"====================================",
			...otherTools.map(toolName => toolDescriptionMap[toolName]?.({
				...args,
				toolOptions: undefined,
			})).filter(Boolean) as string[]
		)
	}

	return `# Tools\n\n${sections.filter(Boolean).join("\n")}`
}

// Export individual description functions for backward compatibility
export {
	getExecuteCommandDescription,
	getReadFileDescription,
	getSimpleReadFileDescription,
	getFetchInstructionsDescription,
	getWriteToFileDescription,
	getSearchFilesDescription,
	getListFilesDescription,
	getBrowserActionDescription,
	getAskFollowupQuestionDescription,
	getAskMultipleChoiceDescription,
	getAttemptCompletionDescription,
	getUseMcpToolDescription,
	getAccessMcpResourceDescription,
	getSwitchModeDescription,
	getCodebaseSearchDescription,
	getRunSlashCommandDescription,
	getGenerateImageDescription,
}

// Export native tool definitions (JSON schema format for OpenAI-compatible APIs)
export { nativeTools } from "./native-tools"
