/**
 * 导出器 - 提供知识图谱数据导出功能
 */

import { FileStorage } from "../storage/FileStorage"
import {
	FileSummary,
	DirectorySummary,
	DependencyRelation,
	ExportFormat,
	ExportOptions,
	ExportResult,
	RootInfo,
} from "../types"
import { EXPORT_CONFIG, ERROR_CODES } from "../constants"
import { KnowledgeGraphError } from "../errors/KnowledgeGraphError"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import * as fs from "fs/promises"
import { createWriteStream } from "fs"
import { ILogger } from "../../../utils/logger"
import { IStorage } from "../storage/IStorage"
import { FileSummarizer } from "./FileSummarizer"
import { RootAnalyzer } from "./RootAnalyzer"
import { DirectorySummarizer } from "./DirectorySummarizer"

export class Exporter {
	private logger: ILogger
	private rootAnalyzer: RootAnalyzer
	private fileSummarizer: FileSummarizer
	private directorySummarizer: DirectorySummarizer

	constructor(
		rootAnalyzer: RootAnalyzer,
		fileSummarizer: FileSummarizer,
		directorySummarizer: DirectorySummarizer,
		logger: ILogger,
	) {
		this.rootAnalyzer = rootAnalyzer
		this.fileSummarizer = fileSummarizer
		this.directorySummarizer = directorySummarizer
		this.logger = logger
	}

	/**
	 * 导出知识图谱数据
	 */
	async export(workspacePath: string, options: ExportOptions): Promise<ExportResult> {
		try {
			const { format, outputPath, includeMetadata = true } = options

			// 获取数据
			const rootInfo = await this.rootAnalyzer.getRootInfo()
			const fileSummaries = await this.fileSummarizer.getFileSummaries()
			const directorySummaries = await this.directorySummarizer.getDirectorySummaries(workspacePath)

			// 根据格式导出
			let result: ExportResult

			switch (format) {
				case "json":
					result = await this.exportToJson(
						rootInfo,
						fileSummaries,
						directorySummaries,
						outputPath,
						includeMetadata,
					)
					break

				case "jsonl":
					result = await this.exportToJsonl(
						rootInfo,
						fileSummaries,
						directorySummaries,
						outputPath,
						includeMetadata,
					)
					break

				case "markdown":
					result = await this.exportToMarkdown(
						rootInfo,
						fileSummaries,
						directorySummaries,
						outputPath,
						includeMetadata,
					)
					break

				default:
					throw new KnowledgeGraphError(
						`不支持的导出格式: ${format}`,
						ERROR_CODES.INVALID_RESPONSE,
						false,
						false,
					)
			}

			return result
		} catch (error) {
			throw new KnowledgeGraphError(
				`导出失败: ${error instanceof Error ? error.message : String(error)}`,
				ERROR_CODES.STORAGE_ERROR,
				false,
				true,
			)
		}
	}

	/**
	 * 导出为JSON格式
	 */
	private async exportToJson(
		rootInfo: RootInfo | undefined,
		fileSummaries: FileSummary[] | undefined,
		directorySummaries: DirectorySummary[] | undefined,
		outputPath: string,
		includeMetadata: boolean,
	): Promise<ExportResult> {
		const data = {
			metadata: includeMetadata ? this.createMetadata() : undefined,
			files: fileSummaries,
			directories: directorySummaries,
			summary: {
				totalFiles: fileSummaries?.length,
				totalDirectories: directorySummaries?.length,
				exportTime: new Date().toISOString(),
			},
		}

		await safeWriteJson(outputPath, data)

		return {
			format: "json",
			outputPath,
			exportTime: new Date().toISOString(),
		}
	}

