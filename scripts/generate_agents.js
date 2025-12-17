const fs = require("fs")
const path = require("path")

const WORKSPACE_ROOT = path.join(__dirname, "..")
const SUBTASKS_DIR = path.join(WORKSPACE_ROOT, "src/core/costrict/wiki/wiki-prompts/subtasks")
const PROMPTS_DIR = path.join(WORKSPACE_ROOT, "src/core/costrict/wiki/参考提示词/kb-commands/prompts")

// 文档映射: 编号:markdown文件名:常量名:agent名称:文档标题
const AGENTS = [
	["02", "02-仓库依赖.md", "REPOSITORY_DEPENDENCIES_MD", "REPOSITORY_DEPENDENCIES_AGENT", "仓库依赖文档"],
	["03", "06-数据结构.md", "DATA_STRUCTURE_MD", "DATA_STRUCTURE_AGENT", "数据结构文档"],
	["04", "03-核心业务领域.md", "CORE_BUSINESS_MD", "CORE_BUSINESS_AGENT", "核心业务领域文档"],
	["05", "04-API文档.md", "API_INDEX_MD", "API_INDEX_AGENT", "API索引文档"],
	["06", "10-业务流程索引.md", "BUSINESS_FLOW_INDEX_MD", "BUSINESS_FLOW_INDEX_AGENT", "业务流程索引文档"],
	["07", "09-业务流程详解.md", "BUSINESS_FLOW_DETAIL_MD", "BUSINESS_FLOW_DETAIL_AGENT", "业务流程详解文档"],
	["08", "05-代码编写指南.md", "CODE_GUIDE_MD", "CODE_GUIDE_AGENT", "代码编写指南文档"],
	["09", "07-单元测试.md", "UNIT_TEST_MD", "UNIT_TEST_AGENT", "单元测试文档"],
	["10", "11-外部接入指南.md", "EXTERNAL_INTEGRATION_MD", "EXTERNAL_INTEGRATION_AGENT", "外部接入指南文档"],
	["11", "12-排障指南.md", "TROUBLESHOOTING_MD", "TROUBLESHOOTING_AGENT", "排障指南文档"],
	["12", "01-仓库概览.md", "REPOSITORY_OVERVIEW_MD", "REPOSITORY_OVERVIEW_AGENT", "仓库概览文档"],
]

const QUALITY_AGENTS = [
	["97", "kb-optimize.md", "QUALITY_OPTIMIZATION_AGENT", "质量优化"],
	["98", "kb-eval.md", "QUALITY_EVALUATION_AGENT", "质量评估"],
	["99", "kb-update.md", "INCREMENTAL_UPDATE_AGENT", "增量更新"],
]

function escapeTemplateString(content) {
	// 在模板字符串中，需要转义反引号和 ${ }
	return content
		.replace(/\\/g, "\\\\") // 先转义反斜杠
		.replace(/`/g, "\\`") // 转义反引号
		.replace(/\$/g, "\\$") // 转义美元符号
}

function generateAgent(num, mdFile, agentName, docTitle, mdDir) {
	// agentName 已经包含 _AGENT 后缀，转换后去掉最后的 -agent
	const fileName = agentName.toLowerCase().replace(/_/g, "-")
	const outputFile = path.join(SUBTASKS_DIR, `${num}_${fileName}.ts`)
	const mdPath = path.join(mdDir, mdFile)

	if (!fs.existsSync(mdPath)) {
		console.error(`❌ 错误: markdown文件不存在: ${mdPath}`)
		return
	}

	console.log(`   生成: ${num}_${fileName}.ts`)

	// 读取markdown内容
	let mdContent = fs.readFileSync(mdPath, "utf-8")

	// 转义模板字符串中的特殊字符
	mdContent = escapeTemplateString(mdContent)

	// 生成TypeScript文件
	const tsContent = `// ${docTitle}生成 Agent
import { WIKI_OUTPUT_FILE_PATHS } from "../common/constants";

export const ${agentName}_TEMPLATE = (workspace: string) => \`
${mdContent}
\`;

export default ${agentName}_TEMPLATE;
`

	// 替换路径
	const finalContent = tsContent
		.replace(/doc\/kb\//g, "${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}")
		.replace(/\\`doc\/kb\//g, "\\\\`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}")

	fs.writeFileSync(outputFile, finalContent, "utf-8")
}

console.log("📝 批量生成 Wiki Prompts Agent 文件")
console.log("工作目录:", WORKSPACE_ROOT)
console.log("")

// 生成文档agents (02-12)
console.log("🔨 生成文档agents (02-12)...")
for (const [num, mdFile, constName, agentName, docTitle] of AGENTS) {
	generateAgent(num, mdFile, agentName, docTitle, PROMPTS_DIR)
}

// 生成质量管理agents (97-99)
console.log("")
console.log("🔨 生成质量管理agents (97-99)...")
const qaMdDir = path.join(WORKSPACE_ROOT, "src/core/costrict/wiki/参考提示词/kb-commands")
for (const [num, mdFile, agentName, docTitle] of QUALITY_AGENTS) {
	generateAgent(num, mdFile, agentName, docTitle, qaMdDir)
}

console.log("")
console.log("✅ 完成！生成了以下agent文件：")
const files = fs.readdirSync(SUBTASKS_DIR).filter((f) => f.endsWith(".ts"))
console.log(files.length)
console.log("")
console.log("📋 文件列表：")
files.forEach((f) => console.log(path.join(SUBTASKS_DIR, f)))
console.log("")
console.log("🎉 所有agent文件生成完成！")
