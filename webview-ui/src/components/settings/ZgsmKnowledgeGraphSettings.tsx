import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { FileText, AlertCircle, Copy, Play, Pause, Trash } from "lucide-react"
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
	Popover,
	PopoverTrigger,
	PopoverContent,
	Badge,
} from "@/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SetCachedStateField } from "./types"
import { useEvent } from "react-use"

interface KnowledgeGraphSettingsProps {
	setCachedStateField?: SetCachedStateField<"knowledgeGraphEnabled">
}

interface KnowledgeGraphStatus {
	fileCount: number | string
	lastUpdated: string
	progress: number
	status: "success" | "failed" | "running" | "pending" | "paused"
	errorMessage?: string
	failedFiles?: string[]
}

// Knowledge graph status information type returned from backend
export interface KnowledgeGraphStatusInfo {
	status: "success" | "failed" | "running" | "pending" | "paused"
	process: number
	totalFiles: number
	totalSucceed: number
	totalFailed: number
	failedReason: string
	failedFiles: string[]
	processTs: number
	currentStage: "root_analysis" | "file_summary" | "directory_summary" | "dependency_graph" | "completed"
	stageProgress: number
}


// Convert backend KnowledgeGraphStatusInfo to KnowledgeGraphStatus format used by frontend component
const mapKnowledgeGraphStatusInfoToStatus = (statusInfo: KnowledgeGraphStatusInfo, t: (key: string) => string): KnowledgeGraphStatus => {
	let errorMessage: string | undefined
	let progress = 0

	switch (statusInfo.status) {
		case "running":
			progress = statusInfo.process
			break
		case "pending":
			progress = 0
			break
		case "success":
			progress = 100
			break
		case "failed":
			progress = statusInfo.process
			errorMessage = statusInfo.failedReason || t("settings:ui.knowledgeGraph.buildFailed")
			break
		case "paused":
			progress = statusInfo.process
			break
	}

	const lastUpdated = statusInfo.processTs
		? format(new Date(statusInfo.processTs * 1000), "yyyy-MM-dd HH:mm:ss")
		: "-"

	return {
		fileCount: statusInfo.totalFiles,
		lastUpdated,
		progress,
		status: statusInfo.status,
		errorMessage,
		failedFiles: (statusInfo.failedFiles || []).filter((file: string) => file !== ""),
	}
}

