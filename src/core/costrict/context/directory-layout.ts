import path from "path"
import os from "os"
import { listFiles } from "../../../services/glob/list-files"
import { RooIgnoreController } from "../../ignore/RooIgnoreController"
import { arePathsEqual } from "../../../utils/path"
import { MAX_WORKSPACE_FILES } from "@roo-code/types"
import type { Task } from "../../task/Task"

// CoStrict: Cache directory layout per Task instance (computed once at task start, reused for all rounds)
// WeakMap ensures cache is garbage-collected when Task instance is destroyed
const directoryLayoutCache = new WeakMap<Task, string>()

interface TreeNode {
	name: string
	type: "file" | "directory"
	children?: Map<string, TreeNode>
	collapsedFiles?: string[]
}

interface ExtStats {
	count: number
	extensions: Map<string, number>
}

const MAX_DISPLAY_DEPTH = 2 // 展示到第 2 层（根目录 = 第 0 层）
const MAX_ITEMS_PER_DIR = 20 // 单目录超过 20 项折叠
const EXT_COUNT_THRESHOLD = 1000 // 扩展名统计阈值
const TOTAL_COUNT_THRESHOLD = 5000 // 总文件数统计阈值
const MAX_SCAN_FILES = 20000 // 文件扫描上限

/**
 * 统计文件扩展名分布
 */
function countExtensions(files: string[]): ExtStats {
	const extMap = new Map<string, number>()

	for (const file of files) {
		const ext = path.extname(file).toLowerCase()
		if (ext) {
			extMap.set(ext, (extMap.get(ext) || 0) + 1)
		}
	}

	return { count: files.length, extensions: extMap }
}

/**
 * 格式化扩展名统计（仅显示前 3 个，带阈值优化）
 */
function formatExtStats(stats: ExtStats): string {
	if (stats.count === 0) return ""

	const sorted = Array.from(stats.extensions.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)

	const parts = sorted.map(([ext, count]) => {
		// 单个扩展名超过阈值，显示 "1000+"
		const displayCount = count > EXT_COUNT_THRESHOLD ? `${EXT_COUNT_THRESHOLD}+` : count.toString()
		return `${displayCount} *${ext}`
	})

	const hasMore = stats.extensions.size > 3

	// 总数超过阈值，显示 "5000+"
	const totalDisplay = stats.count > TOTAL_COUNT_THRESHOLD ? `${TOTAL_COUNT_THRESHOLD}+` : stats.count.toString()

	return `[${totalDisplay} file${stats.count > 1 ? "s" : ""} in subtree: ${parts.join(", ")}${hasMore ? ", ..." : ""}]`
}

/**
 * 构建目录树（限制深度）
 */
function buildTree(files: string[]): TreeNode {
	const root: TreeNode = { name: "", type: "directory", children: new Map() }

	for (const file of files) {
		const parts = file.split(/[/\\]/)
		let current = root
		let depth = 0

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]
			const isLastPart = i === parts.length - 1

			if (isLastPart) {
				// 文件节点
				if (depth < MAX_DISPLAY_DEPTH) {
					if (!current.children) current.children = new Map()
					current.children.set(part, { name: part, type: "file" })
				} else {
					// 超出深度，添加到折叠列表
					if (!current.collapsedFiles) current.collapsedFiles = []
					current.collapsedFiles.push(part)
				}
			} else {
				// 目录节点
				depth++

				if (!current.children) current.children = new Map()

				if (!current.children.has(part)) {
					current.children.set(part, {
						name: part,
						type: "directory",
						children: depth < MAX_DISPLAY_DEPTH ? new Map() : undefined,
						collapsedFiles: depth < MAX_DISPLAY_DEPTH ? undefined : [],
					})
				}

				const nextNode = current.children.get(part)!

				// 如果已达到最大深度，收集剩余路径
				if (depth >= MAX_DISPLAY_DEPTH) {
					const remainingPath = parts.slice(i + 1).join("/")
					if (remainingPath && nextNode.collapsedFiles) {
						nextNode.collapsedFiles.push(remainingPath)
					}
					break
				}

				current = nextNode
			}
		}
	}

	return root
}

/**
 * 渲染树结构（带单目录折叠优化）
 */
