import { describe, it, expect, vi, beforeEach } from "vitest"
import * as path from "path"

// Set up mocks before importing the modules
const mockHomeDir = "C:\\home\\user"
const globalCommandsDir = path.join(mockHomeDir, ".roo", "commands")

// Mock os module
vi.mock("os", () => ({
	homedir: () => mockHomeDir,
}))

// Mock constants module
vi.mock("../../wiki-prompts/subtasks/constants", () => ({
	getGlobalCommandsDir: () => globalCommandsDir,
}))

// Import the functions to test after mocking
const { isRooGlobalCommandsDirectory, handleRooCommandsApprovalSkip } = await import("../utils/rooCommandsUtils")

describe("rooCommandsUtils", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("isRooGlobalCommandsDirectory", () => {
		it("should return true for exact global commands directory", () => {
			const result = isRooGlobalCommandsDirectory(globalCommandsDir)
			expect(result).toBe(true)
		})

		it("should return true for subdirectories of global commands directory", () => {
			const subDirPath = path.join(globalCommandsDir, "subtask")
			const result = isRooGlobalCommandsDirectory(subDirPath)
			expect(result).toBe(true)
		})

		it("should return true for files in global commands directory", () => {
			const filePath = path.join(globalCommandsDir, "command.md")
			const result = isRooGlobalCommandsDirectory(filePath)
			expect(result).toBe(true)
		})

		it("should return false for paths outside global commands directory", () => {
			const otherPath = path.join(mockHomeDir, ".roo", "other")
			const result = isRooGlobalCommandsDirectory(otherPath)
			expect(result).toBe(false)
		})

		it("should return false for completely different paths", () => {
			const otherPath = "/some/other/path"
			const result = isRooGlobalCommandsDirectory(otherPath)
			expect(result).toBe(false)
		})

		it("should handle relative paths correctly", () => {
			const relativePath = ".roo/commands"
			// This test depends on the current working directory, so we just verify it doesn't throw
			expect(() => isRooGlobalCommandsDirectory(relativePath)).not.toThrow()
		})
	})

	describe("handleRooCommandsApprovalSkip", () => {
		const mockCline = {
			cwd: mockHomeDir,
		}
		const mockUpdateFileResult = vi.fn()

		beforeEach(() => {
			mockUpdateFileResult.mockClear()
		})

		it("should return false when file status is not pending", () => {
			const fileResult = { status: "approved" }
			const relPath = "some/file.txt"

			const result = handleRooCommandsApprovalSkip(fileResult, relPath, mockCline, mockUpdateFileResult)

			expect(result).toBe(false)
			expect(mockUpdateFileResult).not.toHaveBeenCalled()
		})

		it("should return false when file is not in global commands directory", () => {
			const fileResult = { status: "pending" }
			const relPath = "some/file.txt"

			const result = handleRooCommandsApprovalSkip(fileResult, relPath, mockCline, mockUpdateFileResult)

			expect(result).toBe(false)
			expect(mockUpdateFileResult).not.toHaveBeenCalled()
		})

		it("should return true and update file result when file is in global commands directory", () => {
			const fileResult = { status: "pending" }
			const relPath = ".roo/commands/command.md"

			const result = handleRooCommandsApprovalSkip(fileResult, relPath, mockCline, mockUpdateFileResult)

			expect(result).toBe(true)
			expect(mockUpdateFileResult).toHaveBeenCalledWith(relPath, {
				status: "approved",
			})
		})

		it("should return true and update file result for subdirectory files", () => {
			const fileResult = { status: "pending" }
			const relPath = ".roo/commands/subtasks/task.md"

			const result = handleRooCommandsApprovalSkip(fileResult, relPath, mockCline, mockUpdateFileResult)

			expect(result).toBe(true)
			expect(mockUpdateFileResult).toHaveBeenCalledWith(relPath, {
				status: "approved",
			})
		})

		it("should handle different cline working directories correctly", () => {
			const fileResult = { status: "pending" }
			const relPath = "commands/command.md"
			const customCline = {
				cwd: path.join(mockHomeDir, ".roo"),
			}

			const result = handleRooCommandsApprovalSkip(fileResult, relPath, customCline, mockUpdateFileResult)

			expect(result).toBe(true)
			expect(mockUpdateFileResult).toHaveBeenCalledWith(relPath, {
				status: "approved",
			})
		})

		it("should not update file result when path is not in global commands directory", () => {
			const fileResult = { status: "pending" }
			const relPath = ".roo/other/command.md"

			const result = handleRooCommandsApprovalSkip(fileResult, relPath, mockCline, mockUpdateFileResult)

			expect(result).toBe(false)
			expect(mockUpdateFileResult).not.toHaveBeenCalled()
		})
	})
})
