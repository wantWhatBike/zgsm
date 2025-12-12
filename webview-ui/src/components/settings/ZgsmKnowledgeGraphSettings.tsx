import { useEffect, useRef, useCallback, useMemo, useReducer, useState } from "react"
import { FileText, AlertCircle, Play, Pause, Trash, Loader2, Network, Info } from "lucide-react"
import { format } from "date-fns"

import { VSCodeCheckbox, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "@/utils/vscode"
import { Button, Progress, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Badge, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Collapsible, CollapsibleTrigger, CollapsibleContent, Slider } from "@/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useEvent } from "react-use"
import {
	KnowledgeGraphBuildState,
	KNOWLEDGE_GRAPH_MESSAGES,
	API_PROVIDER,
	KNOWLEDGE_GRAPH_STATUS,
	KNOWLEDGE_GRAPH_PHASE,
	KNOWLEDGE_GRAPH_UI_CONFIG,
} from "@roo-code/types"

// 前端UI常量 - 使用统一配置
// ✅ 轮询间隔配置
const POLLING_INTERVAL_RUNNING = 2000 // 运行时 2 秒轮询
const POLLING_INTERVAL_AUTO_REBUILD = 5000 // 自动构建启用时 5 秒轮询

const DEBOUNCE_DELAY = KNOWLEDGE_GRAPH_UI_CONFIG.DEBOUNCE_DELAY
const OPERATION_TIMEOUT = KNOWLEDGE_GRAPH_UI_CONFIG.OPERATION_TIMEOUT

// 状态机定义
type UIState = {
	knowledgeGraphStatus: KnowledgeGraphBuildState
	isOperating: boolean
}

type UIAction =
	| { type: "UPDATE_STATUS"; payload: KnowledgeGraphBuildState }
	| { type: "SET_OPERATING"; payload: boolean }
	| { type: "RESET_TO_DEFAULT" }

// UI Action 类型常量
const UI_ACTIONS = {
	UPDATE_STATUS: "UPDATE_STATUS",
	SET_OPERATING: "SET_OPERATING",
	RESET_TO_DEFAULT: "RESET_TO_DEFAULT",
} as const

// 默认状态生成函数
const createDefaultBuildState = (): KnowledgeGraphBuildState => ({
	progress: 0,
	totalFiles: 0,
	totalFilesToProcess: 0,
	processedFiles: 0,
	failedFiles: 0,
	currentFile: "",
	status: KNOWLEDGE_GRAPH_STATUS.PENDING,
	phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
	lastUpdateTime: new Date().toISOString(),
	totalDuration: 0,
})

// 状态机Reducer - 统一状态管理
const uiStateReducer = (state: UIState, action: UIAction): UIState => {
	switch (action.type) {
		case UI_ACTIONS.UPDATE_STATUS:
			return {
				...state,
				knowledgeGraphStatus: action.payload,
				isOperating: false,
			}
		case UI_ACTIONS.SET_OPERATING:
			return { ...state, isOperating: action.payload }
		case UI_ACTIONS.RESET_TO_DEFAULT:
			return {
				...state,
				knowledgeGraphStatus: createDefaultBuildState(),
				isOperating: false,
			}
		default:
			return state
	}
}

// 状态配置 - 统一管理图标和文本键
const STATUS_CONFIG = {
	[KNOWLEDGE_GRAPH_STATUS.RUNNING]: {
		icon: "w-3 h-3 bg-yellow-500 rounded-full animate-pulse",
		textKey: "knowledgegraph:statusRunning",
	},
	[KNOWLEDGE_GRAPH_STATUS.PENDING]: {
		icon: "w-3 h-3 bg-gray-400 rounded-full animate-pulse",
		textKey: "knowledgegraph:statusPending",
	},
	[KNOWLEDGE_GRAPH_STATUS.COMPLETED]: {
		icon: "w-3 h-3 bg-green-500 rounded-full",
		textKey: "knowledgegraph:statusSuccess",
	},
	[KNOWLEDGE_GRAPH_STATUS.ERROR]: {
		icon: "w-3 h-3 bg-red-500 rounded-full",
		textKey: "knowledgegraph:statusFailed",
	},
	[KNOWLEDGE_GRAPH_STATUS.PAUSED]: {
		icon: "w-3 h-3 bg-orange-500 rounded-full",
		textKey: "knowledgegraph:statusPaused",
	},
	[KNOWLEDGE_GRAPH_STATUS.INTERRUPTED]: {
		icon: "w-3 h-3 bg-purple-500 rounded-full",
		textKey: "knowledgegraph:statusInterrupted",
	},
} as const

// 防抖Hook
const useDebounce = <T extends (...args: any[]) => void>(callback: T, delay: number): T => {
	const timeoutRef = useRef<NodeJS.Timeout>()

	return useCallback(
		(...args: Parameters<T>) => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
			timeoutRef.current = setTimeout(() => callback(...args), delay)
		},
		[callback, delay],
	) as T
}

