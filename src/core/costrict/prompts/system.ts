import type * as vscode from "vscode"

import type { SystemPromptSettings } from "../../prompts/types"
import { getEffectiveProtocol, isNativeProtocol } from "@roo-code/types"
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
	const { SYSTEM_PROMPTS } = await import("@roo-code/types")

	// 获取当前模式对应的系统提示词，默认使用 code 模式
	const promptKey = (ctx.mode === 'ask' || ctx.mode === 'architect') ? ctx.mode : 'code'
	const selectedPrompt = SYSTEM_PROMPTS[promptKey]

	// Code 模式使用新的强制执行框架结构
	if (promptKey === 'code') {
		const codePrompt = selectedPrompt as typeof SYSTEM_PROMPTS.code
		// ===== 第一层：强制执行框架（流程优先，首因位置，100%利用） =====
		const layer1_enforcement = [
			codePrompt.identity_minimal, // 20 tokens - 超精简身份
			codePrompt.mandatory_workflow_checklist, // 400 tokens - 工作流优先
			codePrompt.iron_rules_brief, // 80 tokens - 三大铁律
			codePrompt.before_every_tool_use, // 150 tokens - 工具前检查
		].join("\n\n")

		// ===== 第二层：工具区透明化处理 =====
		const layer2_tool_meta = codePrompt.tool_usage_meta // Meta-instruction
		const layer2_tools_start = codePrompt.tool_catalog_start // 工具开始标记

		// ===== 第二层：工具区（仅 XML 模式，Native 模式此区域很短） =====
		const layer2_tools = isNativeProtocol(effectiveProtocol)
			? // Native 模式：极简说明
				[codePrompt.tool_section_intro_native].join("\n\n")
			: // XML 模式：完整工具目录
				[
					codePrompt.tool_section_intro_xml,
					getSharedToolUseSection(effectiveProtocol),
					toolsCatalog,
					codePrompt.tool_section_end,
				]
					.filter(Boolean)
					.join("\n\n")

		// MCP 区（如果有）
		const layer2_mcp = mcpServersSection
			? `

<mcp>
${mcpServersSection}
</mcp>`
			: ""

		// ===== 第2.5层：分隔标记（工具区后，注意力唤醒） =====
		const layer2_5_separator = codePrompt.core_rules_separator

		// ===== 第三层：详细规则+指南（保留所有原有内容） =====
		const layer3_detailed = [
			codePrompt.iron_rules_detailed, // 三大铁律（详细版）
			codePrompt.core_principles, // 核心原则
			codePrompt.workflow_detailed, // 详细工作流说明
			codePrompt.task_management, // 任务管理详细指南
			codePrompt.tool_usage_strategies, // 工具使用策略
			codePrompt.communication_guidelines, // 沟通风格和其他指南
			codePrompt.identity_context, // 🆕 详细身份上下文（从首因移到这里）
		].join("\n\n")

		// ===== 第四层：近因区执行检查清单（重复关键流程和规则） =====
		const layer4_checklist = codePrompt.final_execution_checklist

		// ===== 组装最终提示词（混合优化方案：流程优先 + 工具透明化） =====
		const parts = [
			layer1_enforcement, // 首因：流程+规则（650 tokens，100%利用）
			layer2_tool_meta, // 🆕 工具使用总纲
			layer2_tools_start, // 🆕 工具开始标记
			layer2_tools, // 工具区（XML详细/Native简短）
			layer2_mcp, // MCP区（如果有）
			layer2_5_separator, // 🆕 分隔标记（注意力唤醒）
			baseInstructions || "", // 自定义指令（如果有）
			layer3_detailed, // 详细规则和指南
			layer4_checklist, // 近因：执行检查清单
		].filter(Boolean)

		return parts.join("\n\n")
	}

	// Ask 和 Architect 模式保持原有结构
	// TypeScript needs explicit type narrowing here
	if (promptKey === 'ask' || promptKey === 'architect') {
		const rolePrompt = selectedPrompt as typeof SYSTEM_PROMPTS.ask | typeof SYSTEM_PROMPTS.architect
		const primacySection = `${rolePrompt.role}`
		const recencySection = `
${baseInstructions || ""}

${rolePrompt.guidelines}`

		// 中间部分（工具参考）
		// 注意：即使是 native 协议（无工具描述），也要保留合理的换行分隔
		const toolsSection = toolsCatalog
			? `

<tools>
Note:
- The following tools are your capability catalog. Consult as needed for parameter formats.
- You don't need to memorize all details - reference this section when executing.

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
	// 引用迁移后的位置
	const { SYSTEM_PROMPTS } = await import("@roo-code/types")
	return SYSTEM_PROMPTS.compact
}
