/**
 * Condensing Prompt Helper
 *
 * 提供上下文压缩提示词的获取和 fallback 逻辑。
 * 避免在调用点重复相同的 fallback 代码。
 */

import { getCoStrictCompactPrompt } from "./system"
import type * as vscode from "vscode"

/**
 * 获取有效的压缩提示词
 *
 * Fallback 链：
 * 1. 用户自定义提示词（如果提供且非空）
 * 2. Claude Code 标准 /compact 提示词
 * 3. undefined（让 summarizeConversation 使用内置默认值）
 *
 * @param customPrompt - 用户自定义的压缩提示词
 * @param context - VSCode extension context（用于读取 /compact 提示词）
 * @returns 有效的压缩提示词或 undefined
 */
export async function getEffectiveCondensingPrompt(
	customPrompt: string | undefined,
	context?: vscode.ExtensionContext,
): Promise<string | undefined> {
	// 1. 优先使用用户自定义提示词
	if (customPrompt?.trim()) {
		return customPrompt
	}

	// 2. Fallback 到 Claude Code 标准 /compact 提示词
	if (context) {
		try {
			return await getCoStrictCompactPrompt(context)
		} catch {
			// Silently fallback to undefined if getCoStrictCompactPrompt fails
		}
	}

	// 3. 返回 undefined，让 summarizeConversation 使用内置默认值
	return undefined
}
