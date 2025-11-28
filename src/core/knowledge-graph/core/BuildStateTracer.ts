import type { KnowledgeGraphBuildState, BuildProgress, FileInfo, FileChanges } from "../types"
import { ILogger } from "../../../utils/logger"
import { IStorage } from "../storage/IStorage"
import { StorageUtils } from "../storage/StorageUtils"
import { PathUtils } from "../tools/PathUtils"
import { KNOWLEDGE_GRAPH_STATUS, KNOWLEDGE_GRAPH_PHASE } from "@roo-code/types"
import { Mutex } from "../utils/Mutex"

const FILES_LIST_FILE = "files.json"
const BUILD_STATE_FILE = "build_state.json"

export class BuildStateTracer {
	private storage: IStorage
	private logger: ILogger
	private currentState: KnowledgeGraphBuildState | undefined
	private mutex = new Mutex()

	constructor(storage: IStorage, logger: ILogger) {
		this.storage = storage
		this.logger = logger
	}

	public async init(): Promise<KnowledgeGraphBuildState> {
		const state = await this.load()
		if (!state) {
			this.currentState = await this.createBuildState({
				progress: 0,
				totalFiles: 0,
				totalFilesToProcess: 0,
				processedFiles: 0,
				failedFiles: 0,
				currentFile: "",
				status: KNOWLEDGE_GRAPH_STATUS.PENDING,
				phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
				totalDuration: 0,
				lastUpdateTime: new Date().toISOString(),
			} as KnowledgeGraphBuildState)
		} else {
			this.currentState = state
		}
		return this.currentState!
	}