interface KnowledgeGraphSettingsProps {
	knowledgeGraphEnabled?: boolean
	knowledgeGraphAutoRebuildEnabled?: boolean
	knowledgeGraphAutoRebuildIntervalMinutes?: number
	knowledgeGraphIncludeTestFiles?: boolean
	knowledgeGraphMaxVisualizationFiles?: number
	knowledgeGraphContextWindowSize?: number
	knowledgeGraphContextWindowThreshold?: number
	knowledgeGraphLlmTimeoutMs?: number
	knowledgeGraphLlmMaxRetries?: number
	// ✅ 方案 C: 不再使用 setCachedStateField，直接发送消息
	setKgSettings?: React.Dispatch<React.SetStateAction<{
		autoRebuildEnabled: boolean
		autoRebuildIntervalMinutes: number
		includeTestFiles: boolean
		maxVisualizationFiles: number
		contextWindowSize: number
		contextWindowThreshold: number
		llmTimeoutMs: number
		llmMaxRetries: number
	}>>
}

export const KnowledgeGraphSettings = ({
	knowledgeGraphEnabled,
	knowledgeGraphAutoRebuildEnabled,
	knowledgeGraphAutoRebuildIntervalMinutes,
	knowledgeGraphIncludeTestFiles,
	knowledgeGraphMaxVisualizationFiles,
	knowledgeGraphContextWindowSize,
	knowledgeGraphContextWindowThreshold,
	knowledgeGraphLlmTimeoutMs,
	knowledgeGraphLlmMaxRetries,
	setKgSettings,
}: KnowledgeGraphSettingsProps) => {
	const { t } = useAppTranslation()
	const { knowledgeGraphStatus: initialStatus, apiConfiguration, cwd } = useExtensionState()

	// 使用状态机管理UI状态
	const [uiState, dispatch] = useReducer(uiStateReducer, {
		knowledgeGraphStatus: initialStatus || createDefaultBuildState(),
		isOperating: false,
	})

	// 清空确认对话框状态
	const [showClearConfirm, setShowClearConfirm] = useState(false)
	
	// ✅ 启用确认对话框状态
	const [showEnableConfirm, setShowEnableConfirm] = useState(false)

	// 高级设置折叠状态
	const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)

	// ✅ 知识图谱开关状态（受控组件）- 必须在使用之前声明
	// 注意：不能依赖 props，因为 props 可能不是最新的（单向通信）
	// 组件挂载时会通过 useEffect 从 ExtensionState 同步
	const [localChecked, setLocalChecked] = useState(false)

	// 检查是否为支持的API提供者 - 使用共享常量
	const isZgsmProvider = useMemo(
		() => apiConfiguration?.apiProvider === API_PROVIDER.ZGSM,
		[apiConfiguration?.apiProvider],
	)

	// Check if should disable checkbox - when API provider is not zgsm, no cwd, or running
	const shouldDisableCheckbox = useMemo(
		() =>
			!isZgsmProvider ||
			!cwd ||
			uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING,
		[isZgsmProvider, cwd, uiState.knowledgeGraphStatus.status],
	)


	// Use useMemo to avoid unnecessary state updates
	const shouldDisableAll = useMemo(
		() => !isZgsmProvider || !cwd || !localChecked || showClearConfirm || showEnableConfirm,
		[isZgsmProvider, cwd, localChecked, showClearConfirm, showEnableConfirm],
	)

	// 统一的消息发送函数
	const sendMessage = useCallback((type: string, payload?: any) => {
		vscode.postMessage({ type, ...payload })
	}, [])

	// 获取状态
	const getStatusOnce = useCallback(() => {
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.GET_STATUS)
	}, [sendMessage])

	// ✅ 智能轮询控制：RUNNING 状态 2 秒轮询，自动构建启用时 5 秒轮询
	useEffect(() => {
		let timeoutId: NodeJS.Timeout | null = null
		let isMounted = true

		const poll = () => {
			if (!isMounted) return

			const isRunning = uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING
			const shouldPoll = localChecked && isZgsmProvider && cwd && 
				(isRunning || knowledgeGraphAutoRebuildEnabled)

			if (shouldPoll) {
				getStatusOnce()
				// ✅ RUNNING 状态 2 秒，自动构建启用时 5 秒
				const interval = isRunning ? POLLING_INTERVAL_RUNNING : POLLING_INTERVAL_AUTO_REBUILD
				timeoutId = setTimeout(poll, interval)
			}
		}

		// 启动轮询（如果状态是 RUNNING 或启用了自动构建）
		const shouldStartPolling = 
			localChecked &&
			isZgsmProvider &&
			cwd &&
			(uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING || knowledgeGraphAutoRebuildEnabled)

		if (shouldStartPolling) {
			// 注：这里不延迟，因为只有在已经 RUNNING 或自动构建时才轮询
			// 初始状态获取已经在上面的 useEffect 中延迟了
			poll()
		}

		return () => {
			isMounted = false
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
		}
	}, [localChecked, isZgsmProvider, cwd, knowledgeGraphAutoRebuildEnabled, getStatusOnce, uiState.knowledgeGraphStatus.status])

	// 操作超时保护 - 防止 isOperating 卡死
	useEffect(() => {
		let timeoutId: NodeJS.Timeout
		if (uiState.isOperating) {
			timeoutId = setTimeout(() => {
				dispatch({ type: UI_ACTIONS.SET_OPERATING, payload: false })
			}, OPERATION_TIMEOUT)
		}
		return () => clearTimeout(timeoutId)
	}, [uiState.isOperating])

	// 初始状态获取 - 延迟 2 秒给后台初始化时间
	useEffect(() => {
		if (!localChecked || !isZgsmProvider || !cwd) {
			return
		}
		
		// 延迟 2 秒后获取初始状态，避免后台未初始化完成
		const timer = setTimeout(() => {
			getStatusOnce()
		}, 2000)
		
		return () => clearTimeout(timer)
	}, [localChecked, isZgsmProvider, cwd, getStatusOnce])

	// 仅在组件挂载时从 ExtensionState 同步一次
	// 之后由用户操作驱动（乐观更新），不响应 ExtensionState 变化
	// 这样既能在打开设置页面时获取正确状态，又不会在操作时被覆盖
	const mountedRef = useRef(false)
	useEffect(() => {
		if (!mountedRef.current) {
			setLocalChecked(knowledgeGraphEnabled ?? false)
			mountedRef.current = true
		}
	}, [knowledgeGraphEnabled])
	
	// ✅ 统一的状态设置函数（DRY 原则）
	const updateKnowledgeGraphEnabled = useCallback((enabled: boolean) => {
		setLocalChecked(enabled)
		vscode.postMessage({ 
			type: "setKnowledgeGraphEnabled", 
			enabled 
		})
	}, [])
	
	// ✅ 知识图谱开关处理 - 点击立即生效
	const handleKnowledgeGraphToggle = useCallback(
		(e: any) => {
			e?.preventDefault?.()
			e?.stopPropagation?.()

			const newState = !localChecked

			// 启用操作：先弹出确认对话框
			if (!localChecked && newState) {
				setShowEnableConfirm(true)
				return
			}

			// 禁用操作：立即生效
			if (localChecked && !newState) {
				updateKnowledgeGraphEnabled(false)
			}
		},
		[localChecked, updateKnowledgeGraphEnabled],
	)
	
	// ✅ 确认启用后的操作
	const handleConfirmEnable = useCallback(() => {
		updateKnowledgeGraphEnabled(true)
		setShowEnableConfirm(false)
	}, [updateKnowledgeGraphEnabled])

	// 防抖的操作函数 - 统一状态检查和防重复点击
	const handleStartBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		if (
			(status !== KNOWLEDGE_GRAPH_STATUS.PENDING &&
				status !== KNOWLEDGE_GRAPH_STATUS.COMPLETED &&
				status !== KNOWLEDGE_GRAPH_STATUS.ERROR) ||
			uiState.isOperating
		) {
			return
		}
		dispatch({ type: UI_ACTIONS.SET_OPERATING, payload: true })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.BUILD)
		
		// ✅ 操作后立即获取一次状态
		// 后端已在异步任务创建前更新状态为 RUNNING，所以这里会立即看到正确状态
		// 收到 RUNNING 状态后，useEffect 会自动启动 2 秒轮询
		setTimeout(() => getStatusOnce(), 300)
	}, DEBOUNCE_DELAY)

	const handlePauseBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		if (status !== KNOWLEDGE_GRAPH_STATUS.RUNNING || uiState.isOperating) {
			return
		}
		dispatch({ type: UI_ACTIONS.SET_OPERATING, payload: true })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.PAUSE)
	}, DEBOUNCE_DELAY)

	const handleResumeBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		// 允许 PAUSED 和 INTERRUPTED 状态继续
		if ((status !== KNOWLEDGE_GRAPH_STATUS.PAUSED && status !== KNOWLEDGE_GRAPH_STATUS.INTERRUPTED) || uiState.isOperating) {
			return
		}
		dispatch({ type: UI_ACTIONS.SET_OPERATING, payload: true })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.RESUME)
		
		// ✅ 操作后立即获取一次状态
		// 后端已在异步任务创建前更新状态为 RUNNING，所以这里会立即看到正确状态
		setTimeout(() => getStatusOnce(), 300)
	}, DEBOUNCE_DELAY)

	const handleClearBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		// 运行中不允许清空
		if (status === KNOWLEDGE_GRAPH_STATUS.RUNNING || uiState.isOperating) {
			return
		}
		
		// 显示确认对话框
		setShowClearConfirm(true)
	}, DEBOUNCE_DELAY)

	// 确认清空后的实际操作
	const handleConfirmClear = useCallback(() => {
		dispatch({ type: UI_ACTIONS.SET_OPERATING, payload: true })
		dispatch({ type: UI_ACTIONS.RESET_TO_DEFAULT })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.CLEAR)
		setShowClearConfirm(false)
	}, [dispatch, sendMessage])

	const handleOpenGraphView = useCallback(() => {
		console.log("[KnowledgeGraphSettings] 点击可视化按钮，发送 OPEN_GRAPH_VIEW 消息")
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.OPEN_GRAPH_VIEW)
	}, [sendMessage])

	const getStatusIcon = useCallback((status: string) => {
		const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
		const iconClass = config?.icon || STATUS_CONFIG[KNOWLEDGE_GRAPH_STATUS.PENDING].icon
		return <div className={iconClass}></div>
	}, [])

	const getStatusText = useCallback(
		(status: string) => {
			const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
			const textKey = config?.textKey || "knowledgegraph:statusUnknown"
			return t(textKey)
		},
		[t],
	)

	// 获取禁用提示文本 - 简化复杂的三元表达式
	const getDisabledTooltipText = useCallback(() => {
		if (uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING) {
			return t("knowledgegraph:cannotDisableWhileRunning")
		}
		if (!isZgsmProvider) {
			return t("knowledgegraph:onlyCostrictProviderSupport")
		}
		if (!cwd) {
			return t("knowledgegraph:disabled")
		}
		return t("knowledgegraph:disabled")
	}, [uiState.knowledgeGraphStatus.status, isZgsmProvider, cwd, t])

	// 格式化数字为千分位
	const formatNumber = (num: number): string => {
		return num.toLocaleString()
	}

	// 格式化耗时
	const formatDuration = (ms: number): string => {
		if (ms < 1000) {
			return `${Math.round(ms)}ms`
		}
		if (ms < 60000) {
			const seconds = (ms / 1000).toFixed(1)
			return `${seconds}s`
		}
		const minutes = Math.floor(ms / 60000)
		const seconds = Math.floor((ms % 60000) / 1000)
		return `${minutes}m${seconds}s`
	}

	// 渲染统计信息
	const renderStatistics = useCallback(() => {
		const { llmStatistics, phaseDurations, totalDuration, addedFiles, modifiedFiles, deletedFiles } = uiState.knowledgeGraphStatus

		// ✅ 更严格的检查：确保数据不为空且有有效值
		const hasPhaseData = phaseDurations && 
			Object.values(phaseDurations).some(duration => duration && duration > 0)
		const hasLLMData = llmStatistics && 
			llmStatistics.totalRequests !== undefined && 
			llmStatistics.totalRequests > 0
		const hasTotalDuration = totalDuration !== undefined && totalDuration > 0
		
		// 检查是否有增量统计数据
		const hasIncrementalStats = (addedFiles !== undefined && addedFiles >= 0) || 
			(modifiedFiles !== undefined && modifiedFiles >= 0) || 
			(deletedFiles !== undefined && deletedFiles >= 0)

		// 如果没有任何统计数据，显示等待中
		if (!hasPhaseData && !hasLLMData && !hasTotalDuration && !hasIncrementalStats) {
			return (
				<div className="text-sm p-2">
					<div className="text-vscode-descriptionForeground">
						{t("knowledgegraph:noStatisticsYet")}
					</div>
				</div>
			)
		}

		return (
			<div className="space-y-3 text-sm p-2 max-w-xs">
				{/* 本次处理文件数统计 */}
				{hasIncrementalStats && (
					<div>
						<div className="font-medium mb-2">{t("knowledgegraph:processedFilesStats")}</div>
						<div className="space-y-1 text-xs text-vscode-descriptionForeground">
							{addedFiles !== undefined && addedFiles >= 0 && (
								<div>
									{t("knowledgegraph:addedFiles")}: {formatNumber(addedFiles)}
								</div>
							)}
							{modifiedFiles !== undefined && modifiedFiles >= 0 && (
								<div>
									{t("knowledgegraph:modifiedFiles")}: {formatNumber(modifiedFiles)}
								</div>
							)}
							{deletedFiles !== undefined && deletedFiles >= 0 && (
								<div>
									{t("knowledgegraph:deletedFiles")}: {formatNumber(deletedFiles)}
								</div>
							)}
							{(addedFiles !== undefined || modifiedFiles !== undefined || deletedFiles !== undefined) && (
								<div className="font-medium pt-1 text-vscode-foreground">
									{t("knowledgegraph:totalChanges")}: {formatNumber((addedFiles || 0) + (modifiedFiles || 0) + (deletedFiles || 0))}
								</div>
							)}
						</div>
					</div>
				)}

				{/* 性能统计 */}
				{hasPhaseData && (
					<div>
						<div className="font-medium mb-2">{t("knowledgegraph:performanceStats")}</div>
						<div className="space-y-1 text-xs text-vscode-descriptionForeground">
							{phaseDurations.fileCollection && (
								<div>
									{t("knowledgegraph:fileCollection")}: {formatDuration(phaseDurations.fileCollection)}
								</div>
							)}
					{phaseDurations.rootAnalysis && (
						<div>
							{t("knowledgegraph:rootAnalysis")}: {formatDuration(phaseDurations.rootAnalysis)}
						</div>
					)}
					{phaseDurations.directoryFileAnalysis && (
						<div>
							{t("knowledgegraph:directoryFileAnalysis")}: {formatDuration(phaseDurations.directoryFileAnalysis)}
						</div>
					)}
							{hasTotalDuration && (
								<div className="font-medium pt-1 text-vscode-foreground">
									{t("knowledgegraph:totalDuration")}: {formatDuration(totalDuration)}
								</div>
							)}
						</div>
					</div>
				)}

				{/* LLM统计 */}
				{hasLLMData && (
					<div>
						<div className="font-medium mb-2">{t("knowledgegraph:llmStats")}</div>
						<div className="space-y-1 text-xs text-vscode-descriptionForeground">
							<div>
								{t("knowledgegraph:totalRequests")}: {formatNumber(llmStatistics.totalRequests)}
							</div>
							<div>
								{t("knowledgegraph:successfulRequests")}: {formatNumber(llmStatistics.successfulRequests)}
							</div>
							{llmStatistics.failedRequests > 0 && (
								<div className="text-vscode-errorForeground">
									{t("knowledgegraph:failedRequests")}: {formatNumber(llmStatistics.failedRequests)}
								</div>
							)}
							<div>
								{t("knowledgegraph:totalInputTokens")}: {formatNumber(llmStatistics.totalInputTokens)}
							</div>
							<div>
								{t("knowledgegraph:totalOutputTokens")}: {formatNumber(llmStatistics.totalOutputTokens)}
							</div>
							<div className="font-medium pt-1 text-vscode-foreground">
								{t("knowledgegraph:totalTokens")}: {formatNumber(llmStatistics.totalTokens)}
							</div>
						</div>
					</div>
				)}
			</div>
		)
	}, [uiState.knowledgeGraphStatus, t])

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message = event.data

		// 只处理构建状态更新（轮询获取）
		if (message.type === KNOWLEDGE_GRAPH_MESSAGES.STATUS_RESPONSE && message.payload?.status) {
			const statusInfo = message.payload.status as KnowledgeGraphBuildState
			dispatch({ type: UI_ACTIONS.UPDATE_STATUS, payload: statusInfo })
		}
		// 注：启用开关状态不监听后端消息，由前端乐观更新驱动
		},
		[],
	)

	useEvent("message", handleMessage)

	return (
		<div>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center gap-2">
									<VSCodeCheckbox
										checked={localChecked}
										onClick={handleKnowledgeGraphToggle}
										disabled={shouldDisableCheckbox}
									/>
									<div>{t("knowledgegraph:title")}</div>
								</div>
							</TooltipTrigger>
							{shouldDisableCheckbox && (
								<TooltipContent>
									<p>{getDisabledTooltipText()}</p>
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
				</div>
			</SectionHeader>

			<Section>
				<div className={`space-y-6 ${shouldDisableAll ? "opacity-50" : ""}`}>
					{/* Knowledge Graph Status Section */}
					<div
						className={`flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background ${shouldDisableAll ? "pointer-events-none" : ""}`}>
						<div>
							<div className="flex items-center justify-between w-full">
								<div className="flex items-center gap-4 font-bold">
									<FileText className="w-4 h-4" />
									<div>{t("knowledgegraph:title")}</div>
								</div>
							{/* 统计信息图标 - 与构建状态在同一行 */}
							{isZgsmProvider && cwd && localChecked && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													className="p-1 hover:opacity-80 cursor-pointer"
													onClick={(e) => e.preventDefault()}>
													<Info className="w-4 h-4" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="left" className="max-w-sm">
												{renderStatistics()}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								)}
							</div>
							<div className="text-vscode-descriptionForeground text-sm mb-3">
								{t("knowledgegraph:description")}
							</div>
						</div>

						{!isZgsmProvider || !cwd ? (
							<div className="text-vscode-descriptionForeground text-sm italic py-4">
								{t("knowledgegraph:enableToShowDetails")}
							</div>
						) : (
							<>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<div className="text-vscode-descriptionForeground text-sm">
											{t("knowledgegraph:fileCount")}
										</div>
										<div className="font-medium">{uiState.knowledgeGraphStatus.totalFiles}</div>
									</div>
									<div>
										<div className="text-vscode-descriptionForeground text-sm">
											{t("knowledgegraph:lastUpdated")}
										</div>
										<div className="font-medium">
											{uiState.knowledgeGraphStatus.lastUpdateTime
												? format(
														new Date(uiState.knowledgeGraphStatus.lastUpdateTime),
														"yyyy-MM-dd HH:mm:ss",
													)
												: "-"}
										</div>
									</div>
								</div>

								<div className="mt-2">
									<div className="flex justify-between text-sm mb-1">
										<span>{t("knowledgegraph:buildProgress")}</span>
										<span>{(uiState.knowledgeGraphStatus.progress || 0).toFixed(1)}%</span>
									</div>
									<Progress
										value={uiState.knowledgeGraphStatus.progress}
										className="h-2"
										progressBackgroundClass="bg-vscode-button-background"
									/>
									{uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING &&
										uiState.knowledgeGraphStatus.currentFile && (
											<div
												className="text-xs text-vscode-descriptionForeground mt-1 truncate"
												title={uiState.knowledgeGraphStatus.currentFile}>
												Processing: {uiState.knowledgeGraphStatus.currentFile}
											</div>
										)}
								</div>

								{/* Status and Control Buttons */}
								<div className="flex items-center justify-between mt-3">
									<div className="flex items-center gap-2">
										{getStatusIcon(uiState.knowledgeGraphStatus.status)}
										<span>{getStatusText(uiState.knowledgeGraphStatus.status)}</span>
										{uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.ERROR &&
											uiState.knowledgeGraphStatus.failedFiles > 0 && (
												<Badge variant="destructive" className="text-xs">
													{uiState.knowledgeGraphStatus.failedFiles}
												</Badge>
											)}
									</div>

										<div className="flex items-center gap-2">
											{/* 左侧操作按钮组 */}
											<div className="flex items-center gap-2">
												{/* 可视化按钮：只在 COMPLETED 状态显示 */}
												{uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.COMPLETED && (
													<Button
														onClick={handleOpenGraphView}
														variant="outline"
														size="sm"
														className="flex items-center gap-1"
														disabled={shouldDisableAll || uiState.isOperating}>
														<Network className="w-3 h-3" />
														可视化
													</Button>
												)}
											{/* 构建按钮：PENDING, ERROR, COMPLETED 状态显示 */}
											{(uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.PENDING ||
												uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.ERROR ||
												uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.COMPLETED) && (
												<Button
													onClick={handleStartBuild}
													variant="outline"
													size="sm"
													className="flex items-center gap-1"
													disabled={shouldDisableAll || uiState.isOperating}>
													<Play className="w-3 h-3" />
													构建
												</Button>
											)}
											{/* 暂停按钮：RUNNING 状态显示 */}
											{uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING && (
												<Button
													onClick={handlePauseBuild}
													variant="outline"
													size="sm"
													className="flex items-center gap-1"
													disabled={shouldDisableAll || uiState.isOperating}>
													{uiState.isOperating ? (
														<Loader2 className="w-3 h-3 animate-spin" />
													) : (
														<Pause className="w-3 h-3" />
													)}
													{t("knowledgegraph:pause")}
												</Button>
											)}
											{/* 继续按钮：PAUSED 或 INTERRUPTED 状态显示 */}
											{(uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.PAUSED ||
												uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.INTERRUPTED) && (
												<Button
													onClick={handleResumeBuild}
													variant="outline"
													size="sm"
													className="flex items-center gap-1"
													disabled={shouldDisableAll || uiState.isOperating}>
													<Play className="w-3 h-3" />
													{t("knowledgegraph:resume")}
												</Button>
											)}
										</div>

										{/* 右侧危险操作按钮 - 始终显示 */}
										<Button
											onClick={handleClearBuild}
											variant="destructive"
											size="sm"
											className="flex items-center gap-1 ml-4"
											disabled={
												shouldDisableAll ||
												uiState.isOperating ||
												uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING
											}>
											<Trash className="w-3 h-3" />
											{t("knowledgegraph:clear")}
										</Button>
									</div>
								</div>

								{/* Error Details */}
								{uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.ERROR &&
									uiState.knowledgeGraphStatus.error && (
										<div className="mt-2 p-2 bg-vscode-textBlockQuote-background border border-vscode-input-border rounded">
											<div className="flex items-center gap-2 mb-2">
												<AlertCircle className="w-4 h-4 text-red-500" />
												<span className="text-sm font-medium text-vscode-errorForeground">
													{t("knowledgegraph:buildFailed")}
												</span>
											</div>
											<p className="text-sm text-vscode-errorForeground">
												{uiState.knowledgeGraphStatus.error}
											</p>
											{uiState.knowledgeGraphStatus.failedFiles > 0 && (
												<p className="text-xs text-vscode-descriptionForeground mt-1">
													{t("knowledgegraph:failedFileCount", {
														count: uiState.knowledgeGraphStatus.failedFiles,
													})}
												</p>
											)}
										</div>
									)}
							</>
						)}

						{/* 高级设置 */}
						{isZgsmProvider && cwd && (
							<div className="mt-6">
								<Collapsible open={isAdvancedSettingsOpen} onOpenChange={setIsAdvancedSettingsOpen}>
									<CollapsibleTrigger className="flex items-center gap-1 w-full cursor-pointer hover:opacity-80 mb-2">
										<span
											className={`codicon codicon-chevron-${isAdvancedSettingsOpen ? "down" : "right"}`}></span>
										<span className="font-medium">{t("knowledgegraph:advancedSettings")}</span>
									</CollapsibleTrigger>
									<CollapsibleContent className="space-y-4 pl-2">
									{/* 自动构建开关 */}
									<div className="flex flex-col gap-2">
										<VSCodeCheckbox
											checked={knowledgeGraphAutoRebuildEnabled ?? false}
											onChange={(e: any) => {
												const checked = e.target?.checked ?? false
												setKgSettings?.((prev) => ({ ...prev, autoRebuildEnabled: checked }))
											}}
											disabled={shouldDisableAll}>
											{t("knowledgegraph:autoRebuild")}
										</VSCodeCheckbox>

										{/* 自动构建间隔 - 联动显示 */}
										{knowledgeGraphAutoRebuildEnabled && (
											<div className="ml-6 flex flex-col gap-1">
												<label className="text-sm font-medium">
													{t("knowledgegraph:autoRebuildInterval")}
												</label>
												<VSCodeTextField
													value={String(knowledgeGraphAutoRebuildIntervalMinutes ?? 5)}
													onInput={(e: any) => {
														const value = parseInt(e.target?.value || "5", 10)
														const validValue = Math.max(1, value)
														setKgSettings?.((prev) => ({ ...prev, autoRebuildIntervalMinutes: validValue }))
													}}
													disabled={shouldDisableAll}
													className="w-32"
												/>
												<span className="text-xs text-vscode-descriptionForeground">
													{t("knowledgegraph:autoRebuildIntervalHelp")}
												</span>
											</div>
										)}
									</div>

									{/* 包含测试代码文件 */}
									<div className="flex flex-col gap-1">
										<VSCodeCheckbox
											checked={knowledgeGraphIncludeTestFiles ?? false}
											onChange={(e: any) => {
												const checked = e.target?.checked ?? false
												setKgSettings?.((prev) => ({ ...prev, includeTestFiles: checked }))
											}}
											disabled={shouldDisableAll}>
											{t("knowledgegraph:includeTestFiles")}
										</VSCodeCheckbox>
									</div>

									{/* 可视化最大文件数量 */}
									<div className="flex flex-col gap-1">
										<label className="block font-medium mb-1">
											{t("knowledgegraph:maxVisualizationFiles")}
										</label>
										<div className="flex items-center gap-2">
											<Slider
												min={10}
												max={500}
												step={10}
												value={[knowledgeGraphMaxVisualizationFiles ?? 200]}
												onValueChange={([value]) => setKgSettings?.((prev) => ({ ...prev, maxVisualizationFiles: value }))}
												disabled={shouldDisableAll}
											/>
											<span className="w-16">{knowledgeGraphMaxVisualizationFiles ?? 200}个</span>
										</div>
										<div className="text-sm text-vscode-descriptionForeground">
											限制可视化最多展示的文件数
										</div>
									</div>

									{/* 模型上下文窗口大小 */}
									<div className="flex flex-col gap-1">
										<label className="block font-medium mb-1">
											{t("knowledgegraph:contextWindowSize")}
										</label>
											<VSCodeTextField
												value={String(knowledgeGraphContextWindowSize ?? 128000)}
												onInput={(e: any) => {
													const value = parseInt(e.target?.value || "128000", 10)
													const validValue = Math.max(1000, value)
													setKgSettings?.((prev) => ({ ...prev, contextWindowSize: validValue }))
												}}
											disabled={shouldDisableAll}
											className="w-32"
										/>
										<div className="text-sm text-vscode-descriptionForeground">
											{t("knowledgegraph:contextWindowSizeHelp")}
										</div>
									</div>

									{/* 摘要消耗上下文窗口阈值 */}
									<div className="flex flex-col gap-1">
										<label className="block font-medium mb-1">
											{t("knowledgegraph:contextWindowThreshold")}
										</label>
										<div className="flex items-center gap-2">
											<Slider
												min={10}
												max={100}
												step={1}
												value={[knowledgeGraphContextWindowThreshold ?? 50]}
												onValueChange={([value]) => setKgSettings?.((prev) => ({ ...prev, contextWindowThreshold: value }))}
												disabled={shouldDisableAll}
											/>
											<span className="w-10">{knowledgeGraphContextWindowThreshold ?? 50}%</span>
										</div>
										<div className="text-sm text-vscode-descriptionForeground">
											{t("knowledgegraph:contextWindowThresholdHelp")}
										</div>
									</div>

									{/* LLM超时时间 */}
									<div className="flex flex-col gap-1">
										<label className="block font-medium mb-1">
											{t("knowledgegraph:llmTimeout")}
										</label>
										<div className="flex items-center gap-2">
											<Slider
												min={1}
												max={60}
												step={1}
												value={[(knowledgeGraphLlmTimeoutMs ?? 300000) / 60000]}
												onValueChange={([value]) => setKgSettings?.((prev) => ({ ...prev, llmTimeoutMs: value * 60000 }))}
												disabled={shouldDisableAll}
											/>
											<span className="w-16">{(knowledgeGraphLlmTimeoutMs ?? 300000) / 60000}分钟</span>
										</div>
										<div className="text-sm text-vscode-descriptionForeground">
											{t("knowledgegraph:llmTimeoutHelp")}
										</div>
									</div>

									{/* LLM请求重试次数 */}
									<div className="flex flex-col gap-1">
										<label className="block font-medium mb-1">
											{t("knowledgegraph:llmMaxRetries")}
										</label>
										<div className="flex items-center gap-2">
											<Slider
												min={1}
												max={10}
												step={1}
												value={[knowledgeGraphLlmMaxRetries ?? 5]}
												onValueChange={([value]) => setKgSettings?.((prev) => ({ ...prev, llmMaxRetries: value }))}
												disabled={shouldDisableAll}
											/>
											<span className="w-10">{knowledgeGraphLlmMaxRetries ?? 5}次</span>
										</div>
										<div className="text-sm text-vscode-descriptionForeground">
											{t("knowledgegraph:llmMaxRetriesHelp")}
										</div>
									</div>
									</CollapsibleContent>
								</Collapsible>
							</div>
						)}
					</div>
				</div>

				{/* 清空确认对话框 */}
				<AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								<AlertCircle className="w-4 h-4 text-red-500" />
								{t("knowledgegraph:confirmClear")}
							</AlertDialogTitle>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("knowledgegraph:cancel")}</AlertDialogCancel>
							<AlertDialogAction
								onClick={handleConfirmClear}
								className="bg-red-600 hover:bg-red-700 text-white">
								{t("knowledgegraph:confirm")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				{/* ✅ 启用确认对话框 */}
				<AlertDialog open={showEnableConfirm} onOpenChange={setShowEnableConfirm}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("knowledgegraph:confirmEnable")}</AlertDialogTitle>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("knowledgegraph:cancel")}</AlertDialogCancel>
							<AlertDialogAction onClick={handleConfirmEnable}>
								{t("knowledgegraph:confirm")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</Section>
		</div>
	)
}
