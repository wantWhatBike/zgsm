import { useEffect, useRef, useCallback, useMemo, useReducer } from "react"
import { FileText, AlertCircle, Play, Pause, Trash, Loader2 } from "lucide-react"
import { format } from "date-fns"

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "@/utils/vscode"
import {
	Button,
	Progress,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
	Badge,
} from "@/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SetCachedStateField } from "./types"
import { useEvent } from "react-use"
import { KnowledgeGraphBuildState, KNOWLEDGE_GRAPH_MESSAGES, API_PROVIDER } from "@roo-code/types"

// 前端UI常量
const POLLING_INTERVAL = 2000
const DEBOUNCE_DELAY = 300

// 状态机定义
type UIState = {
	knowledgeGraphStatus: KnowledgeGraphBuildState
	isOperating: boolean
	toggleError: string | null
}

type UIAction =
	| { type: 'UPDATE_STATUS'; payload: KnowledgeGraphBuildState }
	| { type: 'SET_OPERATING'; payload: boolean }
	| { type: 'SET_TOGGLE_ERROR'; payload: string | null }
	| { type: 'RESET_TO_DEFAULT' }

// 默认状态生成函数
const createDefaultBuildState = (): KnowledgeGraphBuildState => ({
	progress: 0,
	totalFiles: 0,
	totalFilesToProcess: 0,
	processedFiles: 0,
	failedFiles: 0,
	currentFile: "",
	status: "pending",
	phase: "root_analysis",
	lastUpdateTime: new Date().toISOString(),
	totalDuration: 0,
})

// 状态机Reducer - 统一状态管理
const uiStateReducer = (state: UIState, action: UIAction): UIState => {
	switch (action.type) {
		case 'UPDATE_STATUS':
			return {
				...state,
				knowledgeGraphStatus: action.payload,
				isOperating: false,
			}
		case 'SET_OPERATING':
			return { ...state, isOperating: action.payload }
		case 'SET_TOGGLE_ERROR':
			return { ...state, toggleError: action.payload }
		case 'RESET_TO_DEFAULT':
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
	running: {
		icon: "w-3 h-3 bg-yellow-500 rounded-full animate-pulse",
		textKey: "knowledgeGraph.statusRunning"
	},
	pending: {
		icon: "w-3 h-3 bg-gray-400 rounded-full animate-pulse",
		textKey: "knowledgeGraph.statusPending"
	},
	completed: {
		icon: "w-3 h-3 bg-green-500 rounded-full",
		textKey: "knowledgeGraph.statusSuccess"
	},
	error: {
		icon: "w-3 h-3 bg-red-500 rounded-full",
		textKey: "knowledgeGraph.statusFailed"
	},
	paused: {
		icon: "w-3 h-3 bg-orange-500 rounded-full",
		textKey: "knowledgeGraph.statusPaused"
	}
} as const

// 防抖Hook
const useDebounce = <T extends (...args: any[]) => void>(
	callback: T,
	delay: number
): T => {
	const timeoutRef = useRef<NodeJS.Timeout>()
	
	return useCallback((...args: Parameters<T>) => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
		}
		timeoutRef.current = setTimeout(() => callback(...args), delay)
	}, [callback, delay]) as T
}

interface KnowledgeGraphSettingsProps {
	setCachedStateField?: SetCachedStateField<"knowledgeGraphEnabled">
}

