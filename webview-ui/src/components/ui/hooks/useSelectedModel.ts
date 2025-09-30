import {
	type ProviderName,
	type ProviderSettings,
	type ModelInfo,
	anthropicDefaultModelId,
	anthropicModels,
	bedrockDefaultModelId,
	bedrockModels,
	cerebrasDefaultModelId,
	cerebrasModels,
	deepSeekDefaultModelId,
	deepSeekModels,
	moonshotDefaultModelId,
	moonshotModels,
	geminiDefaultModelId,
	geminiModels,
	mistralDefaultModelId,
	mistralModels,
	openAiModelInfoSaneDefaults,
	openAiNativeDefaultModelId,
	openAiNativeModels,
	vertexDefaultModelId,
	vertexModels,
	xaiDefaultModelId,
	xaiModels,
	groqModels,
	groqDefaultModelId,
	chutesModels,
	chutesDefaultModelId,
	vscodeLlmModels,
	vscodeLlmDefaultModelId,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	glamaDefaultModelId,
	unboundDefaultModelId,
	litellmDefaultModelId,
	claudeCodeDefaultModelId,
	claudeCodeModels,
	zgsmDefaultModelId,
	geminiCliDefaultModelId,
	geminiCliModels,
	sambaNovaModels,
	sambaNovaDefaultModelId,
	doubaoModels,
	doubaoDefaultModelId,
	internationalZAiDefaultModelId,
	mainlandZAiDefaultModelId,
	internationalZAiModels,
	mainlandZAiModels,
	fireworksModels,
	fireworksDefaultModelId,
	zgsmModels,
	featherlessModels,
	featherlessDefaultModelId,
	ioIntelligenceDefaultModelId,
	ioIntelligenceModels,
	rooDefaultModelId,
	rooModels,
	qwenCodeDefaultModelId,
	qwenCodeModels,
	vercelAiGatewayDefaultModelId,
	BEDROCK_1M_CONTEXT_MODEL_IDS,
	deepInfraDefaultModelId,
} from "@roo-code/types"

import type { ModelRecord, RouterModels } from "@roo/api"

import { useRouterModels } from "./useRouterModels"
import { useOpenRouterModelProviders } from "./useOpenRouterModelProviders"
import { useLmStudioModels } from "./useLmStudioModels"

import { useOllamaModels } from "./useOllamaModels"

export const useSelectedModel = (apiConfiguration?: ProviderSettings) => {
	const provider = apiConfiguration?.apiProvider || "zgsm"
	const openRouterModelId = provider === "openrouter" ? apiConfiguration?.openRouterModelId : undefined
	const lmStudioModelId = provider === "lmstudio" ? apiConfiguration?.lmStudioModelId : undefined
	const ollamaModelId = provider === "ollama" ? apiConfiguration?.ollamaModelId : undefined

	const routerModels = useRouterModels()
	const openRouterModelProviders = useOpenRouterModelProviders(openRouterModelId)
	const lmStudioModels = useLmStudioModels(lmStudioModelId)
	const ollamaModels = useOllamaModels(ollamaModelId)
	const { id, info } =
		apiConfiguration &&
		(typeof lmStudioModelId === "undefined" || typeof lmStudioModels.data !== "undefined") &&
		(typeof ollamaModelId === "undefined" || typeof ollamaModels.data !== "undefined") &&
		typeof routerModels.data !== "undefined" &&
		typeof openRouterModelProviders.data !== "undefined"
			? getSelectedModel({
					provider,
					apiConfiguration,
					routerModels: routerModels.data,
					openRouterModelProviders: openRouterModelProviders.data,
					lmStudioModels: lmStudioModels.data,
					ollamaModels: ollamaModels.data,
				})
			: {
					id: apiConfiguration?.zgsmModelId || apiConfiguration?.apiModelId || zgsmDefaultModelId,
					info: getZgsmModelFeedback({ apiConfiguration }, zgsmModels.default),
				}

	return {
		provider,
		id,
		info,
		isLoading:
			routerModels.isLoading ||
			openRouterModelProviders.isLoading ||
			(apiConfiguration?.lmStudioModelId && lmStudioModels!.isLoading),
		isError:
			routerModels.isError ||
			openRouterModelProviders.isError ||
			(apiConfiguration?.lmStudioModelId && lmStudioModels!.isError),
	}
}

