import { Task } from "../../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../../shared/tools"
import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { knowledgeGraphManager } from "../KnowledgeGraphManager"
import { searchFilesTool } from "../../tools/searchFilesTool"
import type { SearchCodesResult } from "../types"

/**
 * 格式化搜索结果为结构化文本
 * @param results 搜索结果
 * @returns 格式化后的文本
 */
function formatSearchCodesResults(results: SearchCodesResult[]): string {
	if (results.length === 0) {
		return "未找到匹配的代码文件。"
	}

	let output = "=== 代码检索结果 ===\n\n"

	let totalFunctions = 0

	results.forEach((result, index) => {
		const fileNumber = index + 1
		output += `文件 #${fileNumber}: ${result.path}\n`

		// 文件概要（新增）
		if (result.summary) {
			output += `  • 概要: ${result.summary}\n`
		}

		// 文件描述
		if (result.description) {
			output += `  • 描述: ${result.description}\n`
		}

		// 文件依赖
		if (result.dependencies && result.dependencies.length > 0) {
			output += `  • 依赖: ${result.dependencies.join(", ")}\n`
		}

		// 匹配的函数
		if (result.match_functions && result.match_functions.length > 0) {
			totalFunctions += result.match_functions.length
			output += `  \n  匹配函数 (${result.match_functions.length}个):\n  \n`

			result.match_functions.forEach((func, funcIndex) => {
				const isLast = funcIndex === result.match_functions.length - 1
				const prefix = isLast ? "  └─ " : "  ├─ "
				const continuationPrefix = isLast ? "      " : "  │   "

				output += `${prefix}${func.name}\n`

				// 函数描述
				if (func.description) {
					output += `${continuationPrefix}描述: ${func.description}\n`
				}

				// 添加空行分隔函数（除了最后一个）
				if (!isLast) {
					output += `${continuationPrefix}\n`
				}
			})
		}

		// 文件级调用链（新增）
		if (result.call_chain && result.call_chain.depth > 0) {
			output += `  \n  文件级调用链 (深度${result.call_chain.depth}):\n`
			// 使用格式化后的调用链文本，添加适当缩进
			const formattedChain = result.call_chain.formatted
				.split('\n')
				.map(line => `  ${line}`)
				.join('\n')
			output += `${formattedChain}\n`
		}

		// 文件之间添加分隔线（除了最后一个）
		if (index < results.length - 1) {
			output += "\n"
		}
	})

	output += `\n---\n找到 ${results.length} 个文件，共 ${totalFunctions} 个匹配函数`

	return output
}

/**
 * 知识图谱代码检索工具
 * 从知识图谱中根据关键字从文件摘要的多个字段中进行全文检索
 */
export async function searchCodesTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const keywordsParam: string | undefined = block.params.keywords
	const typeParam: string | undefined = block.params.type
	const maxResultsParam: string | undefined = block.params.max_results
	const maxDepthParam: string | undefined = block.params.max_depth

	const sharedMessageProps: ClineSayTool = {
		tool: "searchCodes",
		keywords: removeClosingTag("keywords", keywordsParam),
		type: removeClosingTag("type", typeParam),
		maxResults: removeClosingTag("max_results", maxResultsParam),
		maxDepth: removeClosingTag("max_depth", maxDepthParam),
	}

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" } satisfies ClineSayTool)
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		} else {
			// 1. 参数校验
			if (!keywordsParam) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("search_codes")
				pushToolResult(await cline.sayAndCreateMissingParamError("search_codes", "keywords"))
				return
			}

			// 解析关键词数组
			let keywords: string[]
			try {
				keywords = JSON.parse(keywordsParam)
				if (!Array.isArray(keywords) || keywords.length === 0) {
					throw new Error("keywords must be a non-empty array")
				}
				// 限制关键词数量不超过10个
				if (keywords.length > 10) {
					keywords = keywords.slice(0, 10)
				}
			} catch (error) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("search_codes")
				pushToolResult(
					`Error: keywords parameter must be a valid JSON array of strings. Example: ["function", "handler"]`,
				)
				return
			}

			// 校验 type 参数
			const type = (typeParam || "precise") as "precise" | "fuzzy"
			if (type !== "precise" && type !== "fuzzy") {
				cline.consecutiveMistakeCount++
				cline.recordToolError("search_codes")
				pushToolResult(`Error: type parameter must be either "precise" or "fuzzy". Got: ${type}`)
				return
			}

			// 解析 maxResults 参数
			const maxResults = maxResultsParam ? parseInt(maxResultsParam, 10) : 5
			if (isNaN(maxResults) || maxResults <= 0) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("search_codes")
				pushToolResult(`Error: max_results must be a positive integer. Got: ${maxResultsParam}`)
				return
			}

			// 解析 maxDepth 参数
			const maxDepth = maxDepthParam ? parseInt(maxDepthParam, 10) : 5
			if (isNaN(maxDepth) || maxDepth < 1 || maxDepth > 10) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("search_codes")
				pushToolResult(`Error: max_depth must be an integer between 1 and 10. Got: ${maxDepthParam}`)
				return
			}

			// 2. 知识图谱检查
			const isInitialized = knowledgeGraphManager.isManagerInitialized()
			if (!isInitialized) {
				// 知识图谱未初始化，降级到 search_files
				cline.say(
					"text",
					"Knowledge graph is not initialized. Falling back to search_files tool...",
					undefined,
					false,
				)

				// 使用第一个关键词作为 regex，降级调用 searchFilesTool
				const fallbackBlock = {
					...block,
					name: "search_files" as const,
					params: {
						path: ".",
						regex: keywords[0],
					},
				}
				return await searchFilesTool(cline, fallbackBlock, askApproval, handleError, pushToolResult, removeClosingTag)
			}

			const graphRetriever = knowledgeGraphManager.getGraphRetriever()
			if (!graphRetriever) {
				// 知识图谱检索器不可用，降级到 search_files
				cline.say(
					"text",
					"Knowledge graph retriever is not available. Falling back to search_files tool...",
					undefined,
					false,
				)

				const fallbackBlock = {
					...block,
					name: "search_files" as const,
					params: {
						path: ".",
						regex: keywords[0],
					},
				}
				return await searchFilesTool(cline, fallbackBlock, askApproval, handleError, pushToolResult, removeClosingTag)
			}

		// 3. 执行知识图谱检索
		cline.consecutiveMistakeCount = 0

		const results = await graphRetriever.searchFileSummaries(keywords, type, maxResults, maxDepth)

		// 4. 格式化结果为结构化文本
		const formattedText = formatSearchCodesResults(results)

		// 5. 直接返回结果给 AI（无需用户审批）
		pushToolResult(formattedText)

		return
		}
	} catch (error) {
		await handleError("searching codes", error)
		return
	}
}

