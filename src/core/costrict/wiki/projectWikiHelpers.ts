import { promises as fs } from "fs"
import * as path from "path"
import { formatError, PROJECT_WIKI_VERSION, SUBTASK_FILENAMES, subtaskDir, DOC_TEMPLATE_FILES, templatesDir } from "./wiki-prompts/common/constants"
import { ILogger, createLogger } from "../../../utils/logger"
import { PROJECT_BASIC_ANALYZE_AGENT_TEMPLATE } from "./wiki-prompts/subtasks/01_project-basic-analyze-agent"
import { DOCUMENT_GENERATION_AGENT_TEMPLATE } from "./wiki-prompts/subtasks/02_document-generate-agent"
import { INDEX_GENERATION_AGENT_TEMPLATE } from "./wiki-prompts/subtasks/03_index-generation-agent"
import { DOC_TEMPLATES } from "./wiki-prompts/subtasks/templates"

export const projectWikiCommandName = "project-wiki"
export const projectWikiCommandDescription = `执行项目深度分析并创建全面的项目技术文档（v3版本）`


// Template data mapping for subtasks only (v3: 3个agent)
const SUBTASK_TEMPLATES = {
	[SUBTASK_FILENAMES.PROJECT_ANALYZE_AGENT]: PROJECT_BASIC_ANALYZE_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.DOCUMENT_GENERATION_AGENT]: DOCUMENT_GENERATION_AGENT_TEMPLATE,
	[SUBTASK_FILENAMES.INDEX_GENERATION_AGENT]: INDEX_GENERATION_AGENT_TEMPLATE,
}


// 创建 logger 实例，但允许在测试时被替换
let logger: ILogger = createLogger()

// 导出 logger setter 以便测试时可以替换
export function setLogger(testLogger: ILogger): void {
	logger = testLogger
}

export async function ensureProjectWikiSubtasksExists() {
	const startTime = Date.now()
	logger.info(`[projectWikiHelpers] wiki version ${PROJECT_WIKI_VERSION}, Starting ensureProjectWikiSubtasksExists...`)

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

		// Check if templates directory exists and has template files
		try {
			const templatesDirResult = await fs.stat(templatesDir)
			if (!templatesDirResult.isDirectory()) {
				logger.info("[projectWikiHelpers] templates directory exists but is not a directory")
				return false
			}

			const templateFiles = await fs.readdir(templatesDir)
			const mdFiles = templateFiles.filter((file) => file.endsWith(".md"))
			
			// Check if all required template files exist (now as .md files)
			const requiredTemplateFiles = Object.keys(DOC_TEMPLATES).map(templateId => `${templateId}.md`)
			const missingTemplateFiles = requiredTemplateFiles.filter((fileName) => !mdFiles.includes(fileName))

			if (missingTemplateFiles.length > 0) {
				logger.info(`[projectWikiHelpers] Missing template files: ${missingTemplateFiles.join(", ")}`)
				return false
			}
		} catch (templatesError) {
			logger.info("[projectWikiHelpers] templates directory not accessible:", formatError(templatesError))
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

		// Create templates subdirectory (use imported templatesDir constant)
		await fs.mkdir(templatesDir, { recursive: true })

		// Generate subtask files
		const subTaskFiles = Object.keys(SUBTASK_TEMPLATES)
		const subtaskResults = await Promise.allSettled(
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

		// Generate template files (output template content to .md files like other subtask files)
		const templateFiles = Object.keys(DOC_TEMPLATES)
		const templateResults = await Promise.allSettled(
			templateFiles.map(async (templateId) => {
				const templateFunction = DOC_TEMPLATES[templateId]
				if (!templateFunction) {
					throw new Error(`Template function not found for: ${templateId}`)
				}

				const templateContent = templateFunction("${workspaceFolder}/")
				// Generate .md file name based on template ID (like other subtask files)
				const templateFileName = `${templateId}.md`
				const targetFile = path.join(templatesDir, templateFileName)
				await fs.writeFile(targetFile, templateContent, "utf-8")
				return templateFileName
			}),
		)

		// Count generation results
		const successfulSubtasks = subtaskResults.filter((result) => result.status === "fulfilled")
		const failedSubtasks = subtaskResults.filter((result) => result.status === "rejected")
		const successfulTemplates = templateResults.filter((result) => result.status === "fulfilled")
		const failedTemplates = templateResults.filter((result) => result.status === "rejected")

		logger.info(`[projectWikiHelpers] Successfully generated ${successfulSubtasks.length} subtask files and ${successfulTemplates.length} template files`)

		if (failedSubtasks.length > 0) {
			logger.warn(`[projectWikiHelpers] Failed to generate ${failedSubtasks.length} subtask files:`)
			failedSubtasks.forEach((result) => {
				if (result.status === "rejected") {
					logger.warn(`  - ${subTaskFiles[subtaskResults.indexOf(result)]}: ${formatError(result.reason)}`)
				}
			})
		}

		if (failedTemplates.length > 0) {
			logger.warn(`[projectWikiHelpers] Failed to generate ${failedTemplates.length} template files:`)
			failedTemplates.forEach((result) => {
				if (result.status === "rejected") {
					logger.warn(`  - ${templateFiles[templateResults.indexOf(result)]}: ${formatError(result.reason)}`)
				}
			})
		}
	} catch (error) {
		const errorMsg = formatError(error)
		throw new Error(`Failed to generate subtask files: ${errorMsg}`)
	}
}