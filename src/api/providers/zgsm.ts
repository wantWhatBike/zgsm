import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"
import { v7 as uuidv7 } from "uuid"

import {
	type ModelInfo,
	azureOpenAiDefaultApiVersion,
	DEEP_SEEK_DEFAULT_TEMPERATURE,
	OPENAI_AZURE_AI_INFERENCE_PATH,
	zgsmDefaultModelId,
	zgsmModels,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { XmlMatcher } from "../../utils/xml-matcher"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { convertToR1Format } from "../transform/r1-format"
import { convertToSimpleMessages } from "../transform/simple-format"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { ZgsmAuthConfig, ZgsmAuthService } from "../../core/costrict/auth"
import { getClientId } from "../../utils/getClientId"
import { getWorkspacePath } from "../../utils/path"
import { getApiRequestTimeout } from "./utils/timeout-config"
import { getApiResponseRenderMode, renderModes } from "./utils/response-render-config"
import { createLogger, ILogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { COSTRICT_DEFAULT_HEADERS } from "../../shared/headers"
import { handleOpenAIError } from "./utils/openai-error-handler"
import { getModels } from "./fetchers/modelCache"
import { ClineApiReqCancelReason } from "../../shared/ExtensionMessage"

const autoModeModelId = "Auto"

export class ZgsmAiHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI
	private readonly providerName = "zgsm"
	private baseURL: string
	private chatType?: "user" | "system"
	private headers = {}
	private modelInfo = {} as ModelInfo
	private apiResponseRenderModeInfo = renderModes.fast
	private logger: ILogger
	private curStream: any = null

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.logger = createLogger(Package.outputChannel)
		this.baseURL = `${this.options.zgsmBaseUrl?.trim() || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()}/chat-rag/api/v1`
		const apiKey = options.zgsmAccessToken || "not-provided"
		const isAzureAiInference = this._isAzureAiInference(this.baseURL)
		const urlHost = this._getUrlHost(this.baseURL)
		const isAzureOpenAi = urlHost === "azure.com" || urlHost.endsWith(".azure.com") || options.openAiUseAzure

		this.fetchModel()
		this.headers = {
			...COSTRICT_DEFAULT_HEADERS,
			...(this.options.openAiHeaders || {}),
		}
		const timeout = getApiRequestTimeout()
		this.apiResponseRenderModeInfo = getApiResponseRenderMode()
		if (isAzureAiInference) {
			// Azure AI Inference Service (e.g., for DeepSeek) uses a different path structure
			this.client = new OpenAI({
				baseURL: this.baseURL,
				apiKey,
				timeout,
				defaultHeaders: this.headers,
				defaultQuery: { "api-version": this.options.azureApiVersion || "2024-05-01-preview" },
			})
		} else if (isAzureOpenAi) {
			// Azure API shape slightly differs from the core API shape:
			// https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
			this.client = new AzureOpenAI({
				baseURL: this.baseURL,
				apiKey,
				timeout,
				apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
				defaultHeaders: this.headers,
			})
		} else {
			this.client = new OpenAI({
				baseURL: this.baseURL,
				apiKey,
				timeout,
				defaultHeaders: this.headers,
			})
		}
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Performance monitoring log
		const requestId = uuidv7()
		await this.fetchModel()
		const fromWorkflow =
			metadata?.zgsmWorkflowMode ||
			metadata?.mode === "strict" ||
			metadata?.rooTaskMode === "strict" ||
			metadata?.parentTaskMode === "strict"
		this.apiResponseRenderModeInfo = getApiResponseRenderMode()
		// 1. Cache calculation results and configuration
		const { info: modelInfo, reasoning } = this.getModel()
		const modelUrl = this.baseURL || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()
		const modelId = this.options.zgsmModelId || zgsmDefaultModelId
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false
		const enabledLegacyFormat = this.options.openAiLegacyFormat ?? false

		// Cache boolean calculation results
		const isAzureAiInference = this._isAzureAiInference(modelUrl)
		const isDeepseekReasoner = modelId.includes("deepseek-reasoner")
		const deepseekReasoner = isDeepseekReasoner || enabledR1Format
		const isArk = modelUrl.includes(".volces.com")
		const ark = isArk
		const isGrokXAI = this._isGrokXAI(this.baseURL)
		const isO1Family = modelId.includes("o1") || modelId.includes("o3") || modelId.includes("o4")

		// 2. Cache async call results
		const cachedClientId = getClientId()
		const cachedWorkspacePath = getWorkspacePath()

		// 3. Pre-build headers to avoid repeated creation
		const _headers = this.buildHeaders(metadata, requestId, cachedClientId, cachedWorkspacePath)

		// 4. Handle O1 family models
		if (isO1Family) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages)
			return
		}

		try {
			const tokens = await ZgsmAuthService.getInstance().getTokens()
			this.client.apiKey = tokens?.access_token || "not-provided"
		} catch (error) {
			console.warn(
				`[createMessage] getting new tokens failed \n\nuse old tokens: ${this.client.apiKey} \n\n${error.message}`,
			)
		}

		// 5. Handle streaming and non-streaming requests
		if (this.options.openAiStreamingEnabled ?? true) {
			const convertedMessages = this.convertMessages(
				systemPrompt,
				messages,
				deepseekReasoner,
				ark,
				enabledLegacyFormat,
				modelInfo,
			)

			const requestOptions = this.buildStreamingRequestOptions(
				modelId,
				convertedMessages,
				deepseekReasoner,
				isGrokXAI,
				reasoning,
				modelInfo,
			)
			if (fromWorkflow) {
				Object.assign(requestOptions, {
					extra_body: {
						prompt_mode: "strict",
					},
				})
			}
			let stream
			try {
				this.logger.info(`[RequestID]:`, requestId)
				const { data: _stream, response } = await this.client.chat.completions
					.create(
						requestOptions,
						Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
							headers: _headers,
						}),
					)
					.withResponse()
				this.logger.info(`[ResponseID]:`, response.headers.get("x-request-id"))
				stream = _stream
				this.curStream = _stream
				if (this.options.zgsmModelId === autoModeModelId) {
					const userInputHeader = response.headers.get("x-user-input")
					if (userInputHeader) {
						const decodedUserInput = Buffer.from(userInputHeader, "base64").toString("utf-8")
						this.logger.info(`[x-user-input]: ${decodedUserInput}`)
					}
				}
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			// 6. Optimize stream processing - use batch processing and buffer
			yield* this.handleOptimizedStream(stream, modelInfo)
		} else {
			// Non-streaming processing
			const requestOptions = this.buildNonStreamingRequestOptions(
				modelId,
				systemPrompt,
				messages,
				deepseekReasoner,
				enabledLegacyFormat,
				modelInfo,
			)
			if (fromWorkflow) {
				Object.assign(requestOptions, {
					extra_body: {
						prompt_mode: "strict",
					},
				})
			}
			let response
			try {
				this.logger.info(`[RequestID]:`, requestId)
				response = await this.client.chat.completions.create(
					requestOptions,
					Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
						headers: _headers,
					}),
				)
				this.logger.info(`[ResponseId]:`, response._request_id)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}

			yield this.processUsageMetrics(response.usage, modelInfo)
		}
	}

	protected processUsageMetrics(usage: any, _modelInfo?: ModelInfo): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.cache_creation_input_tokens || undefined,
			cacheReadTokens: usage?.cache_read_input_tokens || undefined,
		}
	}

	/**
	 * Build request headers (optimize memory allocation)
	 */
	private buildHeaders(
		metadata: ApiHandlerCreateMessageMetadata | undefined,
		requestId: string,
		clientId: string,
		workspacePath: string,
	): Record<string, string> {
		return {
			"Accept-Language": metadata?.language || "en",
			...this.headers,
			"x-quota-identity": this.chatType || "system",
			"X-Request-ID": requestId,
			"zgsm-task-id": metadata?.taskId || "",
			"zgsm-request-id": requestId,
			"zgsm-client-id": clientId,
			"zgsm-project-path": encodeURI(workspacePath),
		}
	}

	/**
	 * Unified message conversion logic (using strategy pattern)
	 */
	private convertMessages(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		isDeepseekReasoner: boolean,
		isArk: boolean,
		isLegacyFormat: boolean,
		modelInfo: ModelInfo,
	): OpenAI.Chat.ChatCompletionMessageParam[] {
		let convertedMessages: OpenAI.Chat.ChatCompletionMessageParam[]

		if (isDeepseekReasoner) {
			convertedMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
		} else if (isArk || isLegacyFormat) {
			convertedMessages = [{ role: "system", content: systemPrompt }, ...convertToSimpleMessages(messages)]
		} else {
			const systemMessage = modelInfo.supportsPromptCache
				? {
						role: "system" as const,
						content: [
							{
								type: "text" as const,
								text: systemPrompt,
								cache_control: { type: "ephemeral" },
							},
						],
					}
				: { role: "system" as const, content: systemPrompt }

			convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)]
		}

		// Apply cache control logic
		this.applyCacheControlLogic(convertedMessages, modelInfo)

		return convertedMessages
	}

	/**
	 * Apply cache control logic (extracted as separate method)
	 */
	private applyCacheControlLogic(messages: OpenAI.Chat.ChatCompletionMessageParam[], modelInfo: ModelInfo): void {
		if (!modelInfo.supportsPromptCache) {
			return
		}

		const lastTwoUserMessages = messages.filter((msg) => msg.role === "user").slice(-2)

		for (const msg of lastTwoUserMessages) {
			if (typeof msg.content === "string") {
				msg.content = [{ type: "text", text: msg.content }]
			}

			if (Array.isArray(msg.content)) {
				let lastTextPart = msg.content.filter((part) => part.type === "text").pop()

				if (!lastTextPart) {
					lastTextPart = { type: "text", text: "..." }
					msg.content.push(lastTextPart)
				}

				// @ts-ignore-next-line
				lastTextPart["cache_control"] = { type: "ephemeral" }
			}
		}
	}

	/**
	 * Build streaming request options
	 */
	private buildStreamingRequestOptions(
		modelId: string,
		messages: OpenAI.Chat.ChatCompletionMessageParam[],
		isDeepseekReasoner: boolean,
		isGrokXAI: boolean,
		reasoning: any,
		modelInfo: ModelInfo,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			temperature: this.options.modelTemperature ?? (isDeepseekReasoner ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
			messages,
			stream: true as const,
			...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
			...(reasoning && reasoning),
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)
		return requestOptions
	}

	/**
	 * Build non-streaming request options
	 */
	private buildNonStreamingRequestOptions(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		isDeepseekReasoner: boolean,
		isLegacyFormat: boolean,
		modelInfo: ModelInfo,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
		const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
			role: "user",
			content: systemPrompt,
		}

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
			model: modelId,
			messages: isDeepseekReasoner
				? convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
				: isLegacyFormat
					? [systemMessage, ...convertToSimpleMessages(messages)]
					: [systemMessage, ...convertToOpenAiMessages(messages)],
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)
		return requestOptions
	}

	/**
	 * Optimized stream processing method (improves memory usage and performance)
	 */
	private async *handleOptimizedStream(
		stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
		modelInfo: ModelInfo,
	): ApiStream {
		const matcher = new XmlMatcher(
			"think",
			(chunk) =>
				({
					type: chunk.matched ? "reasoning" : "text",
					text: chunk.data,
				}) as const,
		)

		let lastUsage

		// Use content buffer to reduce matcher.update() calls
		const contentBuffer: string[] = []
		let time = Date.now()
		let isPrinted = false

		// chunk
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta ?? {}

			// Cache content for batch processing
			if (delta.content) {
				contentBuffer.push(delta.content)
				if (!isPrinted && chunk.model && this.options.zgsmModelId === autoModeModelId) {
					this.logger.info(`[Current Model]: ${chunk.model}`)
					isPrinted = true
				}
				const now = Date.now()
				// Process in batch when threshold is reached
				if (
					contentBuffer.length >= this.apiResponseRenderModeInfo.limit &&
					time + this.apiResponseRenderModeInfo.interval <= now
				) {
					const batchedContent = contentBuffer.join("")
					for (const processedChunk of matcher.update(batchedContent)) {
						yield processedChunk
					}
					contentBuffer.length = 0 // Clear buffer
					time = now
				}
			}

			// Process reasoning content
			if ("reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					text: (delta.reasoning_content as string | undefined) || "",
				}
			}

			// Cache usage information
			if (chunk.usage) {
				lastUsage = chunk.usage
			}
		}

		// Process remaining content
		if (contentBuffer.length > 0) {
			const remainingContent = contentBuffer.join("")
			for (const processedChunk of matcher.update(remainingContent)) {
				yield processedChunk
			}
		}

		// Output final results
		for (const chunk of matcher.final()) {
			yield chunk
		}

		// Process usage metrics
		if (lastUsage) {
			yield this.processUsageMetrics(lastUsage, modelInfo)
		}
	}

	async fetchModel() {
		const id = this.options.zgsmModelId ?? zgsmDefaultModelId

		this.modelInfo =
			(await getModels({ provider: "zgsm", baseUrl: this.baseURL, apiKey: this.options.zgsmAccessToken }))[id] ||
			zgsmModels.default
	}

	override getModel() {
		const id = this.options.zgsmModelId ?? zgsmDefaultModelId
		const defaultInfo = this.modelInfo
		const info = this.options.useZgsmCustomConfig
			? (this.options.zgsmAiCustomModelInfo ?? defaultInfo)
			: defaultInfo
		const params = getModelParams({ format: "zgsm", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const isAzureAiInference = this._isAzureAiInference(this.baseURL)
			await this.fetchModel()
			const model = this.getModel()
			const modelInfo = model?.info

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: model.id,
				messages: [{ role: "user", content: prompt }],
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)
			let response
			try {
				response = await this.client.chat.completions.create(
					requestOptions,
					isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
				)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`${this.providerName} completion error: ${error.message}`)
			}

			throw error
		}
	}

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		await this.fetchModel()
		const modelInfo = this.getModel()
		const methodIsAzureAiInference = this._isAzureAiInference(this.baseURL)

		if (this.options.openAiStreamingEnabled ?? true) {
			const isGrokXAI = this._isGrokXAI(this.baseURL)

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				stream: true,
				...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
				reasoning_effort: modelInfo.reasoningEffort,
				temperature: undefined,
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo.info)
			let stream
			try {
				stream = await this.client.chat.completions.create(
					requestOptions,
					methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
				)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			yield* this.handleStreamResponse(stream)
		} else {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				reasoning_effort: modelInfo.reasoningEffort,
				temperature: undefined,
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo.info)

			let response
			try {
				response = await this.client.chat.completions.create(
					requestOptions,
					methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
				)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}
			yield this.processUsageMetrics(response.usage)
		}
	}

	private async *handleStreamResponse(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>): ApiStream {
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	private _getUrlHost(baseUrl?: string): string {
		try {
			return new URL(baseUrl ?? "").host
		} catch (error) {
			return ""
		}
	}

	private _isGrokXAI(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.includes("x.ai")
	}

	private _isAzureAiInference(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.endsWith(".services.ai.azure.com")
	}

	/**
	 * Adds max_completion_tokens to the request body if needed based on provider configuration
	 * Note: max_tokens is deprecated in favor of max_completion_tokens as per OpenAI documentation
	 * O3 family models handle max_tokens separately in handleO3FamilyMessage
	 */
	private addMaxTokensIfNeeded(
		requestOptions:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
		modelInfo: ModelInfo,
	): void {
		// Only add max_completion_tokens if includeMaxTokens is true
		if (this.options.includeMaxTokens === true) {
			// Use user-configured modelMaxTokens if available, otherwise fall back to model's default maxTokens
			// Using max_completion_tokens as max_tokens is deprecated
			requestOptions.max_completion_tokens = this.options.modelMaxTokens || modelInfo.maxTokens
		}
	}

	setChatType(type: "user" | "system"): void {
		this.chatType = type
	}

	getChatType() {
		return this.chatType
	}

	cancelChat(type: ClineApiReqCancelReason): void {
		try {
			this.curStream?.controller?.abort?.()
			this.logger.info(`[cancelChat] Cancelled chat request: ${type}`)
		} catch (error) {
			console.log(`Error while cancelling message: ${error}`)
		}
	}
}
