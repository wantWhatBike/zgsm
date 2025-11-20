import { useState, useEffect, useRef, useCallback, useMemo } from "react"
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

// 前端UI常量 - 轮询配置
const POLLING_INTERVAL = 2000

// 需要轮询的状态
const POLLING_STATUSES = ["running"]
// 需要停止轮询的状态
const STOP_POLLING_STATUSES = ["completed", "error", "pending", "paused"]

// 状态配置 - 统一管理图标和文本键
const STATUS_CONFIG = {
	running: {
		icon: "w-3 h-3 bg-yellow-500 rounded-full animate-pulse",
		textKey: "settings:ui.knowledgeGraph.status.running"
	},
	pending: {
		icon: "w-3 h-3 bg-gray-400 rounded-full animate-pulse",
		textKey: "settings:ui.knowledgeGraph.status.pending"
	},
	completed: {
		icon: "w-3 h-3 bg-green-500 rounded-full",
		textKey: "settings:ui.knowledgeGraph.status.success"
	},
	error: {
		icon: "w-3 h-3 bg-red-500 rounded-full",
		textKey: "settings:ui.knowledgeGraph.status.failed"
	},
	paused: {
		icon: "w-3 h-3 bg-orange-500 rounded-full",
		textKey: "settings:ui.knowledgeGraph.status.paused"
	}
} as const