	/**
	 * 导出为JSONL格式
	 */
	private async exportToJsonl(
		rootInfo: RootInfo | undefined,
		fileSummaries: FileSummary[] | undefined,
		directorySummaries: DirectorySummary[] | undefined,
		outputPath: string,
		includeMetadata: boolean,
	): Promise<ExportResult> {
		const writeStream = createWriteStream(outputPath, { encoding: "utf8" })
		let recordCount = 0

		try {
			// 写入元数据
			if (includeMetadata) {
				writeStream.write(JSON.stringify({ type: "metadata", data: this.createMetadata() }) + "\n")
				recordCount++
			}

			if (fileSummaries) {
				// 写入文件摘要
				for (const summary of fileSummaries) {
					writeStream.write(JSON.stringify({ type: "file", data: summary }) + "\n")
					recordCount++

					// 批量写入，避免内存问题
					if (recordCount % EXPORT_CONFIG.jsonl.batchSize === 0) {
						await this.flushStream(writeStream)
					}
				}
			}

			if (directorySummaries) {
				// 写入目录摘要
				for (const summary of directorySummaries) {
					writeStream.write(JSON.stringify({ type: "directory", data: summary }) + "\n")
					recordCount++

					if (recordCount % EXPORT_CONFIG.jsonl.batchSize === 0) {
						await this.flushStream(writeStream)
					}
				}
			}

			// 结束写入
			writeStream.end()

			// 等待写入完成
			await new Promise<void>((resolve, reject) => {
				writeStream.on("finish", resolve)
				writeStream.on("error", reject)
			})

			return {
				format: "jsonl",
				outputPath,
				exportTime: new Date().toISOString(),
			}
		} catch (error) {
			writeStream.destroy()
			throw error
		}
	}

	/**
	 * 导出为Markdown格式
	 */
	private async exportToMarkdown(
		rootInfo: RootInfo | undefined,
		fileSummaries: FileSummary[] | undefined,
		directorySummaries: DirectorySummary[] | undefined,
		outputPath: string,
		includeMetadata: boolean,
	): Promise<ExportResult> {
		const content = this.generateMarkdownContent(rootInfo, fileSummaries, directorySummaries, includeMetadata)

		await fs.writeFile(outputPath, content, "utf8")

		return {
			format: "markdown",
			outputPath,
			exportTime: new Date().toISOString(),
		}
	}

	/**
	 * 创建元数据
	 */
	private createMetadata(): any {
		return {
			version: "1.0.0",
			generator: "CoStrict Knowledge Graph",
			exportTime: new Date().toISOString(),
			format: "knowledge-graph-v1",
		}
	}

	/**
	 * 生成Markdown内容
	 */
	private generateMarkdownContent(
		rootInfo: RootInfo | undefined,
		fileSummaries: FileSummary[] | undefined,
		directorySummaries: DirectorySummary[] | undefined,
		includeMetadata: boolean,
	): string {
		let content = "# 知识图谱报告\n\n"

		if (includeMetadata) {
			content += "## 元数据\n\n"
			content += "```json\n"
			content += JSON.stringify(this.createMetadata(), null, 2)
			content += "\n```\n\n"
		}

		// 统计信息
		content += "## 统计信息\n\n"
		content += `- 文件总数: ${fileSummaries?.length}\n`
		content += `- 目录总数: ${directorySummaries?.length}\n`
		content += `- 导出时间: ${new Date().toISOString()}\n\n`

		// 目录结构
		content += "## 目录结构\n\n"
		content += this.generateDirectoryTree(fileSummaries, directorySummaries)
		content += "\n\n"

		// 文件摘要
		content += "## 文件摘要\n\n"
		if (fileSummaries) {
			for (const summary of fileSummaries) {
				// 限制数量
				content += `### ${summary.path}\n\n`
				content += `- **类型**: ${summary.type}\n`
				content += `- **关键词**: ${summary.keywords.join(", ")}\n`
				content += `- **描述**: ${summary.description}\n\n`

				if (Object.keys(summary.core_functions).length > 0) {
					content += "**核心函数**:\n"
					for (const [funcName, funcDesc] of Object.entries(summary.core_functions)) {
						content += `- ${funcName}: ${funcDesc}\n`
					}
					content += "\n"
				}
			}
		}

		if (directorySummaries) {
			// 目录摘要
			content += "## 目录摘要\n\n"
			for (const summary of directorySummaries) {
				// 限制数量
				content += `### ${summary.path}\n\n`
				content += `- **类型**: ${summary.type}\n`
				content += `- **关键词**: ${summary.keywords.join(", ")}\n`
				content += `- **描述**: ${summary.description}\n`

				if (summary.key_files.length > 0) {
					content += `- **核心文件**: ${summary.key_files.join(", ")}\n`
				}

				if (summary.upstream.length > 0) {
					content += `- **上游依赖**: ${summary.upstream.join(", ")}\n`
				}

				if (summary.downstream.length > 0) {
					content += `- **下游依赖**: ${summary.downstream.join(", ")}\n`
				}

				if (summary.collaboration) {
					content += `- **协作关系**: ${summary.collaboration}\n`
				}

				content += "\n"
			}
		}
		return content
	}