	/**
	 * 初始化构建状态
	 */
	public async initializeBuildState(
		workspacePath: string,
		totalFiles: number,
		totalFilesToProcess: number,
		initialProcessedFiles: number = 0,
	): Promise<void> {
		return this.mutex.withLock(async () => {
			if (!this.storage) throw new Error("存储未初始化")

			// 初始化存储文件
			await this.storage.initialize()

			if (workspacePath == null) {
				throw new Error("workspace is empty")
			}

			// ✅ 移除状态检查：调用者（GraphBuilder.start）已经在更新状态前检查过了
			// 此时状态已经是 RUNNING，不需要再检查

			try {
				const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
				const startTime = new Date().toISOString()

				let taskState: KnowledgeGraphBuildState = {
					taskId,
					phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
					progress: 0,
					startTime,
					lastUpdateTime: startTime,
					totalDuration: 0,
					status: KNOWLEDGE_GRAPH_STATUS.RUNNING,
					totalFiles,
					processedFiles: initialProcessedFiles,
					failedFiles: 0,
					currentFile: "",
					totalFilesToProcess: totalFilesToProcess,
					phaseProgress: {
						root_analysis: { processed: 0, total: 1, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
						file_analysis: {
							processed: 0,
							total: totalFilesToProcess,
							status: KNOWLEDGE_GRAPH_STATUS.PENDING,
						},
						directory_analysis: { processed: 0, total: 0, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
					},
					llmStatistics: {
						totalInputTokens: 0,
						totalOutputTokens: 0,
						totalTokens: 0,
						totalRequests: 0,
						successfulRequests: 0,
						failedRequests: 0,
						totalDuration: 0,
					},
				}

				// ✅ 使用不加锁的版本，避免嵌套锁死锁
				this.currentState = await this.createBuildStateUnlocked(taskState)
				this.logger.info(`[BuildStateTracer] 初始化构建任务: ${taskId}, 总文件数: ${totalFiles}`)
			} catch (error) {
				throw new Error(`初始化任务状态失败: ${error instanceof Error ? error.message : String(error)}`)
			}
		})
	}

	/**
	 * 统一的构建状态更新方法 - 同时支持文件列表更新
	 * 修复：添加事务性保证和回滚机制
	 */
	public async updateBuildState(
		updates: Partial<KnowledgeGraphBuildState>,
		filePaths?: string[],
		fileStatus?: "pending" | "success" | "failed",
	): Promise<void> {
		return this.mutex.withLock(async () => {
			// 备份当前状态（用于回滚）
			let fileListBackup: any = null
			const stateBackup = this.currentState

			try {
				// 1. 如果需要更新文件列表，先备份
				if (filePaths && fileStatus) {
					fileListBackup = await this.getFilesList()
				}

				if (!this.currentState) {
					throw new Error("构建状态不存在，无法更新")
				}

				// 2. 更新文件列表
				if (filePaths && fileStatus) {
					await this.updateFileList(filePaths, fileStatus)
				}

				// 3. 计算新状态
				const updatedState: KnowledgeGraphBuildState = {
					...this.currentState,
					...updates,
					lastUpdateTime: new Date().toISOString(),
				}

				// 统一进度计算
				if (updates.processedFiles !== undefined || updates.phase !== undefined) {
					updatedState.progress = this.calculateProgress(updatedState)
				}

				// 4. 保存状态到磁盘（原子操作）
				await this.storage.overwrite(BUILD_STATE_FILE, updatedState)

				// 5. 只有磁盘写入成功后才更新内存状态
				this.currentState = updatedState

				this.logger.info(
					`[BuildStateTracer] 状态已更新: ${updatedState.status} (${updatedState.progress.toFixed(1)}%)`,
				)
			} catch (error) {
				// 6. 发生错误时回滚
				this.logger.error("[BuildStateTracer] 状态更新失败，尝试回滚", error)

				// 回滚文件列表
				if (fileListBackup) {
					try {
						await this.saveFilesList(fileListBackup)
						this.logger.info("[BuildStateTracer] 文件列表已回滚")
					} catch (rollbackError) {
						this.logger.error("[BuildStateTracer] 文件列表回滚失败", rollbackError)
					}
				}

				// 恢复内存状态
				this.currentState = stateBackup

				throw new Error(`更新构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
			}
		})
	}

	/**
	 * 创建新的构建状态（内部方法，不使用锁，由调用者负责加锁）
	 */
	private async createBuildStateUnlocked(state: KnowledgeGraphBuildState): Promise<KnowledgeGraphBuildState> {
		try {
			const newState: KnowledgeGraphBuildState = {
				taskId: state.taskId,
				phase: state.phase || KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
				progress: 0,
				startTime: state.startTime || new Date().toISOString(),
				lastUpdateTime: new Date().toISOString(),
				totalDuration: state.totalDuration || 0,
				status: state.status || KNOWLEDGE_GRAPH_STATUS.PENDING,
				totalFiles: state.totalFiles || 0,
				processedFiles: state.processedFiles || 0,
				failedFiles: state.failedFiles || 0,
				currentFile: state.currentFile || "",
				error: state.error,
				totalFilesToProcess: state.totalFilesToProcess || 0,
				llmStatistics: state.llmStatistics || {
					totalInputTokens: 0,
					totalOutputTokens: 0,
					totalTokens: 0,
					totalRequests: 0,
					successfulRequests: 0,
					failedRequests: 0,
					totalDuration: 0,
				},
			}

			newState.progress = this.calculateProgress(newState)
			await this.storage.overwrite(BUILD_STATE_FILE, newState)
			this.currentState = newState

			this.logger.info(`[BuildStateTracer] 状态已创建: ${newState.status} (${newState.progress.toFixed(1)}%)`)

			return newState
		} catch (error) {
			throw new Error(`创建构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 创建新的构建状态（公共方法，使用锁）
	 */
	private async createBuildState(state: KnowledgeGraphBuildState): Promise<KnowledgeGraphBuildState> {
		return this.mutex.withLock(async () => {
			return await this.createBuildStateUnlocked(state)
		})
	}

	/**
	 * 统一的进度计算方法（简化版，基于 phaseProgress）
	 */
	private calculateProgress(state: KnowledgeGraphBuildState): number {
		if (state.status === "completed") {
			return 100
		}

		// 阶段权重配置
		const phaseWeights = {
			[KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS]: 0.05,
			[KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS]: 0.85,
			[KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS]: 0.1,
		}

		// 统一使用 phaseProgress 计算进度
		if (!state.phaseProgress) {
			// phaseProgress 未初始化，返回 0
			return 0
		}

		let totalProgress = 0

		// 根目录分析
		if (state.phaseProgress.root_analysis) {
			const { processed, total, status } = state.phaseProgress.root_analysis
			const progress = status === "completed" ? 1 : total > 0 ? processed / total : 0
			totalProgress += progress * phaseWeights[KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS] * 100
		}

		// 文件分析
		if (state.phaseProgress.file_analysis) {
			const { processed, total, status } = state.phaseProgress.file_analysis
			const progress = status === "completed" ? 1 : total > 0 ? processed / total : 0
			totalProgress += progress * phaseWeights[KNOWLEDGE_GRAPH_PHASE.FILE_ANALYSIS] * 100
		}

		// 目录分析
		if (state.phaseProgress.directory_analysis) {
			const { processed, total, status } = state.phaseProgress.directory_analysis
			const progress = status === "completed" ? 1 : total > 0 ? processed / total : 0
			totalProgress += progress * phaseWeights[KNOWLEDGE_GRAPH_PHASE.DIRECTORY_ANALYSIS] * 100
		}

		return Math.max(0, Math.min(100, totalProgress))
	}

	/**
	 * 更新阶段进度
	 */
	public async updatePhaseProgress(
		phase: "root_analysis" | "file_analysis" | "directory_analysis",
		processed: number,
		total?: number,
		status?: "pending" | "running" | "completed",
	): Promise<void> {
		return this.mutex.withLock(async () => {
			if (!this.currentState) {
				throw new Error("构建状态不存在，无法更新阶段进度")
			}

			// 确保 phaseProgress 存在
			if (!this.currentState.phaseProgress) {
				this.currentState.phaseProgress = {
					root_analysis: { processed: 0, total: 1, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
					file_analysis: {
						processed: 0,
						total: this.currentState.totalFilesToProcess,
						status: KNOWLEDGE_GRAPH_STATUS.PENDING,
					},
					directory_analysis: { processed: 0, total: 0, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
				}
			}

			// 更新指定阶段的进度
			const currentPhaseProgress =
				this.currentState.phaseProgress[phase as keyof typeof this.currentState.phaseProgress]
			this.currentState.phaseProgress[phase as keyof typeof this.currentState.phaseProgress] = {
				processed,
				total: total !== undefined ? total : currentPhaseProgress.total,
				status: status || currentPhaseProgress.status,
			}

			// 重新计算总进度
			this.currentState.progress = this.calculateProgress(this.currentState)
			this.currentState.lastUpdateTime = new Date().toISOString()

			// 保存状态
			await this.storage.overwrite(BUILD_STATE_FILE, this.currentState)
		})
	}

	public async resolveFileList(files: FileInfo[]): Promise<FileChanges> {
		return this.mutex.withLock(async () => {
			try {
				// 初始化文件历史记录（若为空则设为默认空对象）
				const previousFileList = (await this.getFilesList()) || {}
				const result: FileChanges = { added: [], modified: [], deleted: [], unchangedCount: 0 }

				// 提取当前文件路径集合，用于快速判断删除的文件
				const currentFilePaths = new Set(files.map((file) => file.path))

				// 处理新增和修改的文件
				for (const file of files) {
					const existingRecord = previousFileList[file.path]
					// 生成要更新的记录（复用逻辑，减少重复代码）
					const newRecord = {
						timestamp: file.lastModified,
						hash: file.hash,
						status: KNOWLEDGE_GRAPH_STATUS.PENDING, // 明确类型为字符串字面量
					}

					if (!existingRecord) {
						// 路径不存在于历史记录 → 新增文件
						result.added.push(file)
					} else if (file.hash !== existingRecord.hash || existingRecord.status !== "success") {
						// 哈希变化 或 状态非成功 → 均视为修改
						result.modified.push(file)
					} else {
						// 无变化且已处理成功 → 不处理
						result.unchangedCount = (result.unchangedCount || 0) + 1
						continue
					}

					// 无论新增还是修改，都更新历史记录
					previousFileList[file.path] = newRecord
				}

				// 处理删除的文件（历史记录存在但当前文件列表不存在的路径）
				for (const existingPath of Object.keys(previousFileList)) {
					if (!currentFilePaths.has(existingPath)) {
						// 补充删除文件的基础信息（默认值统一维护）
						result.deleted.push({
							path: existingPath,
							size: 0,
							lastModified: 0,
							hash: "",
						})
						delete previousFileList[existingPath]
					}
				}

				// 保存更新后的历史记录
				await this.saveFilesList(previousFileList)

				return result
			} catch (error) {
				throw new Error(`初始化文件记录失败: ${error instanceof Error ? error.message : String(error)}`)
			}
		})
	}

	/**
	 * 类型守卫：检查是否为文件记录对象
	 */
	private isFileRecord(value: unknown): value is { timestamp: number; status: string; hash: string } {
		return (
			typeof value === "object" &&
			value !== null &&
			"timestamp" in value &&
			typeof (value as any).timestamp === "number"
		)
	}

	/**
	 * 读取或初始化文件列表 - 新格式：包含状态信息
	 */
	public async getFilesList(): Promise<
		Record<string, { timestamp: number; status: "pending" | "success" | "failed"; hash: string }> | undefined
	> {
		try {
			const content = await this.storage.load(FILES_LIST_FILE)
			if (!content) {
				return undefined
			}
			const data = JSON.parse(content)

			// 使用类型守卫检查并转换
			const result: Record<
				string,
				{ timestamp: number; status: "pending" | "success" | "failed"; hash: string }
			> = {}
			
			for (const [path, value] of Object.entries(data)) {
				if (this.isFileRecord(value)) {
					const status = value.status === "success" || value.status === "failed" ? value.status : "pending"
					result[path] = {
						timestamp: value.timestamp,
						status: status as "pending" | "success" | "failed",
						hash: value.hash || "",
					}
				} else {
					// 旧格式或无效数据，使用默认值
					result[path] = {
						timestamp: 0,
						status: "pending",
						hash: "",
					}
				}
			}
			
			return result
		} catch (error) {
			this.logger.error("[BuildStateTracer] 获取构建状态失败:", error)
			return undefined
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

	private async updateFileList(
		processedFilesPaths: string[] | undefined,
		buildStatus: "pending" | "success" | "failed",
	) {
		// 注意：这个方法现在在 updateBuildState 内部调用，已经在锁内，所以不需要再加锁
		try {
			let fileList = await this.getFilesList()
			if (!fileList) {
				throw new Error("file.json not exists, cannot update.")
			}
			// 处理已完成的文件路径（更新状态为 success）
			if (processedFilesPaths && processedFilesPaths.length > 0) {
				processedFilesPaths.forEach((filePath) => {
					// 标准化路径：防止路径分隔符不一致导致匹配失败
					const normalizedPath = PathUtils.normalizePathSeparators(filePath)
					
					// 检查 key 是否存在于文件列表中
					if (Object.prototype.hasOwnProperty.call(fileList, normalizedPath)) {
						// 更新状态为 success，保留其他字段（timestamp、hash）
						fileList[normalizedPath] = {
							...fileList[normalizedPath],
							status: buildStatus,
						}
					} else {
						this.logger.warn(`[BuildStateTracer] 文件路径未在files.json中找到: ${normalizedPath}`)
					}
				})
			}

			await this.saveFilesList(fileList)
		} catch (error) {
			throw new Error(`更新文件列表失败: ${error instanceof Error ? error.message : String(error)}`)
		}
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
			await this.storage.clear(FILES_LIST_FILE)
			
			// 重置内存中的状态为 PENDING
			this.currentState = {
				taskId: undefined,
				phase: KNOWLEDGE_GRAPH_PHASE.ROOT_ANALYSIS,
				progress: 0,
				status: KNOWLEDGE_GRAPH_STATUS.PENDING,
				totalFiles: 0,
				processedFiles: 0,
				failedFiles: 0,
				currentFile: "",
				totalFilesToProcess: 0,
				startTime: new Date().toISOString(),
				lastUpdateTime: new Date().toISOString(),
				totalDuration: 0,
				llmStatistics: {
					totalInputTokens: 0,
					totalOutputTokens: 0,
					totalTokens: 0,
					totalRequests: 0,
					successfulRequests: 0,
					failedRequests: 0,
					totalDuration: 0,
				}
			}
			
			this.logger.info("[BuildStateTracer] 已清空构建状态并重置为 PENDING")
		} catch (error) {
			throw new Error(`删除构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 检查是否正在运行 - 增强状态检查
	 */
	public isRunning(): boolean {
		return this.currentState?.status === KNOWLEDGE_GRAPH_STATUS.RUNNING
	}

	/**
	 * 检查是否已暂停 - 增强状态检查
	 */
	public isPaused(): boolean {
		return this.currentState?.status === KNOWLEDGE_GRAPH_STATUS.PAUSED
	}

	/**
	 * 检查是否已完成 - 增强状态检查
	 */
	public isCompleted(): boolean {
		return this.currentState?.status === KNOWLEDGE_GRAPH_STATUS.COMPLETED
	}

	/**
	 * 检查是否有错误 - 增强状态检查
	 */
	public hasError(): boolean {
		return this.currentState?.status === KNOWLEDGE_GRAPH_STATUS.ERROR
	}

	/**
	 * 检查状态是否允许启动新构建
	 */
	public canStartBuild(): boolean {
		const status = this.currentState?.status
		return (
			!status ||
			status === KNOWLEDGE_GRAPH_STATUS.PENDING ||
			status === KNOWLEDGE_GRAPH_STATUS.COMPLETED ||
			status === KNOWLEDGE_GRAPH_STATUS.ERROR
		)
	}

	/**
	 * 检查状态是否允许暂停
	 */
	public canPause(): boolean {
		return this.currentState?.status === KNOWLEDGE_GRAPH_STATUS.RUNNING
	}

	/**
	 * 检查状态是否允许恢复
	 * ✅ 只支持 PAUSED 状态（ERROR 状态应该调用 start 重新构建）
	 */
	public canResume(): boolean {
		return this.currentState?.status === KNOWLEDGE_GRAPH_STATUS.PAUSED
	}

	/**
	 * 检查状态是否允许清除
	 */
	public canClear(): boolean {
		const status = this.currentState?.status
		return !status || status !== KNOWLEDGE_GRAPH_STATUS.RUNNING
	}

	/**
	 * ✅ 检查是否可以启动构建（只读检查，不修改状态）
	 * 职责：仅检查状态，不做任何修改
	 * 状态修改统一由 initializeBuildState() 完成
	 * @returns true 表示可以启动，false 表示不能启动
	 */
	public canStartBuildNow(): boolean {
		const currentStatus = this.currentState?.status

		// 检查当前状态是否允许启动
		if (currentStatus === KNOWLEDGE_GRAPH_STATUS.RUNNING) {
			return false // 已有任务运行
		}

		if (
			currentStatus &&
			currentStatus !== KNOWLEDGE_GRAPH_STATUS.PENDING &&
			currentStatus !== KNOWLEDGE_GRAPH_STATUS.COMPLETED &&
			currentStatus !== KNOWLEDGE_GRAPH_STATUS.ERROR
		) {
			return false // 不在允许启动的状态
		}

		return true
	}

	/**
	 * 暂停构建
	 */
	public async pauseBuild(): Promise<void> {
		return this.mutex.withLock(async () => {
			if (!this.currentState) {
				throw new Error("构建状态不存在")
			}

			if (!this.canPause()) {
				throw new Error(`当前状态 ${this.currentState.status} 不允许暂停`)
			}

			this.currentState.status = KNOWLEDGE_GRAPH_STATUS.PAUSED
			this.currentState.lastUpdateTime = new Date().toISOString()
			await this.storage.overwrite(BUILD_STATE_FILE, this.currentState)
		})
	}

	/**
	 * 继续构建
	 */
	public async resumeBuild(): Promise<void> {
		return this.mutex.withLock(async () => {
			if (!this.currentState) {
				throw new Error("构建状态不存在")
			}

			if (!this.canResume()) {
				throw new Error(`当前状态 ${this.currentState.status} 不允许继续`)
			}

			this.currentState.status = KNOWLEDGE_GRAPH_STATUS.RUNNING
			this.currentState.lastUpdateTime = new Date().toISOString()
			await this.storage.overwrite(BUILD_STATE_FILE, this.currentState)
		})
	}

}