// 默认状态生成函数 - 消除重复定义
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
	
	// 轮询状态管理 - 简化为单一状态
	const pollingIntervalId = useRef<NodeJS.Timeout | null>(null)

	const [knowledgeGraphStatus, setKnowledgeGraphStatus] = useState<KnowledgeGraphBuildState>(() => {
		return initialStatus || createDefaultBuildState()
	})
	const [toggleError, setToggleError] = useState<string | null>(null)
	const [isPausing, setIsPausing] = useState(false)

	// 检查是否为支持的API提供者 - 使用共享常量
	const isZgsmProvider = useMemo(
		() => apiConfiguration?.apiProvider === API_PROVIDER.ZGSM,
		[apiConfiguration?.apiProvider]
	)

	// Check if should disable checkbox - when API provider is not zgsm, no cwd, or running
	const shouldDisableCheckbox = useMemo(
		() => !isZgsmProvider || !cwd || knowledgeGraphStatus.status === "running",
		[isZgsmProvider, cwd, knowledgeGraphStatus.status],
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

	// 获取状态 - 单次请求
	const getStatusOnce = useCallback(() => {
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.GET_STATUS)
	}, [sendMessage])

	// 停止轮询 - 简化逻辑
	const stopPolling = useCallback(() => {
		if (pollingIntervalId.current) {
			clearInterval(pollingIntervalId.current)
			pollingIntervalId.current = null
		}
	}, [])

	// 启动轮询 - 优化逻辑，避免竞态条件
	const startPolling = useCallback(() => {
		// 如果已经在轮询，则不重复启动
		if (pollingIntervalId.current) {
			return
		}
		
		// 启动新的轮询
		pollingIntervalId.current = setInterval(() => {
			getStatusOnce()
		}, POLLING_INTERVAL)
	}, [getStatusOnce])

	// 检查是否需要停止轮询
	const shouldStopPolling = useCallback((status: string) => {
		return STOP_POLLING_STATUSES.includes(status as any)
	}, [])

	// 检查是否需要启动轮询
	const shouldStartPolling = useCallback((status: string) => {
		return POLLING_STATUSES.includes(status as any)
	}, [])

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

	const handleStartBuild = useCallback(() => {
		setKnowledgeGraphStatus((prev: KnowledgeGraphBuildState) => ({ ...prev, status: "running" }))
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.BUILD)
		// 启动轮询
		startPolling()
	}, [startPolling, sendMessage])

	const handlePauseBuild = useCallback(() => {
		setIsPausing(true)
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.PAUSE)
		// 依赖后端推送的新状态来决定是否停止轮询
	}, [sendMessage])

	const handleResumeBuild = useCallback(() => {
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.RESUME)
		// 依赖后端推送的新状态来决定是否启动轮询
	}, [sendMessage])

	const handleClearBuild = useCallback(() => {
		// 清空时停止轮询，避免竞态条件
		stopPolling()
		// 立即更新本地状态为pending，避免显示错误状态
		setKnowledgeGraphStatus(createDefaultBuildState())
		sendMessage(KNOWLEDGE_GRAPH_MESSAGES.CLEAR)
		// 依赖后端推送的新状态
	}, [sendMessage, stopPolling])

	const getStatusIcon = useCallback((status: string) => {
		const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
		const iconClass = config?.icon || STATUS_CONFIG.pending.icon
		return <div className={iconClass}></div>
	}, [])

	const getStatusText = useCallback((status: string) => {
		const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
		const textKey = config?.textKey || "settings:ui.knowledgeGraph.status.unknown"
		return t(textKey)
	}, [t])

	// 获取禁用提示文本 - 简化复杂的三元表达式
	const getDisabledTooltipText = useCallback(() => {
		if (knowledgeGraphStatus.status === "running") {
			return t("settings.knowledgeGraph.cannotDisableWhileRunning")
		}
		if (!isZgsmProvider) {
			return t("settings.knowledgeGraph.onlyCostrictProviderSupport")
		}
		if (!cwd) {
			return t("settings.knowledgeGraph.disabled")
		}
		return t("settings.knowledgeGraph.disabled")
	}, [knowledgeGraphStatus.status, isZgsmProvider, cwd, t])

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message = event.data

			if (message.type === KNOWLEDGE_GRAPH_MESSAGES.STATUS_RESPONSE && message.payload?.status) {
				const statusInfo = message.payload.status as KnowledgeGraphBuildState
				
				// 处理暂停状态的UI反馈
				if (statusInfo.status === "paused") {
					setIsPausing(false)
				}

				// 原子性处理轮询控制 - 先停止再启动，避免竞态条件
				const needsPolling = shouldStartPolling(statusInfo.status)
				const shouldStop = shouldStopPolling(statusInfo.status)
				
				// 先处理停止轮询
				if (shouldStop) {
					stopPolling()
				}
				// 再处理启动轮询，确保没有重复轮询
				else if (needsPolling && !pollingIntervalId.current) {
					startPolling()
				}
				
				// 更新状态
				setKnowledgeGraphStatus(statusInfo)
			} else if (message.type === KNOWLEDGE_GRAPH_MESSAGES.ENABLED && setCachedStateField) {
				// 处理启用/禁用响应
				if (message.error) {
					console.error("Knowledge Graph Toggle Error:", message.error)
					setToggleError(message.error)
					// 强制设置为 false
					setCachedStateField("knowledgeGraphEnabled", false)
				} else {
					setToggleError(null)
					setCachedStateField("knowledgeGraphEnabled", message.payload)
					
					// 当知识图谱被启用时，立即获取状态
					if (message.payload) {
						getStatusOnce()
					}
				}
			}
		},
		[setCachedStateField, startPolling, stopPolling, getStatusOnce, shouldStopPolling, shouldStartPolling],
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
									<div>{t("settings:ui.knowledgeGraph.title")}</div>
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
				{toggleError && (
					<div className="mb-4 p-2 bg-vscode-textBlockQuote-background border border-vscode-input-border rounded">
						<div className="flex items-center gap-2">
							<AlertCircle className="w-4 h-4 text-red-500" />
							<span className="text-sm text-vscode-errorForeground">
								{toggleError}
							</span>
						</div>
					</div>
				)}
				<div className={`space-y-6 ${shouldDisableAll ? "opacity-50" : ""}`}>
					{/* Knowledge Graph Status Section */}
					<div className={`flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background ${shouldDisableAll ? "pointer-events-none" : ""}`}>
						<div className="flex items-center gap-4 font-bold">
							<FileText className="w-4 h-4" />
							<div>{t("settings:ui.knowledgeGraph.buildStatus")}</div>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mb-3">
							{t("settings:ui.knowledgeGraph.description")}
						</div>
						
						{(!isZgsmProvider || !cwd) ? (
							<div className="text-vscode-descriptionForeground text-sm italic py-4">
								{t("settings:ui.knowledgeGraph.enableToShowDetails")}
							</div>
						) : (
							<>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<div className="text-vscode-descriptionForeground text-sm">
											{t("settings:ui.knowledgeGraph.fileCount")}
										</div>
										<div className="font-medium">{knowledgeGraphStatus.totalFiles}</div>
									</div>
									<div>
										<div className="text-vscode-descriptionForeground text-sm">
											{t("settings:ui.knowledgeGraph.lastUpdated")}
										</div>
										<div className="font-medium">
											{knowledgeGraphStatus.lastUpdateTime
												? format(new Date(knowledgeGraphStatus.lastUpdateTime), "yyyy-MM-dd HH:mm:ss")
												: "-"
											}
										</div>
									</div>
								</div>

								<div className="mt-2">
									<div className="flex justify-between text-sm mb-1">
										<span>{t("settings:ui.knowledgeGraph.buildProgress")}</span>
										<span>{(knowledgeGraphStatus.progress || 0).toFixed(1)}%</span>
									</div>
									<Progress
										value={knowledgeGraphStatus.progress}
										className="h-2"
										progressBackgroundClass="bg-vscode-button-background"
									/>
									{knowledgeGraphStatus.status === "running" && knowledgeGraphStatus.currentFile && (
										<div className="text-xs text-vscode-descriptionForeground mt-1 truncate" title={knowledgeGraphStatus.currentFile}>
											Processing: {knowledgeGraphStatus.currentFile}
										</div>
									)}
								</div>

								{/* Status and Control Buttons */}
								<div className="flex items-center justify-between mt-3">
									<div className="flex items-center gap-2">
										{getStatusIcon(knowledgeGraphStatus.status)}
										<span>{getStatusText(knowledgeGraphStatus.status)}</span>
										{knowledgeGraphStatus.status === "error" && knowledgeGraphStatus.failedFiles > 0 && (
											<Badge variant="destructive" className="text-xs">
												{knowledgeGraphStatus.failedFiles}
											</Badge>
										)}
									</div>
									
									<div className="flex items-center gap-2">
										{knowledgeGraphStatus.status === "pending" && (
											<Button
												onClick={handleStartBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll}>
												<Play className="w-3 h-3" />
												{t("settings:ui.knowledgeGraph.start")}
											</Button>
										)}
										{knowledgeGraphStatus.status === "running" && (
											<Button
												onClick={handlePauseBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll || isPausing}>
												{isPausing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
												{t("settings:ui.knowledgeGraph.pause")}
											</Button>
										)}
										{knowledgeGraphStatus.status === "paused" && (
											<Button
												onClick={handleResumeBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll}>
												<Play className="w-3 h-3" />
												{t("settings:ui.knowledgeGraph.resume")}
											</Button>
										)}
										{(knowledgeGraphStatus.status === "completed" || knowledgeGraphStatus.status === "error") && (
											<Button
												onClick={handleClearBuild}
												variant="outline"
												size="sm"
												className="flex items-center gap-1"
												disabled={shouldDisableAll}>
												<Trash className="w-3 h-3" />
												{t("settings:ui.knowledgeGraph.clear")}
											</Button>
										)}
									</div>
								</div>

								{/* Error Details */}
								{knowledgeGraphStatus.status === "error" && knowledgeGraphStatus.error && (
									<div className="mt-2 p-2 bg-vscode-textBlockQuote-background border border-vscode-input-border rounded">
										<div className="flex items-center gap-2 mb-2">
											<AlertCircle className="w-4 h-4 text-red-500" />
											<span className="text-sm font-medium text-vscode-errorForeground">
												{t("settings:ui.knowledgeGraph.buildFailed")}
											</span>
										</div>
										<p className="text-sm text-vscode-errorForeground">
											{knowledgeGraphStatus.error}
										</p>
										{knowledgeGraphStatus.failedFiles > 0 && (
											<p className="text-xs text-vscode-descriptionForeground mt-1">
												{t("settings:ui.knowledgeGraph.failedFileCount", { count: knowledgeGraphStatus.failedFiles })}
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