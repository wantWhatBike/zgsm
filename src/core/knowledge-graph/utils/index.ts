/**
 * 知识图谱工具函数
 */

import { API_PROVIDER } from "@roo-code/types"
import type { ClineProvider } from "../../webview/ClineProvider"

/**
 * 检查API提供商是否支持知识图谱
 * 统一的检查函数，避免重复代码
 */
export async function isKnowledgeGraphSupported(provider: ClineProvider): Promise<boolean> {
	try {
		const state = await provider.getState()
		return state.apiConfiguration?.apiProvider === API_PROVIDER.ZGSM
	} catch {
		return false
	}
}

/**
 * 获取知识图谱启用状态
 * 同时检查API提供商支持和用户配置
 */
export async function getKnowledgeGraphEnabledState(provider: ClineProvider): Promise<boolean> {
	try {
		const state = await provider.getState()
		// 必须同时满足：API提供商为zgsm 且 用户启用了知识图谱
		const isProviderSupported = state.apiConfiguration?.apiProvider === API_PROVIDER.ZGSM
		const isUserEnabled = state.knowledgeGraphEnabled ?? false
		return isProviderSupported && isUserEnabled
	} catch {
		return false
	}
}

