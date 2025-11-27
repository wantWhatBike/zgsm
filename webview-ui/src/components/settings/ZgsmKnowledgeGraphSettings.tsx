import { useEffect, useRef, useCallback, useMemo, useReducer, useState } from "react"
import { FileText, AlertCircle, Play, Pause, Trash, Loader2, Network } from "lucide-react"
import { format } from "date-fns"

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "@/utils/vscode"
import { Button, Progress, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Badge, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SetCachedStateField } from "./types"
import { useEvent } from "react-use"
import {
	KnowledgeGraphBuildState,
	KNOWLEDGE_GRAPH_MESSAGES,
	API_PROVIDER,
	KNOWLEDGE_GRAPH_STATUS,
	KNOWLEDGE_GRAPH_PHASE,
	KNOWLEDGE_GRAPH_FIELDS,
	KNOWLEDGE_GRAPH_UI_CONFIG,
} from "@roo-code/types"

// 前端UI常量 - 使用统一配置
// ✅ 修改：只在 RUNNING 状态轮询，固定 2 秒间隔，不再使用复杂的轮询间隔配置
const POLLING_INTERVAL_RUNNING = 2000 // 运行时 2 秒轮询

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
	setCachedStateField?: SetCachedStateField<"knowledgeGraphEnabled">
}

export const KnowledgeGraphSettings = ({ knowledgeGraphEnabled, setCachedStateField }: KnowledgeGraphSettingsProps) => {
	const { t } = useAppTranslation()
	const { knowledgeGraphStatus: initialStatus, apiConfiguration, cwd } = useExtensionState()

	// 使用状态机管理UI状态
	const [uiState, dispatch] = useReducer(uiStateReducer, {
		knowledgeGraphStatus: initialStatus || createDefaultBuildState(),
		isOperating: false,
	})

	// 清空确认对话框状态
	const [showClearConfirm, setShowClearConfirm] = useState(false)

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
		() => !isZgsmProvider || !cwd || !knowledgeGraphEnabled || showClearConfirm,
		[isZgsmProvider, cwd, knowledgeGraphEnabled, showClearConfirm],
	)

	// 统一的消息发送函数
	const sendMessage = useCallback((type: string, payload?: any) => {
		vscode.postMessage({ type, ...payload })
	}, [])

	// 获取状态
	const getStatusOnce = useCallback(() => {
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.GET_STATUS)
	}, [sendMessage])

	// ✅ 智能轮询控制 - 只在 RUNNING 状态轮询（2秒），终态不轮询
	useEffect(() => {
		let timeoutId: NodeJS.Timeout | null = null
		let isMounted = true

		const poll = () => {
			if (!isMounted) return

			// ✅ 只在 RUNNING 状态轮询
			if (
				knowledgeGraphEnabled &&
				isZgsmProvider &&
				cwd &&
				uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING
			) {
				getStatusOnce()
				// 使用配置的轮询间隔
				timeoutId = setTimeout(poll, POLLING_INTERVAL_RUNNING)
			}
		}

		// 启动轮询 - 只有在 RUNNING 状态时才启动
		if (
			knowledgeGraphEnabled &&
			isZgsmProvider &&
			cwd &&
			uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.RUNNING
		) {
			poll()
		}

		return () => {
			isMounted = false
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
		}
	}, [knowledgeGraphEnabled, isZgsmProvider, cwd, getStatusOnce, uiState.knowledgeGraphStatus.status])

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

	// 初始状态获取 - 仅在组件挂载和关键状态变化时执行
	useEffect(() => {
		// 仅在知识图谱启用且满足条件时获取初始状态
		if (knowledgeGraphEnabled && isZgsmProvider && cwd) {
			getStatusOnce()
		}
	}, [knowledgeGraphEnabled, isZgsmProvider, cwd, getStatusOnce])

	// 知识图谱开关处理 - 使用统一的状态管理机制
	const handleKnowledgeGraphToggle = useCallback(
		(e: any) => {
			// e.preventDefault may not exist in tests
			if (e && e.preventDefault) {
				e.preventDefault()
			}
			if (e && e.stopPropagation) {
				e.stopPropagation()
			}

			if (!setCachedStateField) {
				return
			}

			// 获取新的状态 - VSCode复选框使用_checked属性
			// 注意：VSCodeCheckbox 的 onChange 事件参数可能不同，这里做兼容处理
			const target = e.target as any
			const newChecked =
				target.checked !== undefined
					? target.checked
					: target._checked !== undefined
						? target._checked
						: !knowledgeGraphEnabled

			// 更新缓存状态，等待用户点击 Save 按钮
			setCachedStateField(KNOWLEDGE_GRAPH_FIELDS.ENABLED, newChecked)
		},
		[knowledgeGraphEnabled, setCachedStateField],
	)

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
		// 只允许 PAUSED 状态继续
		if (status !== KNOWLEDGE_GRAPH_STATUS.PAUSED || uiState.isOperating) {
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

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message = event.data

			if (message.type === KNOWLEDGE_GRAPH_MESSAGES.STATUS_RESPONSE && message.payload?.status) {
				const statusInfo = message.payload.status as KnowledgeGraphBuildState

				// 更新状态 - 使用状态机
				dispatch({ type: UI_ACTIONS.UPDATE_STATUS, payload: statusInfo })
			}
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
										checked={knowledgeGraphEnabled}
										onChange={handleKnowledgeGraphToggle}
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
						<div className="flex items-center gap-4 font-bold">
							<FileText className="w-4 h-4" />
							<div>{t("knowledgegraph:buildStatus")}</div>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mb-3">
							{t("knowledgegraph:description")}
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
											{/* 继续按钮：PAUSED 状态显示 */}
											{uiState.knowledgeGraphStatus.status === KNOWLEDGE_GRAPH_STATUS.PAUSED && (
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
			</Section>
		</div>
	)
}
