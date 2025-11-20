import type { KnowledgeGraphBuildState, BuildProgress, FileInfo, FileChanges } from "../types"
import { ILogger } from "../../../utils/logger"
import { IStorage } from "../storage/IStorage"
import { StorageUtils } from "../storage/StorageUtils"

/**
 * 简单的互斥锁实现
 */
class Mutex {
	private locked = false
	private waitingQueue: (() => void)[] = []

	async lock(): Promise<void> {
		return new Promise<void>((resolve) => {
			if (!this.locked) {
				this.locked = true
				resolve()
			} else {
				this.waitingQueue.push(resolve)
			}
		})
	}

	unlock(): void {
		if (this.waitingQueue.length > 0) {
			const next = this.waitingQueue.shift()!
			next()
		} else {
			this.locked = false
		}
	}

	async withLock<T>(fn: () => Promise<T>): Promise<T> {
		await this.lock()
		try {
			return await fn()
		} finally {
			this.unlock()
		}
	}
}

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
				status: "pending" as const,
				phase: "root_analysis",
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
		if (!this.storage) throw new Error("存储未初始化")

		// 初始化存储文件
		await this.storage.initialize()

		if (workspacePath == null) {
			throw new Error("workspace is empty")
		}

		try {
			const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
			const startTime = new Date().toISOString()

			let taskState: KnowledgeGraphBuildState = {
				taskId,
				phase: "root_analysis",
				progress: 0,
				startTime,
				lastUpdateTime: startTime,
				totalDuration: 0,
				status: "running",
				totalFiles,
				processedFiles: initialProcessedFiles,
				failedFiles: 0,
				currentFile: "",
				totalFilesToProcess: totalFilesToProcess,
				phaseProgress: {
					root_analysis: { processed: 0, total: 1, status: 'pending' },
					file_analysis: { processed: 0, total: totalFilesToProcess, status: 'pending' },
					directory_analysis: { processed: 0, total: 0, status: 'pending' }
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

			this.currentState = await this.createBuildState(taskState)
			this.logger.info(`[BuildStateTracer] 初始化构建任务: ${taskId}, 总文件数: ${totalFiles}`)

			// 更新内部状态
			this.currentState = taskState
		} catch (error) {
			throw new Error(`初始化任务状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}


	/**
	 * 统一的构建状态更新方法 - 同时支持文件列表更新
	 */
	public async updateBuildState(
		updates: Partial<KnowledgeGraphBuildState>,
		filePaths?: string[],
		fileStatus?: "pending" | "success" | "failed"
	): Promise<void> {
		return this.mutex.withLock(async () => {
			try {
				// 先更新文件列表（如果提供了文件路径和状态）
				if (filePaths && fileStatus) {
					await this.updateFileList(filePaths, fileStatus)
				}

				if (!this.currentState) {
					throw new Error("构建状态不存在，无法更新")
				}

				const updatedState: KnowledgeGraphBuildState = {
					...this.currentState,
					...updates,
					lastUpdateTime: new Date().toISOString(),
				}

				// 统一进度计算
				if (updates.processedFiles !== undefined || updates.phase !== undefined) {
					updatedState.progress = this.calculateProgress(updatedState)
				}

				// 保存状态
				await this.storage.overwrite(BUILD_STATE_FILE, updatedState)
				this.currentState = updatedState
				
				this.logger.info(
					`[BuildStateTracer] 状态已更新: ${updatedState.status} (${updatedState.progress.toFixed(1)}%)`
				)
			} catch (error) {
				throw new Error(`更新构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
			}
		})
	}

	/**
	 * 创建新的构建状态
	 */
	private async createBuildState(state: KnowledgeGraphBuildState): Promise<KnowledgeGraphBuildState> {
		return this.mutex.withLock(async () => {
			try {
				const newState: KnowledgeGraphBuildState = {
					taskId: state.taskId,
					phase: state.phase || "root_analysis",
					progress: 0,
					startTime: state.startTime || new Date().toISOString(),
					lastUpdateTime: new Date().toISOString(),
					totalDuration: state.totalDuration || 0,
					status: state.status || "pending",
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
				
				this.logger.info(
					`[BuildStateTracer] 状态已创建: ${newState.status} (${newState.progress.toFixed(1)}%)`
				)

				return newState
			} catch (error) {
				throw new Error(`创建构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
			}
		})
	}

	/**
	 * 统一的进度计算方法
	 */
	private calculateProgress(state: KnowledgeGraphBuildState): number {
		if (state.status === "completed") {
			return 100
		}

		// 阶段权重配置
		const phaseWeights = {
			root_analysis: 0.05,
			file_analysis: 0.85,
			directory_analysis: 0.1,
			dependency_analysis: 0.0,
			completed: 0.0,
		}

		// 如果有详细的阶段进度，优先使用
		if (state.phaseProgress) {
			let totalProgress = 0
			
			// 根目录分析
			if (state.phaseProgress.root_analysis) {
				const { processed, total, status } = state.phaseProgress.root_analysis
				const progress = status === 'completed' ? 1 : (total > 0 ? processed / total : 0)
				totalProgress += progress * phaseWeights.root_analysis * 100
			}

			// 文件分析
			if (state.phaseProgress.file_analysis) {
				const { processed, total, status } = state.phaseProgress.file_analysis
				const progress = status === 'completed' ? 1 : (total > 0 ? processed / total : 0)
				totalProgress += progress * phaseWeights.file_analysis * 100
			}

			// 目录分析
			if (state.phaseProgress.directory_analysis) {
				const { processed, total, status } = state.phaseProgress.directory_analysis
				const progress = status === 'completed' ? 1 : (total > 0 ? processed / total : 0)
				totalProgress += progress * phaseWeights.directory_analysis * 100
			}

			return Math.max(0, Math.min(100, totalProgress))
		}

		// 回退到基于当前阶段的简单计算逻辑
		const phases = ["root_analysis", "file_analysis", "directory_analysis", "dependency_analysis", "completed"]
		const currentPhaseIndex = phases.indexOf(state.phase)

		if (currentPhaseIndex === -1) {
			return 0
		}

		// 已完成阶段的进度
		let completedProgress = 0
		for (let i = 0; i < currentPhaseIndex; i++) {
			completedProgress += phaseWeights[phases[i] as keyof typeof phaseWeights] * 100
		}

		// 当前阶段的进度
		let currentPhaseProgress = 0
		if ((state.phase === "file_analysis" || state.phase === "directory_analysis") && state.totalFilesToProcess > 0) {
			currentPhaseProgress = (state.processedFiles / state.totalFilesToProcess) * 100
		} else if (currentPhaseIndex > 0) {
			// 对于非计数型阶段（如root_analysis），如果已经进入下一个阶段，则认为已完成；
			// 如果处于当前阶段，这里简单估算为0（或者可以根据具体情况优化）
			// 实际上 root_analysis 很快，通常瞬间完成或处于 pending
			currentPhaseProgress = 0
		}

		const currentPhaseWeight = phaseWeights[state.phase as keyof typeof phaseWeights]
		const totalProgress = completedProgress + currentPhaseWeight * currentPhaseProgress

		return Math.max(0, Math.min(100, totalProgress))
	}

	/**
		* 更新阶段进度
		*/
	public async updatePhaseProgress(
		phase: 'root_analysis' | 'file_analysis' | 'directory_analysis',
		processed: number,
		total?: number,
		status?: 'pending' | 'running' | 'completed'
	): Promise<void> {
		return this.mutex.withLock(async () => {
			if (!this.currentState) {
				throw new Error("构建状态不存在，无法更新阶段进度")
			}

			// 确保 phaseProgress 存在
			if (!this.currentState.phaseProgress) {
				this.currentState.phaseProgress = {
					root_analysis: { processed: 0, total: 1, status: 'pending' },
					file_analysis: { processed: 0, total: this.currentState.totalFilesToProcess, status: 'pending' },
					directory_analysis: { processed: 0, total: 0, status: 'pending' }
				}
			}

			// 更新指定阶段的进度
			const currentPhaseProgress = this.currentState.phaseProgress[phase]
			this.currentState.phaseProgress[phase] = {
				processed,
				total: total !== undefined ? total : currentPhaseProgress.total,
				status: status || currentPhaseProgress.status
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
						status: "pending" as const, // 明确类型为字符串字面量
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
	 * 读取或初始化文件列表 - 新格式：包含状态信息
	 */
	public async getFilesList(): Promise<
		| Record<string, { timestamp: number; status: "pending" | "success" | "failed"; hash: string }>
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
				{ timestamp: number; status: "pending" | "success" | "failed"; hash: string }
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
					// 检查 key 是否存在于文件列表中
					if (Object.prototype.hasOwnProperty.call(fileList, filePath)) {
						// 更新状态为 success，保留其他字段（timestamp、hash）
						fileList[filePath] = {
							...fileList[filePath],
							status: buildStatus,
						}
					} else {
						this.logger.warn(`[BuildStateTracer] 文件路径未在files.json中找到: ${filePath}`)
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
		} catch (error) {
			throw new Error(`删除构建状态失败: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 检查是否正在运行
	 */
	public isRunning(): boolean | undefined {
		return this.currentState?.status === "running"
	}

	/**
	 * 检查是否已暂停
	 */
	public isPaused(): boolean | undefined {
		return this.currentState?.status === "paused"
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