function renderTree(node: TreeNode, indent: string = ""): string[] {
	const lines: string[] = []

	if (!node.children) return lines

	const entries = Array.from(node.children.entries()).sort((a, b) => {
		// 目录优先，然后按名称排序
		if (a[1].type !== b[1].type) {
			return a[1].type === "directory" ? -1 : 1
		}
		return a[0].localeCompare(b[0])
	})

	// 判断是否需要折叠（单目录子项过多）
	const shouldCollapse = entries.length > MAX_ITEMS_PER_DIR

	if (shouldCollapse) {
		// 折叠模式：只显示前 10 个
		const itemsToShow = entries.slice(0, 10)
		const hiddenCount = entries.length - 10

		for (const [name, child] of itemsToShow) {
			if (child.type === "directory") {
				lines.push(`${indent}- ${name}\\`)
			} else {
				lines.push(`${indent}- ${name}`)
			}
		}

		if (hiddenCount > 0) {
			const hiddenDirs = entries.slice(10).filter(([_, child]) => child.type === "directory").length
			const hiddenFiles = entries.slice(10).filter(([_, child]) => child.type === "file").length

			let summary = `${indent}  ... and ${hiddenCount} more item${hiddenCount > 1 ? "s" : ""}`
			if (hiddenDirs > 0 && hiddenFiles > 0) {
				summary += ` (${hiddenDirs} dir${hiddenDirs > 1 ? "s" : ""}, ${hiddenFiles} file${hiddenFiles > 1 ? "s" : ""})`
			} else if (hiddenDirs > 0) {
				summary += ` (${hiddenDirs} dir${hiddenDirs > 1 ? "s" : ""})`
			} else if (hiddenFiles > 0) {
				summary += ` (${hiddenFiles} file${hiddenFiles > 1 ? "s" : ""})`
			}
			lines.push(summary)
		}
	} else {
		// 正常模式：展示所有子项
		for (const [name, child] of entries) {
			if (child.type === "directory") {
				// 检查目录是否有内容可显示
				const hasChildren = child.children && child.children.size > 0
				const hasCollapsedFiles = child.collapsedFiles && child.collapsedFiles.length > 0

				// 只渲染有内容的目录
				if (hasChildren || hasCollapsedFiles) {
					lines.push(`${indent}- ${name}\\`)

					// 递归渲染子节点
					if (hasChildren) {
						const childIndent = indent + "  "
						const childLines = renderTree(child, childIndent)
						lines.push(...childLines)
					}

					// 显示折叠的文件统计
					if (hasCollapsedFiles && child.collapsedFiles) {
						const extStats = countExtensions(child.collapsedFiles)
						const statsText = formatExtStats(extStats)
						lines.push(`${indent}  ${statsText}`)
					}
				}
			} else {
				// 文件节点
				lines.push(`${indent}- ${name}`)
			}
		}
	}

	return lines
}

/**
 * 格式化目录树为 Cursor 格式
 */
function formatDirectoryTree(cwd: string, files: string[]): string {
	if (files.length === 0) {
		return "<project_layout>\n(空项目)\n</project_layout>"
	}

	// 构建树结构（依赖深度/广度限制自动折叠，无需极简模式）
	const tree = buildTree(files)
	const lines = renderTree(tree)

	return `<project_layout>\n${cwd}\\\n${lines.join("\n")}\n</project_layout>`
}

/**
 * 生成目录概览（处理所有逻辑）
 *
 * Cache Strategy:
 * - Computes directory layout ONCE per Task instance (at first call)
 * - Reuses cached result for all subsequent rounds in the same conversation
 * - Cache is automatically garbage-collected when Task instance is destroyed
 *
 * Note: Caller is responsible for deciding whether to call this function.
 * This function always generates layout when called (unless cached).
 */
export async function generateDirectoryLayout(
	task: Task,
	cwd: string,
	rooIgnoreController: RooIgnoreController | undefined,
	state: any,
	maxWorkspaceFiles: number | undefined
): Promise<string> {
	// 1. Cache check (compute once, reuse for all subsequent rounds)
	const cached = directoryLayoutCache.get(task)
	if (cached !== undefined) {
		return cached
	}

	const { showRooIgnoredFiles = false } = state ?? {}

	// 2. Desktop check (cache result)
	const isDesktop = arePathsEqual(cwd, path.join(os.homedir(), "Desktop"))
	if (isDesktop) {
		const result = "\n\n(Desktop files not shown automatically. Use list_files to explore if needed.)"
		directoryLayoutCache.set(task, result)
		return result
	}

	// 3. maxFiles check (cache result)
	const maxFiles = maxWorkspaceFiles ?? MAX_WORKSPACE_FILES
	if (maxFiles === 0) {
		const result = "\n\n(Workspace files context disabled. Use list_files to explore if needed.)"
		directoryLayoutCache.set(task, result)
		return result
	}

	// 4. Scan files with optimized limit
	const scanLimit = Math.min(3 * maxFiles, MAX_SCAN_FILES)
	const [files, didHitLimit] = await listFiles(cwd, true, scanLimit)

	// 5. Sort and convert to relative paths
	const sorted = files
		.map((file) => {
			const relativePath = path.relative(cwd, file).toPosix()
			return file.endsWith("/") ? relativePath + "/" : relativePath
		})
		.sort((a, b) => {
			const aParts = a.split("/")
			const bParts = b.split("/")
			for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
				if (aParts[i] !== bParts[i]) {
					if (i + 1 === aParts.length && i + 1 < bParts.length) return -1
					if (i + 1 === bParts.length && i + 1 < aParts.length) return 1
					return aParts[i].localeCompare(bParts[i], undefined, { numeric: true, sensitivity: "base" })
				}
			}
			return aParts.length - bParts.length
		})

	// 6. Filter through RooIgnoreController
	let filteredFiles: string[] = []
	if (rooIgnoreController) {
		for (const filePath of sorted) {
			const absoluteFilePath = path.resolve(cwd, filePath)
			const isIgnored = !rooIgnoreController.validateAccess(absoluteFilePath)
			if (!isIgnored || showRooIgnoredFiles) {
				filteredFiles.push(filePath)
			}
		}
	} else {
		filteredFiles = sorted
	}

	// 7. Build directory tree
	let result = "\n\n" + formatDirectoryTree(cwd, filteredFiles)

	if (didHitLimit) {
		result += "\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)"
	}

	// 8. Add Cursor-style snapshot hint
	result += "\n\n**Note**: This is a snapshot of the workspace's file structure at the start of the conversation. This snapshot will NOT update during the conversation."

	// 9. Cache the result for subsequent rounds
	directoryLayoutCache.set(task, result)

	return result
}
