/**
 * Environment Context Builder
 *
 * 负责构建环境上下文信息，包括：
 * - system_info: 系统信息（OS, workspace, shell）
 * - rules: 自定义指令和规则
 * - environment_details: 环境详情（文件、git状态等）
 */

import { getSystemInfoSection } from "../../prompts/sections/system-info"
import { addCustomInstructions } from "../../prompts/sections/custom-instructions"
import type { SystemPromptSettings } from "../../prompts/types"
import { getEnvironmentDetails } from "../../environment/getEnvironmentDetails"
import type { Task } from "../../task/Task"


const EMPTY_STRING = ""

export interface EnvironmentContextOptions {
	globalCustomInstructions?: string
	language?: string
	rooIgnoreInstructions?: string
	shell?: string
	settings?: SystemPromptSettings
	includeFileDetails?: boolean
}

/**
 * 构建环境上下文消息
 *
 * 格式:
 * <system_info>...</system_info>
 * <rules>...</rules>
 * <environment_details>...</environment_details>
 */
export async function buildEnvironmentContext(
	task: Task,
	options: EnvironmentContextOptions,
): Promise<string> {
	const {
		language,
		rooIgnoreInstructions,
		shell,
		settings,
		includeFileDetails = false,
	} = options

	// 1. System Info Block
	const systemInfo = getSystemInfoSection(task.cwd, shell)

	// 2. Rules Block (custom instructions)
	const userRules = await addCustomInstructions(
		EMPTY_STRING,
		EMPTY_STRING,
		task.cwd,
		EMPTY_STRING,
		{
			language,
			rooIgnoreInstructions,
			shell,
			settings,
		},
	)

	// 3. Environment Details Block
	const environmentDetails = await getEnvironmentDetails(task, includeFileDetails)

	// Combine blocks with non-empty checks
	const blocks: string[] = []

	const trimmedSystemInfo = systemInfo.trim()
	if (trimmedSystemInfo) {
		blocks.push(`<system_info>
${trimmedSystemInfo}
</system_info>`)
	}

	const trimmedUserRules = userRules.trim()
	if (trimmedUserRules) {
		blocks.push(`<user_rules description="These are rules set by the user that you should follow if appropriate.">
${trimmedUserRules}
</user_rules>`)
	}

	const trimmedEnvironmentDetails = environmentDetails.trim()
	if (trimmedEnvironmentDetails) {
		blocks.push(trimmedEnvironmentDetails)
	}

	return blocks.join("\n\n")
}