function getZgsmModelFeedback(
	config: {
		provider?: ProviderName
		apiConfiguration?: ProviderSettings
	},
	defaultModelInfo: ModelInfo,
): ModelInfo {
	const { apiConfiguration } = config
	if (
		apiConfiguration?.useZgsmCustomConfig &&
		apiConfiguration?.zgsmAiCustomModelInfo &&
		JSON.stringify(apiConfiguration.zgsmAiCustomModelInfo) !== "{}"
	) {
		return apiConfiguration.zgsmAiCustomModelInfo
	}
	return defaultModelInfo
}

function getSelectedModel({
	provider,
	apiConfiguration,
	routerModels,
	openRouterModelProviders,
	lmStudioModels,
	ollamaModels,
}: {
	provider: ProviderName
	apiConfiguration: ProviderSettings
	routerModels: RouterModels
	openRouterModelProviders: Record<string, ModelInfo>
	lmStudioModels: ModelRecord | undefined
	ollamaModels: ModelRecord | undefined
}): { id: string; info: ModelInfo | undefined } {
	// the `undefined` case are used to show the invalid selection to prevent
	// users from seeing the default model if their selection is invalid
	// this gives a better UX than showing the default model
	switch (provider) {
		case "zgsm": {
			const id = apiConfiguration.zgsmModelId || apiConfiguration.apiModelId || zgsmDefaultModelId
			const info = getZgsmModelFeedback({ apiConfiguration }, routerModels.zgsm[id] || zgsmModels.default)

			return { id, info }
		}
		case "openrouter": {
			const id = apiConfiguration.openRouterModelId ?? openRouterDefaultModelId
			let info = routerModels.openrouter[id]
			const specificProvider = apiConfiguration.openRouterSpecificProvider

			if (specificProvider && openRouterModelProviders[specificProvider]) {
				// Overwrite the info with the specific provider info. Some
				// fields are missing the model info for `openRouterModelProviders`
				// so we need to merge the two.
				info = info
					? { ...info, ...openRouterModelProviders[specificProvider] }
					: openRouterModelProviders[specificProvider]
			}

			return { id, info }
		}
		case "requesty": {
			const id = apiConfiguration.requestyModelId ?? requestyDefaultModelId
			const info = routerModels.requesty[id]
			return { id, info }
		}
		case "glama": {
			const id = apiConfiguration.glamaModelId ?? glamaDefaultModelId
			const info = routerModels.glama[id]
			return { id, info }
		}
		case "unbound": {
			const id = apiConfiguration.unboundModelId ?? unboundDefaultModelId
			const info = routerModels.unbound[id]
			return { id, info }
		}
		case "litellm": {
			const id = apiConfiguration.litellmModelId ?? litellmDefaultModelId
			const info = routerModels.litellm[id]
			return { id, info }
		}
		case "xai": {
			const id = apiConfiguration.apiModelId ?? xaiDefaultModelId
			const info = xaiModels[id as keyof typeof xaiModels]
			return info ? { id, info } : { id, info: undefined }
		}
		case "groq": {
			const id = apiConfiguration.apiModelId ?? groqDefaultModelId
			const info = groqModels[id as keyof typeof groqModels]
			return { id, info }
		}
		case "huggingface": {
			const id = apiConfiguration.huggingFaceModelId ?? "meta-llama/Llama-3.3-70B-Instruct"
			const info = {
				maxTokens: 8192,
				contextWindow: 131072,
				supportsImages: false,
				supportsPromptCache: false,
			}
			return { id, info }
		}
		case "chutes": {
			const id = apiConfiguration.apiModelId ?? chutesDefaultModelId
			const info = chutesModels[id as keyof typeof chutesModels]
			return { id, info }
		}
		case "bedrock": {
			const id = apiConfiguration.apiModelId ?? bedrockDefaultModelId
			const baseInfo = bedrockModels[id as keyof typeof bedrockModels]

			// Special case for custom ARN.
			if (id === "custom-arn") {
				return {
					id,
					info: { maxTokens: 5000, contextWindow: 128_000, supportsPromptCache: false, supportsImages: true },
				}
			}

			// Apply 1M context for Claude Sonnet 4 / 4.5 when enabled
			if (BEDROCK_1M_CONTEXT_MODEL_IDS.includes(id as any) && apiConfiguration.awsBedrock1MContext && baseInfo) {
				// Create a new ModelInfo object with updated context window
				const info: ModelInfo = {
					...baseInfo,
					contextWindow: 1_000_000,
				}
				return { id, info }
			}

			return { id, info: baseInfo }
		}
		case "vertex": {
			const id = apiConfiguration.apiModelId ?? vertexDefaultModelId
			const info = vertexModels[id as keyof typeof vertexModels]
			return { id, info }
		}
		case "gemini": {
			const id = apiConfiguration.apiModelId ?? geminiDefaultModelId
			const info = geminiModels[id as keyof typeof geminiModels]
			return { id, info }
		}
		case "gemini-cli": {
			const id = apiConfiguration.apiModelId ?? geminiCliDefaultModelId
			const info = geminiCliModels[id as keyof typeof geminiCliModels]
			return { id, info }
		}
		case "deepseek": {
			const id = apiConfiguration.apiModelId ?? deepSeekDefaultModelId
			const info = deepSeekModels[id as keyof typeof deepSeekModels]
			return { id, info }
		}
		case "doubao": {
			const id = apiConfiguration.apiModelId ?? doubaoDefaultModelId
			const info = doubaoModels[id as keyof typeof doubaoModels]
			return { id, info }
		}
		case "moonshot": {
			const id = apiConfiguration.apiModelId ?? moonshotDefaultModelId
			const info = moonshotModels[id as keyof typeof moonshotModels]
			return { id, info }
		}
		case "zai": {
			const isChina = apiConfiguration.zaiApiLine === "china"
			const models = isChina ? mainlandZAiModels : internationalZAiModels
			const defaultModelId = isChina ? mainlandZAiDefaultModelId : internationalZAiDefaultModelId
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = models[id as keyof typeof models]
			return { id, info }
		}
		case "openai-native": {
			const id = apiConfiguration.apiModelId ?? openAiNativeDefaultModelId
			const info = openAiNativeModels[id as keyof typeof openAiNativeModels]
			return { id, info }
		}
		case "mistral": {
			const id = apiConfiguration.apiModelId ?? mistralDefaultModelId
			const info = mistralModels[id as keyof typeof mistralModels]
			return { id, info }
		}
		case "openai": {
			const id = apiConfiguration.openAiModelId ?? ""
			const info = apiConfiguration?.openAiCustomModelInfo ?? openAiModelInfoSaneDefaults
			return { id, info }
		}
		case "ollama": {
			const id = apiConfiguration.ollamaModelId ?? ""
			const info = ollamaModels && ollamaModels[apiConfiguration.ollamaModelId!]

			const adjustedInfo =
				info?.contextWindow &&
				apiConfiguration?.ollamaNumCtx &&
				apiConfiguration.ollamaNumCtx < info.contextWindow
					? { ...info, contextWindow: apiConfiguration.ollamaNumCtx }
					: info

			return {
				id,
				info: adjustedInfo || undefined,
			}
		}
		case "lmstudio": {
			const id = apiConfiguration.lmStudioModelId ?? ""
			const info = lmStudioModels && lmStudioModels[apiConfiguration.lmStudioModelId!]
			return {
				id,
				info: info || undefined,
			}
		}
		case "deepinfra": {
			const id = apiConfiguration.deepInfraModelId ?? deepInfraDefaultModelId
			const info = routerModels.deepinfra?.[id]
			return { id, info }
		}
		case "vscode-lm": {
			const id = apiConfiguration?.vsCodeLmModelSelector
				? `${apiConfiguration.vsCodeLmModelSelector.vendor}/${apiConfiguration.vsCodeLmModelSelector.family}`
				: vscodeLlmDefaultModelId
			const modelFamily = apiConfiguration?.vsCodeLmModelSelector?.family ?? vscodeLlmDefaultModelId
			const info = vscodeLlmModels[modelFamily as keyof typeof vscodeLlmModels]
			return { id, info: { ...openAiModelInfoSaneDefaults, ...info, supportsImages: false } } // VSCode LM API currently doesn't support images.
		}
		case "claude-code": {
			// Claude Code models extend anthropic models but with images and prompt caching disabled
			const id = apiConfiguration.apiModelId ?? claudeCodeDefaultModelId
			const info = claudeCodeModels[id as keyof typeof claudeCodeModels]
			return { id, info: { ...openAiModelInfoSaneDefaults, ...info } }
		}
		case "cerebras": {
			const id = apiConfiguration.apiModelId ?? cerebrasDefaultModelId
			const info = cerebrasModels[id as keyof typeof cerebrasModels]
			return { id, info }
		}
		case "sambanova": {
			const id = apiConfiguration.apiModelId ?? sambaNovaDefaultModelId
			const info = sambaNovaModels[id as keyof typeof sambaNovaModels]
			return { id, info }
		}
		case "fireworks": {
			const id = apiConfiguration.apiModelId ?? fireworksDefaultModelId
			const info = fireworksModels[id as keyof typeof fireworksModels]
			return { id, info }
		}
		case "featherless": {
			const id = apiConfiguration.apiModelId ?? featherlessDefaultModelId
			const info = featherlessModels[id as keyof typeof featherlessModels]
			return { id, info }
		}
		case "io-intelligence": {
			const id = apiConfiguration.ioIntelligenceModelId ?? ioIntelligenceDefaultModelId
			const info =
				routerModels["io-intelligence"]?.[id] ?? ioIntelligenceModels[id as keyof typeof ioIntelligenceModels]
			return { id, info }
		}
		case "roo": {
			const requestedId = apiConfiguration.apiModelId

			// Check if the requested model exists in rooModels
			if (requestedId && rooModels[requestedId as keyof typeof rooModels]) {
				return {
					id: requestedId,
					info: rooModels[requestedId as keyof typeof rooModels],
				}
			}

			// Fallback to default model if requested model doesn't exist or is not specified
			return {
				id: rooDefaultModelId,
				info: rooModels[rooDefaultModelId as keyof typeof rooModels],
			}
		}
		case "qwen-code": {
			const id = apiConfiguration.apiModelId ?? qwenCodeDefaultModelId
			const info = qwenCodeModels[id as keyof typeof qwenCodeModels]
			return { id, info }
		}
		case "vercel-ai-gateway": {
			const id = apiConfiguration.vercelAiGatewayModelId ?? vercelAiGatewayDefaultModelId
			const info = routerModels["vercel-ai-gateway"]?.[id]
			return { id, info }
		}
		// case "anthropic":
		// case "human-relay":
		// case "fake-ai":
		default: {
			provider satisfies "anthropic" | "gemini-cli" | "qwen-code" | "human-relay" | "fake-ai"
			const id = apiConfiguration.apiModelId ?? anthropicDefaultModelId
			const baseInfo = anthropicModels[id as keyof typeof anthropicModels]

			// Apply 1M context beta tier pricing for Claude Sonnet 4
			if (
				provider === "anthropic" &&
				id === "claude-sonnet-4-20250514" &&
				apiConfiguration.anthropicBeta1MContext &&
				baseInfo
			) {
				// Type assertion since we know claude-sonnet-4-20250514 has tiers
				const modelWithTiers = baseInfo as typeof baseInfo & {
					tiers?: Array<{
						contextWindow: number
						inputPrice?: number
						outputPrice?: number
						cacheWritesPrice?: number
						cacheReadsPrice?: number
					}>
				}
				const tier = modelWithTiers.tiers?.[0]
				if (tier) {
					// Create a new ModelInfo object with updated values
					const info: ModelInfo = {
						...baseInfo,
						contextWindow: tier.contextWindow,
						inputPrice: tier.inputPrice ?? baseInfo.inputPrice,
						outputPrice: tier.outputPrice ?? baseInfo.outputPrice,
						cacheWritesPrice: tier.cacheWritesPrice ?? baseInfo.cacheWritesPrice,
						cacheReadsPrice: tier.cacheReadsPrice ?? baseInfo.cacheReadsPrice,
					}
					return { id, info }
				}
			}

			return { id, info: baseInfo }
		}
	}
}
