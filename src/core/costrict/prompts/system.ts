import type * as vscode from "vscode"

import type { SystemPromptSettings } from "../../prompts/types"
import { getEffectiveProtocol, isNativeProtocol, SYSTEM_PROMPTS } from "@roo-code/types"
import type { ModeConfig, PromptComponent } from "@roo-code/types"
import { DiffStrategy } from "../../../shared/tools"
import { getGroupName, getModeBySlug, getModeSelection, modes, type Mode } from "../../../shared/modes"
import { McpHub } from "../../../services/mcp/McpHub"
import { CodeIndexManager } from "../../../services/code-index/manager"
import { getToolDescriptionsForMode } from "../../prompts/tools"
import {
	getSharedToolUseSection,
	getMcpServersSection,
} from "../../prompts/sections"


export type CoStrictPromptContext = {
	vscodeContext: vscode.ExtensionContext
	mode: Mode
	cwd: string
	shell: string
	language: string
	settings?: SystemPromptSettings
	promptComponent?: PromptComponent
	globalCustomInstructions?: string
	rooIgnoreInstructions?: string
	supportsComputerUse?: boolean
	mcpHub?: McpHub
	diffStrategy?: DiffStrategy
	diffEnabled?: boolean
	browserViewportSize?: string
	customModeConfigs?: ModeConfig[]
	experiments?: Record<string, boolean>
	enableMcpServerCreation?: boolean
	partialReadsEnabled?: boolean
	parallelToolCallsEnabled?: boolean
	modelId?: string
}

export async function getCoStrictSystemPromptForMode(ctx: CoStrictPromptContext): Promise<string> {
	// ==================== 1. 获取 Mode 配置 ====================
	const { baseInstructions } = getModeSelection(ctx.mode, ctx.promptComponent, ctx.customModeConfigs)

	// ==================== 2. 协议和工具配置 ====================
	const effectiveProtocol = getEffectiveProtocol(ctx.settings?.toolProtocol)
	const effectiveDiffStrategy = ctx.diffEnabled ? ctx.diffStrategy : undefined
	const codeIndexManager = CodeIndexManager.getInstance(ctx.vscodeContext, ctx.cwd)

	// 判断是否需要 MCP
	const modeConfig = getModeBySlug(ctx.mode, ctx.customModeConfigs) || modes.find((m) => m.slug === ctx.mode) || modes[0]
	const hasMcpGroup = modeConfig.groups.some((groupEntry) => getGroupName(groupEntry) === "mcp")
	const hasMcpServers = ctx.mcpHub && ctx.mcpHub.getServers().length > 0
	const shouldIncludeMcp = hasMcpGroup && hasMcpServers

	// ==================== 3. 异步获取 MCP ====================
	const mcpServersSection = shouldIncludeMcp
		? await getMcpServersSection(ctx.mcpHub, effectiveDiffStrategy, ctx.enableMcpServerCreation, !isNativeProtocol(effectiveProtocol))
		: ""

	// ==================== 4. 工具目录 (仅 XML 协议) ====================
	const toolsCatalog = isNativeProtocol(effectiveProtocol)
		? ""
		: getToolDescriptionsForMode(
				ctx.mode,
				ctx.cwd,
				ctx.supportsComputerUse ?? false,
				codeIndexManager,
				effectiveDiffStrategy,
				ctx.browserViewportSize,
				shouldIncludeMcp ? ctx.mcpHub : undefined,
				ctx.customModeConfigs,
				ctx.experiments,
				ctx.partialReadsEnabled,
				ctx.settings,
				ctx.enableMcpServerCreation,
				ctx.modelId,
			)

	// ==================== 5. 组装：强制执行框架（流程优先） ====================

	// 获取当前模式对应的系统提示词，默认使用 code 模式
	const promptKey = (ctx.mode === 'ask' || ctx.mode === 'architect') ? ctx.mode : 'code'
	const selectedPrompt = SYSTEM_PROMPTS[promptKey as keyof typeof SYSTEM_PROMPTS]

	// Ask 和 Architect 模式保持原有结构
	// TypeScript needs explicit type narrowing here
	if (promptKey === 'code' || promptKey === 'ask' || promptKey === 'architect') {
		// selectedPrompt is guaranteed to have role and guidelines properties for these modes
		const rolePrompt = selectedPrompt as { role: string; guidelines: string }
		const primacySection = `${rolePrompt.role}`
		const recencySection = `
${baseInstructions || ""}

${rolePrompt.guidelines}`

		// 中间部分（工具参考）
		// 注意：即使是 native 协议（无工具描述），也要保留合理的换行分隔
		const toolsSection = toolsCatalog
			? `
<tools>
${getSharedToolUseSection(effectiveProtocol)}
${toolsCatalog}
</tools>`
			: ""

		const mcpSection = mcpServersSection
			? `
<mcp>
${mcpServersSection}
</mcp>`
			: ""

		// 组装最终提示词
		// 确保各部分之间有足够的换行，即使中间部分为空（native协议）
		const parts = [primacySection, toolsSection, mcpSection, recencySection].filter(Boolean)
		return parts.join("\n\n")
	}

	// Fallback for unknown modes (should not happen)
	throw new Error(`Unknown mode: ${promptKey}`)
}

export async function getCoStrictCompactPrompt(context: vscode.ExtensionContext): Promise<string> {
	void context // kept for signature stability
	return SYSTEM_PROMPTS.compact as string
}