	/**
	 * 生成目录树
	 */
	private generateDirectoryTree(
		fileSummaries: FileSummary[] | undefined,
		directorySummaries: DirectorySummary[] | undefined,
	): string {
		// 构建文件树
		const fileTree = this.buildFileTree(fileSummaries)

		// 生成树形字符串
		return this.generateTreeString(fileTree, "", true)
	}

	/**
	 * 构建文件树
	 */
	private buildFileTree(fileSummaries: FileSummary[] | undefined): FileTreeNode {
		const root: FileTreeNode = {
			name: "项目根目录",
			path: "",
			type: "directory",
			children: new Map(),
		}
		if (!fileSummaries) {
			return root
		}
		for (const summary of fileSummaries) {
			const parts = summary.path.split("/").filter((p) => p.length > 0)
			this.addToTree(root, parts, summary)
		}

		return root
	}

	/**
	 * 添加到树
	 */
	private addToTree(node: FileTreeNode, parts: string[], summary: FileSummary): void {
		if (parts.length === 0) return

		const [current, ...rest] = parts

		if (!node.children.has(current)) {
			node.children.set(current, {
				name: current,
				path: node.path ? `${node.path}/${current}` : current,
				type: rest.length > 0 ? "directory" : "file",
				children: new Map(),
			})
		}

		const child = node.children.get(current)!

		if (rest.length > 0) {
			this.addToTree(child, rest, summary)
		}
	}

	/**
	 * 生成树形字符串
	 */
	private generateTreeString(node: FileTreeNode, prefix: string, isLast: boolean): string {
		let result = ""

		if (node.path) {
			const connector = isLast ? "└── " : "├── "
			result += prefix + connector + node.name + "\n"
		}

		const children = Array.from(node.children.values())
		const childPrefix = prefix + (isLast ? "    " : "│   ")

		for (let i = 0; i < children.length; i++) {
			const child = children[i]
			const isLastChild = i === children.length - 1
			result += this.generateTreeString(child, childPrefix, isLastChild)
		}

		return result
	}

	/**
	 * 生成JSONL内容
	 */
	private generateJsonlContent(items: any[]): string {
		return items.map((item) => JSON.stringify(item)).join("\n")
	}

	/**
	 * 刷新流
	 */
	private async flushStream(stream: NodeJS.WritableStream): Promise<void> {
		return new Promise((resolve, reject) => {
			stream.write("", (error) => {
				if (error) reject(error)
				else resolve()
			})
		})
	}

	/**
	 * 转义锚点
	 */
	private escapeAnchor(text: string): string {
		return text.replace(/[^a-zA-Z0-9]/g, "-")
	}
}

/**
 * 文件树节点
 */
interface FileTreeNode {
	name: string
	path: string
	type: "file" | "directory"
	children: Map<string, FileTreeNode>
}
