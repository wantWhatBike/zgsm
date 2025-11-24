import { Task } from "../../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../../shared/tools"
import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { knowledgeGraphManager } from "../KnowledgeGraphManager"
import { searchFilesTool } from "../../tools/searchFilesTool"

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

	const sharedMessageProps: ClineSayTool = {
		tool: "searchCodes",
		keywords: removeClosingTag("keywords", keywordsParam),
		type: removeClosingTag("type", typeParam),
		maxResults: removeClosingTag("max_results", maxResultsParam),
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

			const results = await graphRetriever.searchFileSummaries(keywords, type, maxResults)

			// 4. 格式化结果
			const formattedResults = JSON.stringify(results, null, 2)

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: formattedResults,
			} satisfies ClineSayTool)

			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				return
			}

			pushToolResult(formattedResults)

			return
		}
	} catch (error) {
		await handleError("searching codes", error)
		return
	}
}