export const KnowledgeGraphSettings = ({ setCachedStateField }: KnowledgeGraphSettingsProps) => {
	const { t } = useAppTranslation()
	const {
		knowledgeGraphEnabled,
		knowledgeGraphStatus: initialStatus,
		apiConfiguration,
		cwd	} = useExtensionState()
	
	// 使用状态机管理UI状态
	const [uiState, dispatch] = useReducer(uiStateReducer, {
		knowledgeGraphStatus: initialStatus || createDefaultBuildState(),
		isOperating: false,
		toggleError: null,
	})
	
	// 轮询管理
	const pollingIntervalId = useRef<NodeJS.Timeout | null>(null)

	// 检查是否为支持的API提供者 - 使用共享常量
	const isZgsmProvider = useMemo(
		() => apiConfiguration?.apiProvider === API_PROVIDER.ZGSM,
		[apiConfiguration?.apiProvider]
	)

	// Check if should disable checkbox - when API provider is not zgsm, no cwd, or running
	const shouldDisableCheckbox = useMemo(
		() => !isZgsmProvider || !cwd || uiState.knowledgeGraphStatus.status === "running",
		[isZgsmProvider, cwd, uiState.knowledgeGraphStatus.status],
	)

	// Use useMemo to avoid unnecessary state updates
	const shouldDisableAll = useMemo(
		() => !isZgsmProvider || !cwd || !knowledgeGraphEnabled,
		[isZgsmProvider, cwd, knowledgeGraphEnabled],
	)

	// 统一的消息发送函数
	const sendMessage = useCallback((type: string, payload?: any) => {
		vscode.postMessage({ type, ...payload })
	}, [])

	// 获取状态
	const getStatusOnce = useCallback(() => {
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.GET_STATUS)
	}, [sendMessage])

	// 轮询管理 - 简化逻辑
	const stopPolling = useCallback(() => {
		if (pollingIntervalId.current) {
			clearInterval(pollingIntervalId.current)
			pollingIntervalId.current = null
		}
	}, [])

	const startPolling = useCallback(() => {
		if (pollingIntervalId.current) return
		pollingIntervalId.current = setInterval(getStatusOnce, POLLING_INTERVAL)
	}, [getStatusOnce])

	// 轮询控制 - 基于状态自动管理
	useEffect(() => {
		const { status } = uiState.knowledgeGraphStatus
		if (status === "running") {
			startPolling()
		} else {
			stopPolling()
		}
		return stopPolling
	}, [uiState.knowledgeGraphStatus, startPolling, stopPolling])

	// Handle messages from extension
	useEffect(() => {
		// 1. Get build status once when page is opened
		if (knowledgeGraphEnabled && isZgsmProvider && cwd) {
			// Get status immediately without polling
			getStatusOnce()
		}

		return () => {
			// Stop polling when page is closed
			stopPolling()
		}
	}, [
		knowledgeGraphEnabled,
		isZgsmProvider,
		cwd,
		getStatusOnce,
		stopPolling,
	])

	const handleKnowledgeGraphToggle = useCallback((e: any) => {
		// e.preventDefault may not exist in tests
		if (e && e.preventDefault) {
			e.preventDefault()
		}
		if (e && e.stopPropagation) {
			e.stopPropagation()
		}

		// 获取新的状态 - VSCode复选框使用_checked属性
		const newChecked = e.target._checked !== undefined ? e.target._checked : !knowledgeGraphEnabled

		// Send message to extension directly without confirmation dialog
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.ENABLED, { bool: newChecked })
	}, [knowledgeGraphEnabled, sendMessage])

	// 防抖的操作函数 - 统一状态检查和防重复点击
	const handleStartBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		if (status !== "pending" && status !== "completed" && status !== "error" || uiState.isOperating) {
			return
		}
		dispatch({ type: 'SET_OPERATING', payload: true })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.BUILD)
	}, DEBOUNCE_DELAY)

	const handlePauseBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		if (status !== "running" || uiState.isOperating) {
			return
		}
		dispatch({ type: 'SET_OPERATING', payload: true })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.PAUSE)
	}, DEBOUNCE_DELAY)

	const handleResumeBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		if (status !== "paused" || uiState.isOperating) {
			return
		}
		dispatch({ type: 'SET_OPERATING', payload: true })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.RESUME)
	}, DEBOUNCE_DELAY)

	const handleClearBuild = useDebounce(() => {
		const { status } = uiState.knowledgeGraphStatus
		if (status === "running" || uiState.isOperating) {
			return
		}
		dispatch({ type: 'SET_OPERATING', payload: true })
		dispatch({ type: 'RESET_TO_DEFAULT' })
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.CLEAR)
	}, DEBOUNCE_DELAY)

	const getStatusIcon = useCallback((status: string) => {
		const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
		const iconClass = config?.icon || STATUS_CONFIG.pending.icon
		return <div className={iconClass}></div>
	}, [])

	const getStatusText = useCallback((status: string) => {
		const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
		const textKey = config?.textKey || "knowledgeGraph.statusUnknown"
		return t(textKey)
	}, [t])

	// 获取禁用提示文本 - 简化复杂的三元表达式
	const getDisabledTooltipText = useCallback(() => {
		if (uiState.knowledgeGraphStatus.status === "running") {
			return t("knowledgeGraph.cannotDisableWhileRunning")
		}
		if (!isZgsmProvider) {
			return t("knowledgeGraph.onlyCostrictProviderSupport")
		}
		if (!cwd) {
			return t("knowledgeGraph.disabled")
		}
		return t("knowledgeGraph.disabled")
	}, [uiState.knowledgeGraphStatus.status, isZgsmProvider, cwd, t])

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message = event.data

			if (message.type === KNOWLEDGE_GRAPH_MESSAGES.STATUS_RESPONSE && message.payload?.status) {
				const statusInfo = message.payload.status as KnowledgeGraphBuildState
				
				// 更新状态 - 使用状态机
				dispatch({ type: 'UPDATE_STATUS', payload: statusInfo })
			} else if (message.type === KNOWLEDGE_GRAPH_MESSAGES.ENABLED && setCachedStateField) {
				// 处理启用/禁用响应
				if (message.error) {
					console.error("Knowledge Graph Toggle Error:", message.error)
					dispatch({ type: 'SET_TOGGLE_ERROR', payload: message.error })
					// 强制设置为 false
					setCachedStateField("knowledgeGraphEnabled", false)
				} else {
					dispatch({ type: 'SET_TOGGLE_ERROR', payload: null })
					setCachedStateField("knowledgeGraphEnabled", message.payload)
					
					// 当知识图谱被启用时，立即获取状态
					if (message.payload) {
						getStatusOnce()
					}
				}
			}
		},
		[setCachedStateField, getStatusOnce],
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
										defaultChecked={knowledgeGraphEnabled}
										onClick={handleKnowledgeGraphToggle}
										disabled={shouldDisableCheckbox}
									/>
									<div>{t("knowledgeGraph.title")}</div>
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
				{uiState.toggleError && (
					<div className="mb-4 p-2 bg-vscode-textBlockQuote-background border border-vscode-input-border rounded">
						<div className="flex items-center gap-2">
							<AlertCircle className="w-4 h-4 text-red-500" />
							<span className="text-sm text-vscode-errorForeground">
								{uiState.toggleError}
							</span>
						</div>
					</div>
				)}
				<div className={`space-y-6 ${shouldDisableAll ? "opacity-50" : ""}`}>
					{/* Knowledge Graph Status Section */}
					<div className={`flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background ${shouldDisableAll ? "pointer-events-none" : ""}`}>
						<div className="flex items-center gap-4 font-bold">
							<FileText className="w-4 h-4" />
							<div>{t("knowledgeGraph.buildStatus")}</div>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mb-3">
							{t("knowledgeGraph.description")}
						</div>
						
						{(!isZgsmProvider || !cwd) ? (
							<div className="text-vscode-descriptionForeground text-sm italic py-4">
								{t("knowledgeGraph.enableToShowDetails")}
							</div>
						) : (
							<>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<div className="text-vscode-descriptionForeground text-sm">
											{t("knowledgeGraph.fileCount")}
										</div>
										<div className="font-medium">{uiState.knowledgeGraphStatus.totalFiles}</div>
									</div>
									<div>
										<div className="text-vscode-descriptionForeground text-sm">
											{t("knowledgeGraph.lastUpdated")}
										</div>
										<div className="font-medium">
											{uiState.knowledgeGraphStatus.lastUpdateTime
												? format(new Date(uiState.knowledgeGraphStatus.lastUpdateTime), "yyyy-MM-dd HH:mm:ss")
												: "-"
											}
										</div>
									</div>
								</div>

								<div className="mt-2">
									<div className="flex justify-between text-sm mb-1">
										<span>{t("knowledgeGraph.buildProgress")}</span>
										<span>{(uiState.knowledgeGraphStatus.progress || 0).toFixed(1)}%</span>
									</div>
									<Progress
										value={uiState.knowledgeGraphStatus.progress}
										className="h-2"
										progressBackgroundClass="bg-vscode-button-background"
									/>
									{uiState.knowledgeGraphStatus.status === "running" && uiState.knowledgeGraphStatus.currentFile && (
										<div className="text-xs text-vscode-descriptionForeground mt-1 truncate" title={uiState.knowledgeGraphStatus.currentFile}>
											Processing: {uiState.knowledgeGraphStatus.currentFile}
										</div>
									)}
								</div>

								{/* Status and Control Buttons */}
								<div className="flex items-center justify-between mt-3">
									<div className="flex items-center gap-2">
										{getStatusIcon(uiState.knowledgeGraphStatus.status)}
										<span>{getStatusText(uiState.knowledgeGraphStatus.status)}</span>
										{uiState.knowledgeGraphStatus.status === "error" && uiState.knowledgeGraphStatus.failedFiles > 0 && (
											<Badge variant="destructive" className="text-xs">
												{uiState.knowledgeGraphStatus.failedFiles}
											</Badge>
										)}
									</div>
									
									<div className="flex items-center gap-2">
										{uiState.knowledgeGraphStatus.status === "pending" && (
											<Button
												onClick={handleStartBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll || uiState.isOperating}>
												<Play className="w-3 h-3" />
												{t("knowledgeGraph.start")}
											</Button>
										)}
										{uiState.knowledgeGraphStatus.status === "running" && (
											<Button
												onClick={handlePauseBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll || uiState.isOperating}>
												{uiState.isOperating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
												{t("knowledgeGraph.pause")}
											</Button>
										)}
										{uiState.knowledgeGraphStatus.status === "paused" && (
											<Button
												onClick={handleResumeBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll || uiState.isOperating}>
												<Play className="w-3 h-3" />
												{t("knowledgeGraph.resume")}
											</Button>
										)}
										{(uiState.knowledgeGraphStatus.status === "completed" || uiState.knowledgeGraphStatus.status === "error") && (
											<Button
												onClick={handleClearBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll || uiState.isOperating}>
												<Trash className="w-3 h-3" />
												{t("knowledgeGraph.clear")}
											</Button>
										)}
									</div>
								</div>

								{/* Error Details */}
								{uiState.knowledgeGraphStatus.status === "error" && uiState.knowledgeGraphStatus.error && (
									<div className="mt-2 p-2 bg-vscode-textBlockQuote-background border border-vscode-input-border rounded">
										<div className="flex items-center gap-2 mb-2">
											<AlertCircle className="w-4 h-4 text-red-500" />
											<span className="text-sm font-medium text-vscode-errorForeground">
												{t("knowledgeGraph.buildFailed")}
											</span>
										</div>
										<p className="text-sm text-vscode-errorForeground">
											{uiState.knowledgeGraphStatus.error}
										</p>
										{uiState.knowledgeGraphStatus.failedFiles > 0 && (
											<p className="text-xs text-vscode-descriptionForeground mt-1">
												{t("knowledgeGraph.failedFileCount", { count: uiState.knowledgeGraphStatus.failedFiles })}
											</p>
										)}
									</div>
								)}
							</>
						)}
					</div>

				</div>
			</Section>
		</div>
	)
}