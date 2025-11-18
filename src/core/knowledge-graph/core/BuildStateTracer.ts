import type { KnowledgeGraphBuildState, BuildProgress, FileInfo, FileChanges } from "../types"
import { ILogger } from "../../../utils/logger"
import { IStorage } from "../storage/IStorage"
import { StorageUtils } from "../storage/StorageUtils"
import { string } from "zod"

const FILES_LIST_FILE = "files.json"
const BUILD_STATE_FILE = "build_state.json"

export class BuildStateTracer {
	private storage: IStorage
	private logger: ILogger
	private currentState: KnowledgeGraphBuildState | undefined

	constructor(storage: IStorage, logger: ILogger) {
		this.storage = storage
		this.logger = logger
	}

	public async init(): Promise<KnowledgeGraphBuildState> {
		const state = await this.load()
		if (!state) {
			this.currentState = await this.initializeEmptyState()
		} else {
			this.currentState = state
		}
		return this.currentState!
	}

	/**
	 * 初始化空状态
	 */
	private async initializeEmptyState(): Promise<KnowledgeGraphBuildState> {
		const emptyState: KnowledgeGraphBuildState = {
			enabled: false,
			isRunning: false,
			isPaused: false,
			progress: 0,
			totalFiles: 0,
			totalFilesToProcess: 0,
			processedFiles: 0,
			failedFiles: 0,
			currentFile: "",
			status: "idle" as const,
			lastUpdateTime: new Date().toISOString(),
			totalDuration: 0,
			phase: "root_analysis",
		}
		await this.saveBuildState(emptyState)
		return emptyState
	}

