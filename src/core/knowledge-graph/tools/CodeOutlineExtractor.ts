/**
 * 代码大纲提取工具
 * 复用 tree-sitter 功能，提取文件的结构大纲
 */

import * as path from "path"
import * as fs from "fs/promises"
import { parseSourceCodeDefinitionsForFile } from "../../../services/tree-sitter"
import { truncateDefinitionsToLineLimit } from "../../tools/helpers/truncateDefinitions"
import { ILogger } from "../../../utils/logger"

export interface CodeOutlineResult {
	outline: string | null  // 代码大纲，如果提取失败则为 null
	lines: number           // 文件行数
	length: number          // 文件字符数
}

export interface CodeOutlineOptions {
	maxDefinitionLines?: number  // 最大大纲行数，默认 100
}

/**
 * 代码大纲提取器
 * 负责从源代码文件中提取结构化大纲
 */
export class CodeOutlineExtractor {
	private logger: ILogger
	private defaultMaxLines: number

	constructor(logger: ILogger, defaultMaxLines: number = 100) {
		this.logger = logger
		this.defaultMaxLines = defaultMaxLines
	}

	/**
	 * 提取文件的代码大纲
	 * @param filePath 文件路径（绝对路径）
	 * @param options 提取选项
	 * @returns 大纲结果（包含大纲文本、行数、字符数）
	 */
	async extract(filePath: string, options?: CodeOutlineOptions): Promise<CodeOutlineResult> {
		const maxLines = options?.maxDefinitionLines ?? this.defaultMaxLines

		try {
			// 1. 读取文件内容以获取元信息
			const fileContent = await fs.readFile(filePath, 'utf-8')
			const lines = fileContent.split('\n').length
			const length = fileContent.length

			// 2. 使用 tree-sitter 提取定义
			let outline: string | null = null
			
			try {
				// parseSourceCodeDefinitionsForFile 已包含 tree-sitter 解析逻辑
				const definitions = await parseSourceCodeDefinitionsForFile(filePath, undefined)
				
				if (definitions) {
					// 3. 如果提取成功，截断到指定行数
					outline = truncateDefinitionsToLineLimit(definitions, maxLines)
				} else {
					// tree-sitter 不支持该文件类型，使用 fallback
					outline = await this.fallbackExtract(fileContent, maxLines)
				}
			} catch (error) {
				this.logger.warn(`[CodeOutlineExtractor] tree-sitter 解析失败: ${filePath}`, error)
				// 解析失败，使用 fallback
				outline = await this.fallbackExtract(fileContent, maxLines)
			}

			return {
				outline,
				lines,
				length
			}
		} catch (error) {
			this.logger.error(`[CodeOutlineExtractor] 文件读取失败: ${filePath}`, error)
			return {
				outline: null,
				lines: 0,
				length: 0
			}
		}
	}

	/**
	 * Fallback：直接取文件前 N 行作为大纲
	 * 用于不支持 tree-sitter 的文件类型
	 */
	private async fallbackExtract(fileContent: string, maxLines: number): Promise<string> {
		const lines = fileContent.split('\n')
		const truncated = lines.slice(0, maxLines)
		
		let result = truncated.join('\n')
		
		if (lines.length > maxLines) {
			result += `\n\n... (truncated ${lines.length - maxLines} lines)`
		}
		
		return result
	}

	/**
	 * 批量提取多个文件的大纲
	 * @param filePaths 文件路径列表
	 * @param options 提取选项
	 * @returns 大纲结果映射表（路径 -> 结果）
	 */
	async extractBatch(
		filePaths: string[],
		options?: CodeOutlineOptions
	): Promise<Map<string, CodeOutlineResult>> {
		const results = new Map<string, CodeOutlineResult>()

		for (const filePath of filePaths) {
			const result = await this.extract(filePath, options)
			results.set(filePath, result)
		}

		return results
	}
}

