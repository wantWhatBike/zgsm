import { promises as fs } from "fs"
import * as path from "path"
import { formatError, SUBTASK_FILENAMES, subtaskDir } from "./wiki-prompts/common/constants"
import { ILogger, createLogger } from "../../../utils/logger"

// Import v3.0.0 agent templates
import PRE_ANALYSIS_AGENT_TEMPLATE from "./wiki-prompts/subtasks/00_pre-analysis-agent"
import REPOSITORY_ARCHITECTURE_AGENT_TEMPLATE from "./wiki-prompts/subtasks/01_repository-architecture-agent"
import REPOSITORY_DEPENDENCIES_AGENT_TEMPLATE from "./wiki-prompts/subtasks/02_repository-dependencies-agent"
import DATA_STRUCTURE_AGENT_TEMPLATE from "./wiki-prompts/subtasks/03_data-structure-agent"
import CORE_BUSINESS_AGENT_TEMPLATE from "./wiki-prompts/subtasks/04_core-business-agent"
import API_INDEX_AGENT_TEMPLATE from "./wiki-prompts/subtasks/05_api-index-agent"
import BUSINESS_FLOW_INDEX_AGENT_TEMPLATE from "./wiki-prompts/subtasks/06_business-flow-index-agent"
import BUSINESS_FLOW_DETAIL_AGENT_TEMPLATE from "./wiki-prompts/subtasks/07_business-flow-detail-agent"
import CODE_GUIDE_AGENT_TEMPLATE from "./wiki-prompts/subtasks/08_code-guide-agent"
import UNIT_TEST_AGENT_TEMPLATE from "./wiki-prompts/subtasks/09_unit-test-agent"
import EXTERNAL_INTEGRATION_AGENT_TEMPLATE from "./wiki-prompts/subtasks/10_external-integration-agent"
import TROUBLESHOOTING_AGENT_TEMPLATE from "./wiki-prompts/subtasks/11_troubleshooting-agent"
import REPOSITORY_OVERVIEW_AGENT_TEMPLATE from "./wiki-prompts/subtasks/12_repository-overview-agent"
import QUALITY_OPTIMIZATION_AGENT_TEMPLATE from "./wiki-prompts/subtasks/97_quality-optimization-agent"
import QUALITY_EVALUATION_AGENT_TEMPLATE from "./wiki-prompts/subtasks/98_quality-evaluation-agent"
import INCREMENTAL_UPDATE_AGENT_TEMPLATE from "./wiki-prompts/subtasks/99_incremental-update-agent"

export const projectWikiCommandName = "project-wiki"
export const projectWikiCommandDescription = `执行项目深度分析并创建全面的项目技术文档（v3.0.0）`

// Template data mapping for subtasks (v3.0.0 - 16 agents)
const SUBTASK_TEMPLATES = {
	[SUBTASK_FILENAMES.PRE_ANALYSIS_AGENT]: PRE_ANALYSIS_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.REPOSITORY_ARCHITECTURE_AGENT]: REPOSITORY_ARCHITECTURE_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.REPOSITORY_DEPENDENCIES_AGENT]: REPOSITORY_DEPENDENCIES_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.DATA_STRUCTURE_AGENT]: DATA_STRUCTURE_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.CORE_BUSINESS_AGENT]: CORE_BUSINESS_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.API_INDEX_AGENT]: API_INDEX_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.BUSINESS_FLOW_INDEX_AGENT]: BUSINESS_FLOW_INDEX_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.BUSINESS_FLOW_DETAIL_AGENT]: BUSINESS_FLOW_DETAIL_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.CODE_GUIDE_AGENT]: CODE_GUIDE_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.UNIT_TEST_AGENT]: UNIT_TEST_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.EXTERNAL_INTEGRATION_AGENT]: EXTERNAL_INTEGRATION_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.TROUBLESHOOTING_AGENT]: TROUBLESHOOTING_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.REPOSITORY_OVERVIEW_AGENT]: REPOSITORY_OVERVIEW_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.QUALITY_OPTIMIZATION_AGENT]: QUALITY_OPTIMIZATION_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.QUALITY_EVALUATION_AGENT]: QUALITY_EVALUATION_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.INCREMENTAL_UPDATE_AGENT]: INCREMENTAL_UPDATE_AGENT_TEMPLATE,
}