export const KnowledgeGraphSettings = ({ setCachedStateField }: KnowledgeGraphSettingsProps) => {
	const { t } = useAppTranslation()
	const {
		knowledgeGraphEnabled,
		knowledgeGraphStatus: initialStatus,
		apiConfiguration,
		cwd	} = useExtensionState()
	
	// Polling related states
	const pollingIntervalId = useRef<NodeJS.Timeout | null>(null)
	const isPollingActive = useRef<boolean>(false)

	// Check if in pending enable state - only when API provider is not zgsm
	const isPendingEnable = useMemo(
		() => apiConfiguration?.apiProvider !== "zgsm" || !cwd,
		[apiConfiguration?.apiProvider, cwd],
	)

	// Use useMemo to avoid unnecessary state updates
	const shouldDisableAll = useMemo(
		() => isPendingEnable || !knowledgeGraphEnabled,
		[isPendingEnable, knowledgeGraphEnabled],
	)

	const [knowledgeGraphStatus, setKnowledgeGraphStatus] = useState<KnowledgeGraphStatus>(() => {
		if (initialStatus) {
			return mapKnowledgeGraphStatusInfoToStatus(initialStatus, t)
		}
		return {
			fileCount: "-",
			lastUpdated: "-",
			progress: 0,
			status: "pending",
		}
	})


	// Stop polling
	const stopPolling = useCallback(() => {
		if (pollingIntervalId.current) {
			clearInterval(pollingIntervalId.current)
			pollingIntervalId.current = null
		}
		isPollingActive.current = false
	}, [])

	// Start polling - only for running states with intelligent intervals
	const startPolling = useCallback(() => {
		// If already polling, return directly
		if (isPollingActive.current) {
			return
		}

		// Stop previous polling first
		if (pollingIntervalId.current) {
			clearInterval(pollingIntervalId.current)
			pollingIntervalId.current = null
		}

		// Mark polling status as active
		isPollingActive.current = true

		// Get status immediately
		vscode.postMessage({
			type: "knowledgeGraphGetStatus",
		})

		// Only start interval polling if status is running
		if (knowledgeGraphStatus.status === 'running') {
			// Use longer interval (6 seconds) to reduce server load
			pollingIntervalId.current = setInterval(() => {
				// Double check if we should continue polling
				if (knowledgeGraphStatus.status === 'success' ||
					knowledgeGraphStatus.status === 'failed' ||
					knowledgeGraphStatus.status === 'pending' ||
					knowledgeGraphStatus.status === 'paused') {
					// Stop polling for terminal states and paused state
					stopPolling()
					return
				}
				
				vscode.postMessage({
					type: "knowledgeGraphGetStatus",
				})
			}, 6000) // 增加到6秒，减少轮询频率
		}
	}, [knowledgeGraphStatus.status, stopPolling])

	// Get status once without polling
	const getStatusOnce = useCallback(() => {
		vscode.postMessage({
			type: "knowledgeGraphGetStatus",
		})
	}, [])

	// Check if polling should be stopped (task is completed or failed)

	// Handle messages from extension
	useEffect(() => {
		// 1. Get build status once when page is opened
		if (knowledgeGraphEnabled && !isPendingEnable) {
			// Get status immediately without polling
			getStatusOnce()
		}

		return () => {
			// Stop polling when page is closed
			stopPolling()
		}
	}, [
		knowledgeGraphEnabled,
		isPendingEnable,
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
		vscode.postMessage({ type: "knowledgeGraphEnabled", bool: newChecked })
	}, [knowledgeGraphEnabled])

	const handleStartBuild = useCallback(() => {
		setKnowledgeGraphStatus((prev) => ({ ...prev, status: "running", progress: 0 }))

		// Send start build message to extension
		vscode.postMessage({
			type: "knowledgeGraphBuild",
		})

		// Start polling after a longer delay to allow backend to initialize properly
		setTimeout(() => {
			startPolling()
		}, 2000) // 增加延迟到2秒，给后端更多初始化时间
	}, [startPolling])

	const handlePauseBuild = useCallback(() => {
		// 先停止轮询
		stopPolling()
		
		// 更新本地状态为暂停
		setKnowledgeGraphStatus((prev) => ({ ...prev, status: "paused" }))
		
		vscode.postMessage({
			type: "knowledgeGraphPause",
		})
	}, [stopPolling])

	const handleResumeBuild = useCallback(() => {
		// 先更新本地状态为运行中
		setKnowledgeGraphStatus((prev) => ({ ...prev, status: "running" }))
		
		vscode.postMessage({
			type: "knowledgeGraphResume",
		})
		
		// 开始轮询，使用较短延迟因为是恢复操作
		setTimeout(() => {
			startPolling()
		}, 1000) // 增加到1秒，避免过于频繁的状态切换
	}, [startPolling])

	const handleClearBuild = useCallback(() => {
		// 先停止轮询，避免状态冲突
		stopPolling()
		
		// 立即更新本地状态为pending，避免显示错误状态
		setKnowledgeGraphStatus({
			fileCount: 0,
			lastUpdated: "-",
			progress: 0,
			status: "pending",
			errorMessage: undefined,
			failedFiles: []
		})
		
		vscode.postMessage({
			type: "knowledgeGraphClear",
		})

		// 清除后获取一次状态确认
		setTimeout(() => {
			getStatusOnce()
		}, 500)
	}, [stopPolling, getStatusOnce])



	const handleOpenFailedFile = useCallback((filePath: string) => {
		vscode.postMessage({
			type: "openFile",
			text: filePath,
			values: {},
		})
	}, [])

	const getStatusIcon = useCallback((status: string) => {
		switch (status) {
			case "running":
				return <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
			case "pending":
				return <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse"></div>
			case "success":
				return <div className="w-3 h-3 bg-green-500 rounded-full"></div>
			case "failed":
				return <div className="w-3 h-3 bg-red-500 rounded-full"></div>
			case "paused":
				return <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
			default:
				return <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
		}
	}, [])

	const getStatusText = useCallback((status: string) => {
		switch (status) {
			case "running":
				return t("settings:ui.knowledgeGraph.status.running")
			case "pending":
				return t("settings:ui.knowledgeGraph.status.pending")
			case "success":
				return t("settings:ui.knowledgeGraph.status.success")
			case "failed":
				return t("settings:ui.knowledgeGraph.status.failed")
			case "paused":
				return t("settings:ui.knowledgeGraph.status.paused")
			default:
				return t("settings:ui.knowledgeGraph.status.unknown")
		}
	}, [t])

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message = event.data

			if (message.type === "knowledgeGraphStatusResponse" && message.payload?.status) {
				const statusInfo = message.payload.status as KnowledgeGraphStatusInfo
				const newStatus = mapKnowledgeGraphStatusInfoToStatus(statusInfo, t)
				
				// 特殊处理：如果是pending状态且进度为0，确保前端显示正确
				if (statusInfo.status === "pending" && statusInfo.process === 0) {
					setKnowledgeGraphStatus({
						...newStatus,
						progress: 0,
						fileCount: 0,
						lastUpdated: "-"
					})
				} else {
					setKnowledgeGraphStatus(newStatus)
				}

				// 智能轮询控制：只在运行状态时轮询，其他状态停止轮询
				const currentlyPolling = isPollingActive.current
				const shouldPoll = statusInfo.status === "running"
				
				if (shouldPoll && !currentlyPolling) {
					// 需要轮询但当前没有轮询，延迟启动轮询避免过于频繁
					setTimeout(() => {
						if (knowledgeGraphStatus.status === "running") {
							startPolling()
						}
					}, 1000)
				} else if (!shouldPoll && currentlyPolling) {
					// 不需要轮询但当前在轮询，立即停止轮询
					stopPolling()
				}
			} else if (message.type === "knowledgeGraphBuildProgress" && message.payload?.progress) {
				// 处理构建进度消息
				const progress = message.payload.progress
				const newProgressStatus = progress.phase === 'completed' ? 'success' : 'running'
				
				setKnowledgeGraphStatus((prev) => ({
					...prev,
					progress: progress.percentage,
					status: newProgressStatus,
				}))
				
				// 如果构建完成，停止轮询
				if (progress.phase === 'completed') {
					stopPolling()
				}
			} else if (message.type === "knowledgeGraphEnabled" && setCachedStateField) {
				setCachedStateField("knowledgeGraphEnabled", message.payload)
				
				// 当知识图谱被启用时，立即获取状态
				if (message.payload) {
					setTimeout(() => {
						getStatusOnce()
					}, 500) // 延迟500ms确保后端初始化完成
				}
			}
		},
		[setCachedStateField, startPolling, stopPolling, t, getStatusOnce],
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
										disabled={isPendingEnable}
									/>
									<div>{t("settings:ui.knowledgeGraph.title")}</div>
								</div>
							</TooltipTrigger>
							{isPendingEnable && (
								<TooltipContent>
									<p>
										{!cwd
											? t("settings:ui.knowledgeGraph.disabled")
											: t("settings:ui.knowledgeGraph.onlyCostrictProviderSupport")}
									</p>
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
				</div>
			</SectionHeader>

			<Section>
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
						
						{isPendingEnable ? (
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
										<div className="font-medium">{knowledgeGraphStatus.fileCount}</div>
									</div>
									<div>
										<div className="text-vscode-descriptionForeground text-sm">
											{t("settings:ui.knowledgeGraph.lastUpdated")}
										</div>
										<div className="font-medium">{knowledgeGraphStatus.lastUpdated}</div>
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
								</div>

								{/* Status and Control Buttons */}
								<div className="flex items-center justify-between mt-3">
									<div className="flex items-center gap-2">
										{getStatusIcon(knowledgeGraphStatus.status)}
										<span>{getStatusText(knowledgeGraphStatus.status)}</span>
										{knowledgeGraphStatus.status === "failed" && knowledgeGraphStatus.failedFiles && knowledgeGraphStatus.failedFiles.length > 0 && (
											<Badge variant="destructive" className="text-xs">
												{knowledgeGraphStatus.failedFiles.length}
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
												disabled={shouldDisableAll}>
												<Pause className="w-3 h-3" />
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
										{(knowledgeGraphStatus.status === "success" || knowledgeGraphStatus.status === "failed") && (
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

								{/* Failed Files Details */}
								{knowledgeGraphStatus.status === "failed" && knowledgeGraphStatus.failedFiles && knowledgeGraphStatus.failedFiles.length > 0 && (
									<Popover>
										<PopoverTrigger asChild>
											<Button variant="ghost" size="sm" className="h-6 px-2 text-xs mt-2">
												<AlertCircle className="w-3 h-3 mr-1" />
												{t("settings:ui.knowledgeGraph.viewFailedFiles")}
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-80 max-h-60 overflow-y-auto">
											<div className="space-y-3">
												<div className="flex items-center gap-2">
													<AlertCircle className="w-4 h-4 text-red-500" />
													<h4 className="font-medium">
														{t("settings:ui.knowledgeGraph.failedFilesTitle")}
													</h4>
												</div>

												{knowledgeGraphStatus.errorMessage && (
													<p className="text-sm text-vscode-errorForeground">
														{knowledgeGraphStatus.errorMessage}
													</p>
												)}

												<div className="space-y-2">
													<div className="flex justify-between items-center">
														<p className="text-sm font-medium">
															{t("settings:ui.knowledgeGraph.failedFileList")}
														</p>
														<Button
															variant="ghost"
															size="sm"
															className="h-6 px-2 text-xs"
															onClick={async () => {
																try {
																	const fileText =
																		knowledgeGraphStatus.failedFiles?.join(
																			"\n",
																		) || ""
																	await navigator.clipboard.writeText(
																		fileText,
																	)
																} catch (error) {
																	console.error(
																		"Failed to copy to clipboard:",
																		error,
																	)
																}
															}}
															disabled={shouldDisableAll}>
															<Copy className="w-3 h-3 mr-1" />
															{t("settings:ui.knowledgeGraph.copy")}
														</Button>
													</div>
													<div className="max-h-40 overflow-y-auto border border-vscode-input-border rounded p-2 bg-vscode-textBlockQuote-background">
														<ul className="text-xs space-y-1">
															{knowledgeGraphStatus.failedFiles.map((file: string, index: number) => (
																<li
																	key={`${file}-${index}`}
																	className={`text-vscode-errorForeground font-mono p-1 rounded transition-colors duration-150 ${shouldDisableAll ? "" : "hover:bg-vscode-list-hoverBackground cursor-pointer hover:text-vscode-foreground hover:underline"}`}
																	onClick={() =>
																		!shouldDisableAll &&
																		handleOpenFailedFile(file)
																	}>
																	{file}
																</li>
															))}
														</ul>
													</div>
												</div>
											</div>
										</PopoverContent>
									</Popover>
								)}
							</>
						)}
					</div>

				</div>
			</Section>
		</div>
	)
}