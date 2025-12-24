import { Command } from "./commands"
import { PROJECT_WIKI_TEMPLATE } from "../../core/costrict/wiki/wiki-prompts/project_wiki"
import { RULES_GENERATION_TEMPLATE } from "../../core/costrict/wiki/wiki-prompts/generate_rules"
import { SYSTEM_PROMPTS } from "@roo-code/types"

interface BuiltInCommandDefinition {
	name: string
	description: string
	argumentHint?: string
	content: string
}

const BUILT_IN_COMMANDS: Record<string, BuiltInCommandDefinition> = {
	init: {
		name: "init",
		description: "Analyze codebase and create concise AGENTS.md files for AI assistants",
		// Single source of truth: keep built-in /init aligned with the embedded Claude Code bundle.
		// Runtime /init is also overridden by RunSlashCommandTool via getCoStrictInitPrompt (language injection).
		content: SYSTEM_PROMPTS.init,
	},
	tdd: {
		name: "tdd",
		description: "Test driven development",
		content: `---
description: "测试驱动开发"
---

请严格遵守以下规则:

1. 提前使用 \`search_files\` 查看 .cospec/TEST_GUIDE.md 文件是否存在，若文件不存在，则使用 \`ask_followup_question\` 工具告知用户如何创建测试指导文档：“未找到测试指导文档，请通过触发首页的《测试方案》功能来生成。<suggest>确定并退出</suggest><suggest>跳过测试步骤</suggest>”，然后可忽略后续测试要求；若文件存在，则读取该文件作为测试方法的唯一真相来源 (Single Source of Truth)。
2. 确保所有测试用例 100% 执行通过
3. 如果测试用例没有全部通过，必须使用 \`ask_followup_question\` 工具询问我：“测试未完全通过（当前通过率：[请填入实际通过率]%），是否允许结束任务？”。只有我给出肯定答复，才可以使用 attempt_completion 工具
`,
	},
	"project-wiki": {
		name: "project-wiki",
		description: "Perform an in-depth analysis of the project and create a comprehensive project wiki.",
		content: PROJECT_WIKI_TEMPLATE("${workspaceFolder}/.cospec"),
	},
	dotest: {
		name: "dotest",
		description: "Run tests in the project.",
		content: `使用 \`new_task\` 工具，选择 \`Code\` 模式，创建子任务。输入的 message 内容模板为
\`\`\`markdown
%do-test%

{{当前任务对应 \${workspaceFolder}/.cospec/plan/changes/ 下的功能目录位置或用户需求描述}}
\`\`\`
`,
	},
	"openspec-init": {
		name: "openspec-init",
		description: "Openspec slash command init.",
		content: `<task>
# Strictly follow the following steps:

1.First, check if the \`openspec\` command is available in the system.

2.If \`openspec\` is not installed, prompt the user with a message asking if they want to install it. Provide the install command:
 \`npm install -g @fission-ai/openspec@latest\`

3.If \`openspec\` is already installed, run the following command to initialize or overwrite the current setup:
\`openspec init --tools costrict\`

4.After all above steps finish successfully, print the following usage guide:
\`\`\`
Next steps - Copy these prompts to CoStrict:
────────────────────────────────────────────────────────────
1. Populate your project context:
   "Please read openspec/project.md and help me fill it out
    with details about my project, tech stack, and conventions"

2. Create your first change proposal:
   "I want to add [YOUR FEATURE HERE]. Please create an
    OpenSpec change proposal for this feature"

3. Learn the OpenSpec workflow:
   "Please explain the OpenSpec workflow from openspec/AGENTS.md
    and how I should work with you on this project"
\`\`\`</task>`,
	},
	"vibeplus-propsal": {
		name: "vibeplus-propsal",
		description: "构建新的VibePlus变更。",
		argumentHint: "功能描述或请求",
		content: `---
description: "构建新的VibePlus变更。"
argument-hint: 功能描述或请求
---
<!-- VIBEPLUS:START -->
%command-vibeplus-propsal%
<!-- VIBEPLUS:END -->`,
	},
	"vibeplus-apply": {
		name: "vibeplus-apply",
		description: "实施已批准的VibePlus变更并保持任务同步。",
		argumentHint: "change-id",
		content: `---
description: "实施已批准的VibePlus变更并保持任务同步。"
argument-hint: change-id
---
<!-- VIBEPLUS:START -->
%command-vibeplus-apply%
<!-- VIBEPLUS:END -->`,
	},
	"vibeplus-archive": {
		name: "vibeplus-archive",
		description: "归档已部署的VibePlus变更并更新规格。",
		argumentHint: "change-id",
		content: `---
description: "归档已部署的VibePlus变更并更新规格。"
argument-hint: change-id
---
<!-- VIBEPLUS:START -->
%command-vibeplus-archive%
<!-- VIBEPLUS:END -->`,
	},
	"generate-rules": {
		name: "generate-rules",
		description: "Extract project-specific coding rules to improve code generation accuracy",
		content: RULES_GENERATION_TEMPLATE("${workspaceFolder}"),
	},
}

/**
 * Get all built-in commands as Command objects
 */
export async function getBuiltInCommands(): Promise<Command[]> {
	return Object.values(BUILT_IN_COMMANDS).map((cmd) => ({
		name: cmd.name,
		content: cmd.content,
		source: "built-in" as const,
		filePath: `<built-in:${cmd.name}>`,
		description: cmd.description,
		argumentHint: cmd.argumentHint,
	}))
}

/**
 * Get a specific built-in command by name
 */
export async function getBuiltInCommand(name: string): Promise<Command | undefined> {
	const cmd = BUILT_IN_COMMANDS[name]
	if (!cmd) return undefined

	return {
		name: cmd.name,
		content: cmd.content,
		source: "built-in" as const,
		filePath: `<built-in:${name}>`,
		description: cmd.description,
		argumentHint: cmd.argumentHint,
	}
}

/**
 * Get names of all built-in commands
 */
export async function getBuiltInCommandNames(): Promise<string[]> {
	return Object.keys(BUILT_IN_COMMANDS)
}