// 创建 logger 实例，但允许在测试时被替换
let logger: ILogger = createLogger()

// 导出 logger setter 以便测试时可以替换
export function setLogger(testLogger: ILogger): void {
	logger = testLogger
}

export async function ensureProjectWikiSubtasksExists() {
	const startTime = Date.now()
	logger.info("[projectWikiHelpers] Starting ensureProjectWikiSubtasksExists...")

	try {
		// Ensure subtask directory exists
		await fs.mkdir(subtaskDir, { recursive: true })

		// Check if subtask setup is needed
		const needsSetup = await checkIfSubtaskSetupNeeded(subtaskDir)
		if (!needsSetup) {
			logger.info("[projectWikiHelpers] project-wiki subtasks already exist")
			return
		}

		logger.info("[projectWikiHelpers] Setting up project-wiki subtasks...")

		// Clean up existing subtask directory
		await fs.rm(subtaskDir, { recursive: true, force: true })

		// Generate subtask files
		await generateSubtaskFiles(subtaskDir)

		const duration = Date.now() - startTime
		logger.info(`[projectWikiHelpers] project-wiki subtasks setup completed in ${duration}ms`)
	} catch (error) {
		const errorMsg = formatError(error)
		console.error("[commands] Failed to initialize project-wiki subtasks:", errorMsg)
	}
}

// Check if subtask directory is valid
async function checkSubtaskDirectory(subTaskDir: string): Promise<boolean> {
	try {
		const subDirResult = await fs.stat(subTaskDir)

		if (!subDirResult.isDirectory()) {
			logger.info("[projectWikiHelpers] subTaskDir exists but is not a directory")
			return false
		}

		// Check if subtask directory has .md files
		const subTaskFiles = await fs.readdir(subTaskDir)
		const mdFiles = subTaskFiles.filter((file) => file.endsWith(".md"))

		// subtask file check.
		const subTaskFileNames = Object.keys(SUBTASK_TEMPLATES)
		const missingSubTaskFiles = subTaskFileNames.filter((fileName) => !mdFiles.includes(fileName))

		if (missingSubTaskFiles.length > 0) {
			logger.info(`[projectWikiHelpers] Missing subtask files: ${missingSubTaskFiles.join(", ")}`)
			return false
		}

		return mdFiles.length > 0
	} catch (error) {
		logger.info("[projectWikiHelpers] subTaskDir not accessible:", formatError(error))
		return false
	}
}

// Check if subtask setup is needed
async function checkIfSubtaskSetupNeeded(subTaskDir: string): Promise<boolean> {
	try {
		const isSubtaskDirValid = await checkSubtaskDirectory(subTaskDir)
		return !isSubtaskDirValid
	} catch (error) {
		logger.info("[projectWikiHelpers] subTaskDir not accessible:", formatError(error))
		return true
	}
}

// Generate subtask files
async function generateSubtaskFiles(subTaskDir: string): Promise<void> {
	try {
		// Create subtask directory
		await fs.mkdir(subTaskDir, { recursive: true })

		// Generate subtask files
		const subTaskFiles = Object.keys(SUBTASK_TEMPLATES)
		const generateResults = await Promise.allSettled(
			subTaskFiles.map(async (file) => {
				const template = SUBTASK_TEMPLATES[file as keyof typeof SUBTASK_TEMPLATES]("${workspaceFolder}/")
				if (!template) {
					throw new Error(`Template not found for file: ${file}`)
				}

				const targetFile = path.join(subTaskDir, file)
				await fs.writeFile(targetFile, template, "utf-8")
				return file
			}),
		)

		// Count generation results
		const successful = generateResults.filter((result) => result.status === "fulfilled")
		const failed = generateResults.filter((result) => result.status === "rejected")

		logger.info(`[projectWikiHelpers] Successfully generated ${successful.length} subtask files`)

		if (failed.length > 0) {
			logger.warn(`[projectWikiHelpers] Failed to generate ${failed.length} subtask files:`)
			failed.forEach((result) => {
				if (result.status === "rejected") {
					logger.warn(`  - ${subTaskFiles[generateResults.indexOf(result)]}: ${formatError(result.reason)}`)
				}
			})
		}
	} catch (error) {
		const errorMsg = formatError(error)
		throw new Error(`Failed to generate subtask files: ${errorMsg}`)
	}
}