	/**
	 * 初始化构建状态
	 */
	public async initializeBuildState(
		workspacePath: string,
		totalFiles: number,
		totalFilesToProcess: number,
	): Promise<void> {
		if (!this.storage) throw new Error("存储未初始化")

		// 初始化存储文件
		await this.storage.initialize()

		if (workspacePath == null) {
			throw new Error("workspace is empty")
		}

		try {
			const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
			const startTime = new Date().toLocaleDateString()

			let taskState: KnowledgeGraphBuildState = {
				isRunning: true,
				isPaused: false,
				taskId,
				phase: "root_analysis",
				progress: 0,
				startTime,
				lastUpdateTime: startTime,
				totalRequests: 0,
				totalDuration: 0,
				totalTokens: { input: 0, output: 0 },
				status: "running",
				totalFiles,
				processedFiles: 0,
				failedFiles: 0,
				currentFile: "",
				enabled: true,
				totalFilesToProcess: totalFilesToProcess,
			}

			await this.updateBuildState(taskState)
			this.logger.info(`[BuildStateTracer] 初始化构建任务: ${taskId}, 总文件数: ${totalFiles}`)

			// 更新内部状态
			this.currentState = taskState
		} catch (error) {
			throw new Error(`初始化任务状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 增加已处理文件数
	 */
	async incrementProcessedFiles(): Promise<void> {
		const currentState = this.currentState
		if (currentState) {
			const newProcessedFiles = currentState.processedFiles + 1

			// 重新计算整体进度 - 基于阶段权重
			const phaseWeights = {
				root_analysis: 0.1,
				file_analysis: 0.8,
				directory_analysis: 0.1,
			}

			// 计算当前阶段的进度
			let currentPhaseProgress = 0
			if (currentState.phase === "file_analysis" && currentState.totalFiles > 0) {
				currentPhaseProgress = (newProcessedFiles / currentState.totalFiles) * 100
			} else if (currentState.phase === "root_analysis") {
				currentPhaseProgress = 100 // 根分析完成
			}

			// 计算总体进度
			let overallProgress = 0
			const phases = ["root_analysis", "file_analysis", "directory_analysis"]
			const currentPhaseIndex = phases.indexOf(currentState.phase)

			// 已完成的阶段
			for (let i = 0; i < currentPhaseIndex; i++) {
				overallProgress += phaseWeights[phases[i] as keyof typeof phaseWeights] * 100
			}

			// 当前阶段的进度
			if (currentPhaseIndex >= 0) {
				overallProgress += phaseWeights[currentState.phase as keyof typeof phaseWeights] * currentPhaseProgress
			}

			await this.updateBuildState({
				processedFiles: newProcessedFiles,
				progress: Math.min(100, overallProgress),
			})

			this.logger.info(
				`[BuildStateTracer] 进度: ${newProcessedFiles}/${currentState.totalFiles} (${overallProgress.toFixed(1)}%)`,
			)
		}
	}

	/**
	 * 更新构建状态 - 支持部分更新
	 */
	public async updateBuildState(updates: Partial<KnowledgeGraphBuildState>): Promise<void> {
		try {
			const currentState = this.currentState
			if (!currentState) {
				throw new Error("构建状态不存在，无法更新")
			}

			const updatedState: KnowledgeGraphBuildState = {
				...currentState,
				...updates,
				lastUpdateTime: new Date().toISOString(), // 总是更新时间戳
			}

			// 如果更新了进度，确保在有效范围内
			if (updates.progress !== undefined) {
				updatedState.progress = Math.max(0, Math.min(100, updates.progress))
			}

			await this.saveBuildState(updatedState)
		} catch (error) {
			throw new Error(`更新构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 保存构建状态
	 */
	async saveBuildState(state: KnowledgeGraphBuildState): Promise<void> {
		try {
			// 确保状态包含所有必需字段
			const currentStatus: KnowledgeGraphBuildState = {
				taskId: state.taskId,
				phase: state.phase,
				progress: Math.max(0, Math.min(100, state.progress)), // 确保在0-100范围内
				startTime: state.startTime,
				lastUpdateTime: new Date().toISOString(), // 始终更新为当前时间
				totalRequests: state.totalRequests || 0,
				totalDuration: state.totalDuration || 0,
				totalTokens: {
					input: state.totalTokens?.input || 0,
					output: state.totalTokens?.output || 0,
				},
				status: state.status,
				totalFiles: state.totalFiles || 0,
				processedFiles: state.processedFiles || 0,
				failedFiles: state.failedFiles || 0,
				currentFile: state.currentFile || "",
				error: state.error,
				enabled: state.enabled,
				isRunning: state.isRunning,
				isPaused: state.isPaused,
				totalFilesToProcess: state.totalFilesToProcess || 0,
			}

			await this.storage.overwrite(BUILD_STATE_FILE, currentStatus)
			this.logger.info(
				`[BuildStateTracer] 状态已保存: ${currentStatus.status} (${currentStatus.progress.toFixed(1)}%)`,
			)
		} catch (error) {
			throw new Error(`保存构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 更新请求统计
	 */
	async updateRequestStats(
		requestCount: number,
		duration: number,
		tokens: { input: number; output: number },
	): Promise<void> {
		const currentState = this.currentState
		if (currentState) {
			// 给可能未定义的属性加默认值
			const currentTotalRequests = currentState.totalRequests ?? 0 // 若为undefined，默认0
			const currentTotalDuration = currentState.totalDuration ?? 0
			// 处理totalTokens（若整个对象未定义，默认初始化为{input:0, output:0}）
			const currentTotalTokens = currentState.totalTokens ?? { input: 0, output: 0 }

			await this.updateBuildState({
				totalRequests: currentTotalRequests + requestCount,
				totalDuration: currentTotalDuration + duration,
				totalTokens: {
					input: (currentTotalTokens.input ?? 0) + tokens.input, // 子属性也加默认值
					output: (currentTotalTokens.output ?? 0) + tokens.output,
				},
			})
		}
	}

	async initializeFileRecords(files: FileInfo[]): Promise<FileChanges> {
		try {
			// 初始化文件历史记录（若为空则设为默认空对象）
			const fileList = (await this.getFilesList()) || {}
			const result: FileChanges = { added: [], modified: [], deleted: [] }

			// 提取当前文件路径集合，用于快速判断删除的文件
			const currentFilePaths = new Set(files.map((file) => file.path))

			// 处理新增和修改的文件
			for (const file of files) {
				const existingRecord = fileList[file.path]
				// 生成要更新的记录（复用逻辑，减少重复代码）
				const newRecord = {
					timestamp: file.lastModified,
					hash: file.hash,
					status: "pending" as const, // 明确类型为字符串字面量
				}

				if (!existingRecord) {
					// 路径不存在于历史记录 → 新增文件
					result.added.push(file)
				} else if (file.hash !== existingRecord.hash) {
					// 哈希值变化 → 修改文件
					result.modified.push(file)
				} else {
					// 无变化 → 不处理
					continue
				}

				// 无论新增还是修改，都更新历史记录
				fileList[file.path] = newRecord
			}

			// 处理删除的文件（历史记录存在但当前文件列表不存在的路径）
			for (const existingPath of Object.keys(fileList)) {
				if (!currentFilePaths.has(existingPath)) {
					// 补充删除文件的基础信息（默认值统一维护）
					result.deleted.push({
						path: existingPath,
						size: 0,
						lastModified: 0,
						hash: "",
					})
					delete fileList[existingPath]
				}
			}

			// 保存更新后的历史记录
			await this.saveFilesList(fileList)

			return result
		} catch (error) {
			throw new Error(`初始化文件记录失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 读取或初始化文件列表 - 新格式：包含状态信息
	 */
	public async getFilesList(): Promise<
		| Record<string, { timestamp: number; status: "pending" | "processing" | "success" | "failed"; hash: string }>
		| undefined
	> {
		try {
			const content = await this.storage.load(FILES_LIST_FILE)
			// 为空处理
			if (!content) {
				return undefined
			}
			const data = JSON.parse(content)

			// 兼容旧格式：如果是数字，转换为新格式
			const result: Record<
				string,
				{ timestamp: number; status: "pending" | "processing" | "success" | "failed"; hash: string }
			> = {}
			for (const [path, value] of Object.entries(data)) {
				result[path] = {
					timestamp: (value as any).timestamp || 0,
					status: (value as any).status || "pending",
					hash: (value as any).hash || "",
				}
			}
			return result
		} catch (error) {
			this.logger.error("[BuildStateTracer] 获取构建状态失败:", error)
			return {}
		}
	}

	/**
	 * 保存文件列表 - 新格式：包含状态信息
	 */
	private async saveFilesList(
		files: Record<
			string,
			{ timestamp: number; status: "pending" | "processing" | "success" | "failed"; hash?: string }
		>,
	): Promise<void> {
		await this.storage.overwrite(FILES_LIST_FILE, files)
	}

	/**
	 * 更新进度
	 */
	public async updateProgress(
		phase: BuildProgress["phase"],
		processedFilesPaths: string[] | undefined = undefined,
		failed: number,
		errorMessage: string,
	): Promise<void> {
		// 更新files.json
		await this.updateFileList(processedFilesPaths, "success")

		return this.updateBuildState({
			phase: phase,
			processedFiles: processedFilesPaths?.length,
			failedFiles: failed,
			error: errorMessage,
		})
	}

	private async updateFileList(
		processedFilesPaths: string[] | undefined,
		buildStatus: "pending" | "processing" | "success" | "failed",
	) {
		let fileList = await this.getFilesList()
		if (!fileList) {
			throw new Error("file.json not exists, cannot update.")
		}
		// 处理已完成的文件路径（更新状态为 success）
		if (processedFilesPaths && processedFilesPaths.length > 0) {
			processedFilesPaths.forEach((filePath) => {
				// 检查 key 是否存在于文件列表中
				if (Object.prototype.hasOwnProperty.call(fileList, filePath)) {
					// 更新状态为 success，保留其他字段（timestamp、hash）
					fileList[filePath] = {
						...fileList[filePath],
						status: buildStatus,
					}
				} else {
					this.logger.warn(`[BuildStateTracer] 文件路径未找到: ${filePath}`)
				}
			})
		}

		await this.saveFilesList(fileList)
	}

	/**
	 * 获取当前状态
	 */
	public getCurrentState(): KnowledgeGraphBuildState | undefined {
		return this.currentState
	}

	/**
	 * 从存储加载状态
	 */
	public async load(): Promise<KnowledgeGraphBuildState | null> {
		try {
			const content = await this.storage.load(BUILD_STATE_FILE)
			if (!content) {
				return null
			}
			return StorageUtils.deserialize<KnowledgeGraphBuildState>(content)
		} catch (error) {
			this.logger.error("[BuildStateTracer] 获取构建状态失败:", error)
			throw new Error(`[BuildStateTracer] get build state failed: ${error}`)
		}
	}

	/**
	 * 清除状态
	 */
	public async clear(): Promise<void> {
		try {
			await this.storage.clear(BUILD_STATE_FILE)
		} catch (error) {
			throw new Error(`删除构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 检查是否正在运行
	 */
	public isRunning(): boolean | undefined {
		return this.currentState?.isRunning
	}

	/**
	 * 检查是否已暂停
	 */
	public isPaused(): boolean | undefined {
		return this.currentState?.isPaused
	}

	/**
	 * 检查是否已完成
	 */
	public isCompleted(): boolean | undefined {
		return this.currentState?.status === "completed"
	}

	/**
	 * 检查是否有错误
	 */
	public hasError(): boolean | undefined {
		return this.currentState?.status === "error"
	}
}
