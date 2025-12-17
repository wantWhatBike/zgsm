import * as os from "os"
import * as path from "path"

export const PROJECT_WIKI_VERSION = "v3.0.0"

// Safely get home directory
export function getHomeDir(): string {
	const homeDir = os.homedir()
	if (!homeDir) {
		throw new Error("Unable to determine home directory")
	}
	return homeDir
}

// Get global commands directory path
export function getGlobalCommandsDir(): string {
	return path.join(getHomeDir(), ".roo", "commands")
}

export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack || error.message
	}
	return String(error)
}

// 输出文件路径常量
export const WIKI_OUTPUT_FILE_PATHS = {
	// 输出目录
	WIKI_OUTPUT_DIR: ".cospec/wiki/",
	STAGING_OUTPUT_DIR: ".cospec/wiki/.staging/",
	BUSINESS_KB_DIR: ".cospec/wiki/业务知识库/",
	TECH_KB_DIR: ".cospec/wiki/技术知识库/",
	TEST_KB_DIR: ".cospec/wiki/测试知识库/",

	// 通用规则目录（用于 generate-rules 命令）
	GENERAL_RULES_OUTPUT_DIR: ".roo/rules/",

	// 中间文件
	PRE_REPORT_MD: ".cospec/wiki/.staging/pre-report.md",
	KB_META_JSON: ".cospec/wiki/.kb-meta.json",

	// 最终文档（12类）
	REPOSITORY_OVERVIEW_MD: ".cospec/wiki/仓库概览.md",
	REPOSITORY_ARCHITECTURE_MD: ".cospec/wiki/仓库架构.md",
	REPOSITORY_DEPENDENCIES_MD: ".cospec/wiki/仓库依赖.md",
	EXTERNAL_INTEGRATION_MD: ".cospec/wiki/外部接入指南.md",

	CORE_BUSINESS_MD: ".cospec/wiki/业务知识库/核心业务领域.md",
	BUSINESS_FLOW_INDEX_MD: ".cospec/wiki/业务知识库/业务流程索引.md",
	BUSINESS_FLOW_DETAIL_MD: ".cospec/wiki/业务知识库/业务流程详解.md",

	API_INDEX_MD: ".cospec/wiki/技术知识库/API索引.md",
	CODE_GUIDE_MD: ".cospec/wiki/技术知识库/代码编写指南.md",
	DATA_STRUCTURE_MD: ".cospec/wiki/技术知识库/数据结构.md",
	TROUBLESHOOTING_MD: ".cospec/wiki/技术知识库/排障指南.md",

	UNIT_TEST_MD: ".cospec/wiki/测试知识库/单元测试.md",
} as const

// 文档生成配置（12类固定文档）
export interface DocumentConfig {
	order: number
	name: string
	outputPath: string
	condition: "all" | "is_library=false" | "has_api=true"
}

export const DOCUMENT_CONFIGS: readonly DocumentConfig[] = [
	{ order: 1, name: "仓库架构", outputPath: WIKI_OUTPUT_FILE_PATHS.REPOSITORY_ARCHITECTURE_MD, condition: "all" },
	{ order: 2, name: "仓库依赖", outputPath: WIKI_OUTPUT_FILE_PATHS.REPOSITORY_DEPENDENCIES_MD, condition: "all" },
	{ order: 3, name: "数据结构", outputPath: WIKI_OUTPUT_FILE_PATHS.DATA_STRUCTURE_MD, condition: "all" },
	{
		order: 4,
		name: "核心业务领域",
		outputPath: WIKI_OUTPUT_FILE_PATHS.CORE_BUSINESS_MD,
		condition: "is_library=false",
	},
	{ order: 5, name: "API索引", outputPath: WIKI_OUTPUT_FILE_PATHS.API_INDEX_MD, condition: "has_api=true" },
	{
		order: 6,
		name: "业务流程索引",
		outputPath: WIKI_OUTPUT_FILE_PATHS.BUSINESS_FLOW_INDEX_MD,
		condition: "is_library=false",
	},
	{
		order: 7,
		name: "业务流程详解",
		outputPath: WIKI_OUTPUT_FILE_PATHS.BUSINESS_FLOW_DETAIL_MD,
		condition: "is_library=false",
	},
	{ order: 8, name: "代码编写指南", outputPath: WIKI_OUTPUT_FILE_PATHS.CODE_GUIDE_MD, condition: "all" },
	{ order: 9, name: "单元测试", outputPath: WIKI_OUTPUT_FILE_PATHS.UNIT_TEST_MD, condition: "all" },
	{ order: 10, name: "外部接入指南", outputPath: WIKI_OUTPUT_FILE_PATHS.EXTERNAL_INTEGRATION_MD, condition: "all" },
	{ order: 11, name: "排障指南", outputPath: WIKI_OUTPUT_FILE_PATHS.TROUBLESHOOTING_MD, condition: "all" },
	{ order: 12, name: "仓库概览", outputPath: WIKI_OUTPUT_FILE_PATHS.REPOSITORY_OVERVIEW_MD, condition: "all" },
] as const

// 通用规则
export const COMMON_RULES = `1. 使用\`todo_list\` 规划任务，逐个执行。
2. 严格遵循每个步骤的**输出要求**，不要遗漏任何细节。
3. 使用\`attempt_completion\`工具返回关键信息，供父任务使用。
`

// Subtask directory and filenames for v3.0.0
export const SUBTASK_DIR = path.join(getGlobalCommandsDir(), "costrict-project-wiki-tasks", PROJECT_WIKI_VERSION)

export const SUBTASK_FILENAMES = {
	// Pre-analysis (00)
	PRE_ANALYSIS_AGENT: "00_pre-analysis-agent.md",

	// Document generation agents (01-12)
	REPOSITORY_ARCHITECTURE_AGENT: "01_repository-architecture-agent.md",
	REPOSITORY_DEPENDENCIES_AGENT: "02_repository-dependencies-agent.md",
	DATA_STRUCTURE_AGENT: "03_data-structure-agent.md",
	CORE_BUSINESS_AGENT: "04_core-business-agent.md",
	API_INDEX_AGENT: "05_api-index-agent.md",
	BUSINESS_FLOW_INDEX_AGENT: "06_business-flow-index-agent.md",
	BUSINESS_FLOW_DETAIL_AGENT: "07_business-flow-detail-agent.md",
	CODE_GUIDE_AGENT: "08_code-guide-agent.md",
	UNIT_TEST_AGENT: "09_unit-test-agent.md",
	EXTERNAL_INTEGRATION_AGENT: "10_external-integration-agent.md",
	TROUBLESHOOTING_AGENT: "11_troubleshooting-agent.md",
	REPOSITORY_OVERVIEW_AGENT: "12_repository-overview-agent.md",

	// Quality management agents (97-99)
	QUALITY_OPTIMIZATION_AGENT: "97_quality-optimization-agent.md",
	QUALITY_EVALUATION_AGENT: "98_quality-evaluation-agent.md",
	INCREMENTAL_UPDATE_AGENT: "99_incremental-update-agent.md",
} as const
