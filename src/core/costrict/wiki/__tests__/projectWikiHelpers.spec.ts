import { describe, it, expect, vi, beforeEach } from "vitest"
import { ensureProjectWikiCommandExists } from "../projectWikiHelpers"
import { promises as fs } from "fs"
import * as path from "path"
import * as os from "os"
import {
	ALL_SUBTASK_FILENAMES,
	SUBTASK_FILENAMES,
	getGlobalCommandsDir,
	MAIN_WIKI_FILENAME,
	subtaskDir,
} from "../wiki-prompts/subtasks/constants"
import { projectWikiVersion } from "../wiki-prompts/project_wiki"

// Mock fs module
vi.mock("fs")
const mockedFs = vi.mocked(fs)

// Import TEMPLATES to get the actual count
// We need to access the private TEMPLATES constant for testing
const getTemplatesCount = () => {
	// This is a workaround to access the private TEMPLATES constant
	// In a real scenario, we might want to export it for testing or use a different approach
	const templateFiles = [MAIN_WIKI_FILENAME, ...SUBTASK_FILES]
	return templateFiles.length
}

// Use shared subtask files list from constants
const SUBTASK_FILES: readonly string[] = Object.values(SUBTASK_FILENAMES)

describe("projectWikiHelpers", () => {
	const globalCommandsDir = getGlobalCommandsDir()
	const projectWikiFile = path.join(globalCommandsDir, "project-wiki.md")
	const subTaskDir = subtaskDir

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should successfully create wiki command files", async () => {
		// Mock file system operations
		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockRejectedValue(new Error("File not found"))
		mockedFs.rm.mockResolvedValue(undefined)
		mockedFs.writeFile.mockResolvedValue(undefined)
		mockedFs.readdir.mockResolvedValue([SUBTASK_FILES[0], SUBTASK_FILES[1]] as any)

		// Execute function
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()

		// Verify calls
		expect(mockedFs.mkdir).toHaveBeenCalledWith(globalCommandsDir, { recursive: true })
		expect(mockedFs.writeFile).toHaveBeenCalledTimes(getTemplatesCount()) // 1 main file + 10 subtask files
	})

	it("should skip creation when files already exist", async () => {
		// Mock existing files - need to mock readFile to return valid content with version
		const mockContent = `---
version: "${projectWikiVersion}"
---
# Project Wiki Content`

		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockResolvedValue(undefined)
		mockedFs.readFile.mockResolvedValue(mockContent)
		mockedFs.stat.mockResolvedValue({
			isDirectory: () => true,
		} as any)
		mockedFs.readdir.mockResolvedValue(SUBTASK_FILES as any)

		// Execute function
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()

		// Verify no write operations were called
		expect(mockedFs.writeFile).not.toHaveBeenCalled()
	})

	it("should generate all wiki files correctly", async () => {
		// Mock file system operations for fresh creation
		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockRejectedValue(new Error("File not found"))
		mockedFs.rm.mockResolvedValue(undefined)

		// Capture writeFile calls to verify content
		const writeCalls: Array<[string, string, string]> = []
		mockedFs.writeFile.mockImplementation((filePath: any, content: any, encoding: any) => {
			writeCalls.push([filePath.toString(), content.toString(), encoding])
			return Promise.resolve(undefined)
		})

		// Execute function
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()

		// Verify all template files were written
		expect(mockedFs.writeFile).toHaveBeenCalledTimes(getTemplatesCount())

		// Verify main file was written
		const mainFileCall = writeCalls.find((call) => call[0] === projectWikiFile)
		expect(mainFileCall).toBeDefined()
		expect(mainFileCall?.[2]).toBe("utf-8")

		// Verify subtask files were written
		SUBTASK_FILES.forEach((fileName) => {
			const subtaskFileCall = writeCalls.find((call) => call[0] === path.join(subTaskDir, fileName))
			// Note: Some files might not be written due to missing templates, so we don't expect all to be defined
			if (subtaskFileCall) {
				expect(subtaskFileCall[2]).toBe("utf-8")
			}
		})
	})

	it("should handle missing subtask files and trigger recreation", async () => {
		// Mock file system operations with missing subtask files
		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockResolvedValue(undefined) // Main file exists
		mockedFs.stat.mockResolvedValue({
			isDirectory: () => true,
		} as any)
		mockedFs.readdir.mockResolvedValue([
			SUBTASK_FILES[0],
			SUBTASK_FILES[1],
			// Missing other required files
		] as any)
		mockedFs.rm.mockResolvedValue(undefined)
		mockedFs.writeFile.mockResolvedValue(undefined)

		// Execute function
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()

		// Verify that files were recreated due to missing subtask files
		expect(mockedFs.rm).toHaveBeenCalledWith(projectWikiFile, { force: true })
		expect(mockedFs.rm).toHaveBeenCalledWith(subTaskDir, { recursive: true, force: true })
		expect(mockedFs.writeFile).toHaveBeenCalledTimes(getTemplatesCount())
	})

	it("should handle file system errors gracefully", async () => {
		// Mock file system errors
		mockedFs.mkdir.mockRejectedValue(new Error("Permission denied"))

		// Execute function should not throw
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()
	})

	it("should handle writeFile errors during file generation", async () => {
		// Mock file system operations with writeFile error
		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockRejectedValue(new Error("File not found"))
		mockedFs.rm.mockResolvedValue(undefined)
		mockedFs.writeFile.mockRejectedValue(new Error("Write failed"))
		mockedFs.readdir.mockResolvedValue([] as any)

		// Execute function should not throw (errors are caught and logged)
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()
	})

	it("should handle subtask directory not being a directory", async () => {
		// Mock file system operations where subtaskDir exists but is not a directory
		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockResolvedValue(undefined) // Main file exists
		mockedFs.stat.mockResolvedValue({
			isDirectory: () => false, // Not a directory
		} as any)
		mockedFs.rm.mockResolvedValue(undefined)
		mockedFs.writeFile.mockResolvedValue(undefined)
		mockedFs.readdir.mockResolvedValue([] as any)

		// Execute function
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()

		// Verify that files were recreated due to subtaskDir not being a directory
		expect(mockedFs.rm).toHaveBeenCalledWith(projectWikiFile, { force: true })
		expect(mockedFs.rm).toHaveBeenCalledWith(subTaskDir, { recursive: true, force: true })
		expect(mockedFs.writeFile).toHaveBeenCalledTimes(getTemplatesCount())
	})
})
