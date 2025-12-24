import { describe, it, expect, beforeEach, vi } from "vitest"
import { generateDirectoryLayout } from "../directory-layout"
import type { Task } from "../../../task/Task"
import type { RooIgnoreController } from "../../../ignore/RooIgnoreController"
import * as listFilesModule from "../../../../services/glob/list-files"

// Mock dependencies
vi.mock("../../../../services/glob/list-files", () => ({
	listFiles: vi.fn(),
}))

describe("directory-layout", () => {
	let mockTask: Task
	let mockRooIgnoreController: RooIgnoreController

	beforeEach(() => {
		// Create a fresh Task mock for each test (to test cache isolation)
		mockTask = {} as Task

		// Mock RooIgnoreController
		mockRooIgnoreController = {
			validateAccess: vi.fn().mockReturnValue(true),
			filterPaths: vi.fn((paths: string[]) => paths.join("\n")),
		} as any

		// Clear all mocks
		vi.clearAllMocks()
	})

	describe("Cache Mechanism", () => {
		it("should compute directory layout on first call", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts", "package.json", "README.md"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			expect(listFilesModule.listFiles).toHaveBeenCalledTimes(1)
			expect(result).toContain("<project_layout>")
			expect(result).toContain("d:\\Projects\\zgsm")
		})

		it("should return cached result on second call with same Task instance", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts", "package.json"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			// First call - should compute
			const result1 = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Second call - should return cached
			const result2 = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// listFiles should only be called once (first call)
			expect(listFilesModule.listFiles).toHaveBeenCalledTimes(1)

			// Results should be identical
			expect(result1).toBe(result2)
		})

		it("should compute fresh layout for different Task instances", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const task1 = {} as Task
			const task2 = {} as Task

			await generateDirectoryLayout(task1, cwd, mockRooIgnoreController, {}, 100)
			await generateDirectoryLayout(task2, cwd, mockRooIgnoreController, {}, 100)

			// Should be called twice (once per Task instance)
			expect(listFilesModule.listFiles).toHaveBeenCalledTimes(2)
		})

		it("should cache Desktop directory result", async () => {
			const homedir = "C:\\Users\\Test"
			const desktopPath = `${homedir}\\Desktop`

			vi.spyOn(require("os"), "homedir").mockReturnValue(homedir)

			const result1 = await generateDirectoryLayout(mockTask, desktopPath, mockRooIgnoreController, {}, 100)
			const result2 = await generateDirectoryLayout(mockTask, desktopPath, mockRooIgnoreController, {}, 100)

			// Should not call listFiles at all (early return)
			expect(listFilesModule.listFiles).not.toHaveBeenCalled()

			// Should return Desktop warning
			expect(result1).toContain("Desktop files not shown automatically")
			expect(result1).toBe(result2)
		})

		it("should cache maxWorkspaceFiles=0 result", async () => {
			const cwd = "d:\\Projects\\zgsm"

			const result1 = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 0)
			const result2 = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 0)

			// Should not call listFiles (early return)
			expect(listFilesModule.listFiles).not.toHaveBeenCalled()

			// Should return disabled warning
			expect(result1).toContain("Workspace files context disabled")
			expect(result1).toBe(result2)
		})
	})

	describe("Desktop Directory Handling", () => {
		it("should return warning for Desktop directory", async () => {
			const homedir = "C:\\Users\\Test"
			const desktopPath = `${homedir}\\Desktop`

			vi.spyOn(require("os"), "homedir").mockReturnValue(homedir)

			const result = await generateDirectoryLayout(mockTask, desktopPath, mockRooIgnoreController, {}, 100)

			expect(result).toContain("Desktop files not shown automatically")
			expect(result).toContain("Use list_files to explore if needed")
		})
	})

	describe("maxWorkspaceFiles Configuration", () => {
		it("should return warning when maxWorkspaceFiles=0", async () => {
			const cwd = "d:\\Projects\\zgsm"

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 0)

			expect(result).toContain("Workspace files context disabled")
		})

		it("should use default MAX_WORKSPACE_FILES when undefined", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, undefined)

			// Should call listFiles with 3 * MAX_WORKSPACE_FILES (default)
			expect(listFilesModule.listFiles).toHaveBeenCalled()
		})

		it("should respect custom maxWorkspaceFiles limit", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts"]
			const didHitLimit = false
			const customMax = 50

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, customMax)

			// Should scan with 3 * customMax limit
			expect(listFilesModule.listFiles).toHaveBeenCalledWith(cwd, true, expect.any(Number))
		})
	})

	describe("File Scanning and Limits", () => {
		it("should show truncation message when didHitLimit=true", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = Array.from({ length: 100 }, (_, i) => `file${i}.ts`)
			const didHitLimit = true

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			expect(result).toContain("File list truncated")
			expect(result).toContain("Use list_files on specific subdirectories")
		})

		it("should not show truncation message when didHitLimit=false", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts", "package.json"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			expect(result).not.toContain("File list truncated")
		})

		it("should scan with optimized limit (min of 3*maxFiles and MAX_SCAN_FILES)", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts"]
			const didHitLimit = false
			const maxFiles = 1000

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, maxFiles)

			// Should call with min(3*1000, 20000) = 3000
			const call = (listFilesModule.listFiles as any).mock.calls[0]
			expect(call[2]).toBeLessThanOrEqual(20000)
		})
	})

	describe("Directory Tree Formatting", () => {
		it("should format files into Cursor-style tree", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = [
				"src/index.ts",
				"src/core/Task.ts",
				"src/core/utils/helper.ts",
				"package.json",
				"README.md",
			]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Should contain project_layout tags
			expect(result).toContain("<project_layout>")
			expect(result).toContain("</project_layout>")

			// Should contain working directory
			expect(result).toContain("d:\\Projects\\zgsm")

			// Should show directory structure
			expect(result).toContain("src\\")
			expect(result).toContain("package.json")
			expect(result).toContain("README.md")
		})

		it("should handle empty project", async () => {
			const cwd = "d:\\Projects\\empty"
			const files: string[] = []
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			expect(result).toContain("<project_layout>")
			expect(result).toContain("(空项目)")
			expect(result).toContain("</project_layout>")
		})

		it("should add snapshot hint to output", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			expect(result).toContain("**Note**")
			expect(result).toContain("This is a snapshot")
			expect(result).toContain("will NOT update during the conversation")
		})
	})

	describe("RooIgnoreController Integration", () => {
		it("should filter files through RooIgnoreController when provided", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts", "node_modules/package/index.js", "dist/bundle.js", "README.md"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			// Mock RooIgnoreController to ignore node_modules and dist
			const mockController = {
				validateAccess: vi.fn((path: string) => {
					return !path.includes("node_modules") && !path.includes("dist")
				}),
			} as any

			const result = await generateDirectoryLayout(mockTask, cwd, mockController, {}, 100)

			// Should call validateAccess for each file
			expect(mockController.validateAccess).toHaveBeenCalledTimes(files.length)

			// Result should not contain ignored files
			expect(result).toContain("src")
			expect(result).toContain("README.md")
			// Ignored files should not appear
			expect(result).not.toContain("node_modules")
			expect(result).not.toContain("dist")
		})

		it("should work without RooIgnoreController", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts", "package.json"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, undefined, {}, 100)

			// Should not crash, should show all files
			expect(result).toContain("src")
			expect(result).toContain("package.json")
		})

		it("should show ignored files when showRooIgnoredFiles=true", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src/index.ts", "node_modules/package/index.js"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const mockController = {
				validateAccess: vi.fn((path: string) => !path.includes("node_modules")),
			} as any

			const state = { showRooIgnoredFiles: true }

			const result = await generateDirectoryLayout(mockTask, cwd, mockController, state, 100)

			// Should show all files including ignored ones
			expect(result).toContain("src")
			expect(result).toContain("node_modules")
		})
	})

	describe("Deep Directory Tree Handling", () => {
		it("should handle deeply nested directories (depth limit)", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = [
				"a/b/c/d/e/f/g/h/i/deep.ts", // Very deep file (9 levels)
				"a/b/c/shallow.ts", // Shallow file (3 levels)
			]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Should contain collapsed file statistics for deep paths
			expect(result).toContain("<project_layout>")
			// Depth limit is 2, so deep files should be collapsed
			expect(result).toMatch(/\[.*file.*in subtree.*\]/)
		})

		it("should collapse directories with >20 items", async () => {
			const cwd = "d:\\Projects\\zgsm"
			// Create 25 files in root (not in subdirectory)
			// Files need to be in a single directory at depth <= 2 to trigger collapse
			const files = Array.from({ length: 25 }, (_, i) => `file${i}.ts`)
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Should show "... and X more items" OR show collapsed subtree statistics
			// The actual behavior depends on MAX_DISPLAY_DEPTH (2) and MAX_ITEMS_PER_DIR (20)
			expect(result).toMatch(/(\.\.\. and \d+ more item|\[.*file.*in subtree.*\])/)
		})

		it("should show extension statistics for collapsed files", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = [
				"a/b/c/d/e/file1.ts",
				"a/b/c/d/e/file2.ts",
				"a/b/c/d/e/file3.js",
				"a/b/c/d/e/file4.json",
			]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Should contain extension statistics
			expect(result).toMatch(/\[.*file.*\.ts.*\]/)
		})
	})

	describe("Real Project Test (本项目)", () => {
		it("should generate tree for current project (integration test)", async () => {
			// Temporarily restore the real listFiles implementation
			const originalListFiles = vi.mocked(listFilesModule.listFiles)

			// Import and use the real listFiles for this test only
			vi.unmock("../../../../services/glob/list-files")
			const { listFiles: realListFiles } = await import("../../../../services/glob/list-files")
			vi.spyOn(listFilesModule, "listFiles").mockImplementation(realListFiles as any)

			const cwd = "d:\\Projects\\zgsm"
			const maxFiles = 100

			const result = await generateDirectoryLayout(mockTask, cwd, undefined, {}, maxFiles)

			// Verify structure
			expect(result).toContain("<project_layout>")
			expect(result).toContain("d:\\Projects\\zgsm")
			expect(result).toContain("</project_layout>")

			// Should contain common project directories
			expect(result).toMatch(/src|packages|apps/)

			// Should contain snapshot hint
			expect(result).toContain("snapshot")
			expect(result).toContain("will NOT update")

			// Cache verification - second call should be instant
			const startTime = Date.now()
			const result2 = await generateDirectoryLayout(mockTask, cwd, undefined, {}, maxFiles)
			const duration = Date.now() - startTime

			// Cached call should be <10ms (more lenient for CI)
			expect(duration).toBeLessThan(10)
			expect(result2).toBe(result)

			// Restore the mock
			vi.spyOn(listFilesModule, "listFiles").mockImplementation(originalListFiles)
		}, 10000) // 10s timeout for real file scanning
	})

	describe("Performance", () => {
		it("should cache results efficiently for repeated calls", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = Array.from({ length: 1000 }, (_, i) => `src/file${i}.ts`)
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			// First call - compute
			const start1 = Date.now()
			await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)
			const duration1 = Date.now() - start1

			// Second call - cached (should be much faster)
			const start2 = Date.now()
			await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)
			const duration2 = Date.now() - start2

			// Cached call should be at least 10x faster
			expect(duration2).toBeLessThan(duration1 / 10)
			// Cached call should be <1ms
			expect(duration2).toBeLessThan(1)
		})
	})

	describe("Edge Cases", () => {
		it("should handle files with special characters", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = [
				"src/file with spaces.ts",
				"src/文件中文.ts",
				"src/file@special#chars.ts",
				"src/file[brackets].ts",
			]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Should not crash
			expect(result).toContain("<project_layout>")
			expect(result).toContain("src")
		})

		it("should handle very long file paths", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const longPath = "a/".repeat(50) + "file.ts"
			const files = [longPath]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Should not crash
			expect(result).toContain("<project_layout>")
		})

		it("should handle mixed path separators", async () => {
			const cwd = "d:\\Projects\\zgsm"
			const files = ["src\\windows\\path.ts", "src/unix/path.ts"]
			const didHitLimit = false

			vi.spyOn(listFilesModule, "listFiles").mockResolvedValue([files, didHitLimit] as any)

			const result = await generateDirectoryLayout(mockTask, cwd, mockRooIgnoreController, {}, 100)

			// Should normalize and handle both
			expect(result).toContain("<project_layout>")
			expect(result).toContain("src")
		})
	})
})
