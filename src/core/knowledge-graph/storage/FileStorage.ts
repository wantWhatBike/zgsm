import * as fs from "fs/promises"
import * as nodePath from "path"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import { StorageConfig, StorageInfo, StorageError, IStorage } from "./StorageInterface"
import {
	FileSummary,
	DirectorySummary,
	DependencyRelation,
	RootInfo,
	KnowledgeGraphBuildState,
	FileInfo,
} from "../types"
import { StorageUtils } from "./StorageUtils"
import { createLogger, ILogger } from "../../../utils/logger"

export class FileStorage implements IStorage {
	
	private config: StorageConfig
	private basePath: string
	private logger: ILogger

	constructor(config: StorageConfig) {
		this.config = config
		this.basePath = config.path
		this.logger = createLogger()
	}

	/**
	 * 初始化存储
	 */
	private async ensureStoragePath(): Promise<void> {
		try {
			await fs.mkdir(this.basePath, { recursive: true })
		} catch (error) {
			throw new StorageError(
				`无法创建存储目录: ${error instanceof Error ? error.message : String(error)}`,
				"STORAGE_INIT_ERROR",
				false,
			)
		}
	}

	/**
	 * 获取文件列表路径
	 */
	private getFilesJsonPath(): string {
		return nodePath.join(this.basePath, "files.json")
	}

	/**
	 * 获取目录状态文件路径
	 */
	private getDirectoriesJsonPath(): string {
		return nodePath.join(this.basePath, "directories.json")
	}

	/**
	 * 获取文件摘要JSONL路径
	 */
	private getFileSummariesJsonlPath(): string {
		return nodePath.join(this.basePath, "file_summaries.jsonl")
	}

	/**
	 * 获取目录摘要JSONL路径
	 */
	private getDirSummariesJsonlPath(): string {
		return nodePath.join(this.basePath, "dir_summaries.jsonl")
	}

	/**
	 * 获取依赖关系文件路径
	 */
	private getRelationsPath(): string {
		return nodePath.join(this.basePath, "relations.txt")
	}

	/**
	 * 获取目录树文件路径
	 */
	private getDirectoryTreePath(): string {
		return nodePath.join(this.basePath, "directory_tree.md")
	}

	/**
	 * 获取索引文件路径
	 */
	private getIndexPath(): string {
		return nodePath.join(this.basePath, "index.md")
	}

	/**
	 * 读取或初始化文件列表 - 新格式：包含状态信息
	 */
	public async getFilesList(): Promise<
		Record<string, { timestamp: number; status: "pending" | "processing" | "success" | "failed"; hash: string }>
	> {
		try {
			const filesPath = this.getFilesJsonPath()
			const content = await fs.readFile(filesPath, "utf-8")
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
		} catch {
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
		const filesPath = this.getFilesJsonPath()
		await safeWriteJson(filesPath, files)
	}

	/**
	 * 追加到JSONL文件  TODO 当前是追加，改为upsert
	 */
	private async upsertToJsonl(filePath: string, data: any): Promise<void> {
		await this.ensureStoragePath()
		const jsonLine = JSON.stringify(data) + "\n"
		await fs.appendFile(filePath, jsonLine, "utf-8")
	}

	/**
	 * 读取JSONL文件
	 */
	private async readJsonl<T>(filePath: string): Promise<T[]> {
		try {
			const content = await fs.readFile(filePath, "utf-8")
			const lines = content
				.trim()
				.split("\n")
				.filter((line) => line.trim())
			return lines.map((line) => JSON.parse(line) as T)
		} catch {
			return []
		}
	}

	/**
	 * 重写JSONL文件
	 */
	private async writeJsonl<T>(filePath: string, data: T[]): Promise<void> {
		await this.ensureStoragePath()
		const content = data.map((item) => JSON.stringify(item)).join("\n") + (data.length > 0 ? "\n" : "")
		await fs.writeFile(filePath, content, "utf-8")
	}

	/**
	 * 保存文件摘要 - 批量处理输入，逐条增量追加到JSONL（保持JSONL增量特性）
	 */
	async saveFileSummaries(summaries: FileSummary[]): Promise<void> {
		try {
			// 1. 验证所有输入摘要的格式
			if (!StorageUtils.validateFileSummaries(summaries)) {
				throw new StorageError("文件摘要格式无效", "INVALID_DATA", false)
			}

			// 2. 获取当前文件列表（用于批量更新状态，减少IO）
			const filesList = await this.getFilesList()

			// 3. 循环处理每条摘要：逐条追加到JSONL，同时更新文件列表
			for (const summary of summaries) {
				// todo 增加tree_sitter解析信息
				// 3.1 增量追加当前摘要到JSONL（每条单独写一行，保持增量特性）
				await this.upsertToJsonl(this.getFileSummariesJsonlPath(), summary)

				// 3.2 记录当前文件的状态（最后修改时间和处理状态）
				if (filesList[summary.path] != null) {
					filesList[summary.path].status = "success"
				} else {
					this.logger.error(`[FileSummary] cannot find file ${summary.path} in files.json`)
				}
			}

			// 4. 批量保存文件列表（整个循环结束后一次写入，减少磁盘IO）
			await this.saveFilesList(filesList)
		} catch (error) {
			if (error instanceof StorageError) {
				throw error
			}
			throw new StorageError(
				`保存文件摘要失败: ${error instanceof Error ? error.message : String(error)}`,
				"SAVE_ERROR",
				true,
			)
		}
	}


	/**
	 * 初始化文件记录 - 增量更新机制
	 */
	async initializeFileRecords(files: FileInfo[]): Promise<{
		added: FileInfo[]
		modified: FileInfo[]
		deleted: FileInfo[]
	}> {
		try {
			const existingFiles = await this.getFilesList()
			const result: {
				added: FileInfo[]
				modified: FileInfo[]
				deleted: FileInfo[]
			} = {
				added: [],
				modified: [],
				deleted: [],
			}

			// 检查当前文件
			for (const currentFile of files) {
				const existing = existingFiles[currentFile.path]
				if (!existing) {
					// 新增文件
					result.added.push(currentFile)
					existingFiles[currentFile.path] = {
						timestamp: currentFile.lastModified,
						hash: currentFile.hash,
						status: "pending",
					}
				} else if (currentFile.hash !== existing.hash) {
					// 修改文件
					result.modified.push(currentFile)
					existingFiles[currentFile.path] = {
						timestamp: currentFile.lastModified,
						hash: currentFile.hash,
						status: "pending",
					}
				}
			}

			// 检查删除的文件
			const currentPaths = new Set(files.map((f) => f.path))
			for (const existingPath of Object.keys(existingFiles)) {
				if (!currentPaths.has(existingPath)) {
					result.deleted.push({
						path: existingPath,
						size: 0,
						lastModified: 0,
						hash: "",
					})
					delete existingFiles[existingPath]
				}
			}

			// 保存更新后的文件列表
			await this.saveFilesList(existingFiles)

			return result
		} catch (error) {
			throw new StorageError(
				`初始化文件记录失败: ${error instanceof Error ? error.message : String(error)}`,
				"INIT_ERROR",
				true,
			)
		}
	}

	/**
	 * 初始化必要的存储文件
	 */
	async initializeStorage(): Promise<void> {
		try {
			await this.ensureStoragePath()
		} catch (error) {
			throw new StorageError(
				`初始化存储失败: ${error instanceof Error ? error.message : String(error)}`,
				"STORAGE_INIT_ERROR",
				false,
			)
		}
	}

	/**
	 * 获取待处理的文件列表
	 */
	async getPendingFiles(): Promise<Array<{ path: string; timestamp: number }>> {
		try {
			const filesList = await this.getFilesList()
			return Object.entries(filesList)
				.filter(([_, info]) => info.status === "pending")
				.map(([path, info]) => ({ path, timestamp: info.timestamp }))
		} catch (error) {
			throw new StorageError(
				`获取待处理文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"READ_ERROR",
				true,
			)
		}
	}

	/**
	 * 更新文件记录状态
	 */
	async updateFileRecord(
		filePath: string,
		status: "pending" | "processing" | "success" | "failed",
		error?: string,
	): Promise<void> {
		try {
			const filesList = await this.getFilesList()
			if (filesList[filePath]) {
				filesList[filePath].status = status
				if (error && status === "failed") {
					;(filesList[filePath] as any).error = error
				}
				await this.saveFilesList(filesList)
			}
		} catch (error) {
			throw new StorageError(
				`更新文件记录状态失败: ${error instanceof Error ? error.message : String(error)}`,
				"UPDATE_ERROR",
				true,
			)
		}
	}

	/**
	 * 读取或初始化目录列表
	 */
	private async getDirectoriesList(): Promise<
		Record<string, { timestamp: number; status: "pending" | "success" | "failed" }>
	> {
		try {
			const directoriesPath = this.getDirectoriesJsonPath()
			const content = await fs.readFile(directoriesPath, "utf-8")
			return JSON.parse(content)
		} catch {
			return {}
		}
	}

	/**
	 * 保存目录列表
	 */
	private async saveDirectoriesList(
		directories: Record<string, { timestamp: number; status: "pending" | "success" | "failed" }>,
	): Promise<void> {
		const directoriesPath = this.getDirectoriesJsonPath()
		await safeWriteJson(directoriesPath, directories)
	}

	/**
	 * 初始化目录记录
	 */
	async initializeDirectoryRecords(directories: string[]): Promise<{
		added: string[]
		unchanged: string[]
	}> {
		try {
			const existingDirectories = await this.getDirectoriesList()
			const result = {
				added: [] as string[],
				unchanged: [] as string[],
			}

			for (const directory of directories) {
				if (!existingDirectories[directory]) {
					result.added.push(directory)
					existingDirectories[directory] = {
						timestamp: Date.now(),
						status: "pending",
					}
				} else {
					result.unchanged.push(directory)
				}
			}

			await this.saveDirectoriesList(existingDirectories)
			this.logger.info(`[FileStorage] 目录记录初始化完成: 新增${result.added.length}`)

			return result
		} catch (error) {
			throw new StorageError(
				`初始化目录记录失败: ${error instanceof Error ? error.message : String(error)}`,
				"INIT_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取待处理的目录列表
	 */
	async getPendingDirectories(): Promise<string[]> {
		try {
			const directoriesList = await this.getDirectoriesList()
			return Object.entries(directoriesList)
				.filter(([_, info]) => info.status === "pending")
				.map(([path, _]) => path)
		} catch (error) {
			throw new StorageError(
				`获取待处理目录失败: ${error instanceof Error ? error.message : String(error)}`,
				"READ_ERROR",
				true,
			)
		}
	}

	/**
	 * 更新目录记录状态
	 */
	async updateDirectoryRecord(dirPath: string, status: "pending" | "success" | "failed"): Promise<void> {
		try {
			const directoriesList = await this.getDirectoriesList()
			if (directoriesList[dirPath]) {
				directoriesList[dirPath].status = status
				await this.saveDirectoriesList(directoriesList)
			}
		} catch (error) {
			throw new StorageError(
				`更新目录记录状态失败: ${error instanceof Error ? error.message : String(error)}`,
				"UPDATE_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取文件摘要
	 */
	async getFileSummary(filePath: string): Promise<FileSummary | null> {
		try {
			const summaries = await this.readJsonl<FileSummary>(this.getFileSummariesJsonlPath())

			// 找到最新的文件摘要（按时间戳排序，取最后一个）
			const fileSummaries = summaries
				.filter((s) => s.path === filePath)
				.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

			return fileSummaries.length > 0 ? fileSummaries[fileSummaries.length - 1] : null
		} catch (error) {
			this.logger.warn(`[FileStorage] 获取文件摘要失败: ${filePath}`, error)
			return null
		}
	}

	/**
	 * 获取所有文件摘要
	 */
	async getAllFileSummaries(): Promise<FileSummary[]> {
		try {
			const summaries = await this.readJsonl<FileSummary>(this.getFileSummariesJsonlPath())

			// 按路径分组，每个路径只保留最新的摘要
			const latestSummaries = new Map<string, FileSummary>()

			for (const summary of summaries) {
				const existing = latestSummaries.get(summary.path)
				if (!existing || new Date(summary.timestamp) > new Date(existing.timestamp)) {
					latestSummaries.set(summary.path, summary)
				}
			}

			return Array.from(latestSummaries.values())
		} catch (error) {
			this.logger.warn("[FileStorage] 获取所有文件摘要失败:", error)
			return [] // 返回空数组而不是抛出错误，以便增量更新可以继续
		}
	}

	/**
	 * 删除文件摘要 - 从文件列表中移除
	 */
	async deleteFileSummary(filePath: string): Promise<void> {
		try {
			const filesList = await this.getFilesList()
			delete filesList[filePath]
			await this.saveFilesList(filesList)

			// 注意：JSONL文件中的历史记录保留，只是从文件列表中移除
		} catch (error) {
			throw new StorageError(
				`删除文件摘要失败: ${error instanceof Error ? error.message : String(error)}`,
				"DELETE_ERROR",
				true,
			)
		}
	}

	/**
	 * 保存目录摘要 - 使用JSONL格式增量保存
	 */
	async saveDirectorySummaries(summary: DirectorySummary[]): Promise<void> {
		try {
			if (!StorageUtils.validateDirectorySummary(summary)) {
				throw new StorageError("目录摘要格式无效", "INVALID_DATA", false)
			}

			// 覆盖dir_summaries.jsonl
			await this.writeJsonl(this.getDirSummariesJsonlPath(), summary)
		} catch (error) {
			if (error instanceof StorageError) {
				throw error
			}

			throw new StorageError(
				`保存目录摘要失败: ${error instanceof Error ? error.message : String(error)}`,
				"SAVE_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取目录摘要 - 从JSONL文件中读取最新的
	 */
	async getDirectorySummary(dirPath: string): Promise<DirectorySummary | null> {
		try {
			const summaries = await this.readJsonl<DirectorySummary>(this.getDirSummariesJsonlPath())

			// 找到最新的目录摘要（按时间戳排序，取最后一个）
			const dirSummaries = summaries
				.filter((s) => s.path === dirPath)
				.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

			return dirSummaries.length > 0 ? dirSummaries[dirSummaries.length - 1] : null
		} catch (error) {
			this.logger.warn(`[FileStorage] 获取目录摘要失败: ${dirPath}`, error)
			return null
		}
	}

	/**
	 * 获取所有目录摘要 - 从JSONL文件中读取
	 */
	async getAllDirectorySummaries(): Promise<DirectorySummary[]> {
		try {
			const summaries = await this.readJsonl<DirectorySummary>(this.getDirSummariesJsonlPath())

			// 按路径分组，每个路径只保留最新的摘要
			const latestSummaries = new Map<string, DirectorySummary>()

			for (const summary of summaries) {
				const existing = latestSummaries.get(summary.path)
				if (!existing || new Date(summary.timestamp) > new Date(existing.timestamp)) {
					latestSummaries.set(summary.path, summary)
				}
			}

			return Array.from(latestSummaries.values())
		} catch (error) {
			throw new StorageError(
				`获取所有目录摘要失败: ${error instanceof Error ? error.message : String(error)}`,
				"READ_ERROR",
				true,
			)
		}
	}

	/**
	 * 删除目录摘要 - JSONL格式不支持删除，只是不再使用
	 */
	async deleteDirectorySummary(dirPath: string): Promise<void> {
		// JSONL格式保留历史记录，不实际删除
		// 如果需要删除，可以重写整个JSONL文件
		this.logger.info(`[FileStorage] 目录摘要删除请求已忽略（JSONL格式保留历史）: ${dirPath}`)
	}

	/**
	 * 保存依赖关系 - 使用relations.txt格式
	 */
	async saveDependencyRelation(relation: DependencyRelation): Promise<void> {
		await this.saveDependencyRelations([relation])
	}

	/**
	 * 批量保存依赖关系 - 保存到relations.txt文件
	 */
	async saveDependencyRelations(relations: DependencyRelation[]): Promise<void> {
		try {
			// 验证所有依赖关系
			for (const relation of relations) {
				if (!StorageUtils.validateDependencyRelation(relation)) {
					throw new StorageError("依赖关系格式无效", "INVALID_DATA", false)
				}
			}

			// 读取现有的依赖关系
			const existingRelations = await this.getDependencyRelations()

			// 合并新的依赖关系（去重）
			const allRelations = [...existingRelations]
			for (const newRelation of relations) {
				const exists = existingRelations.some(
					(existing) =>
						existing.from === newRelation.from &&
						existing.to === newRelation.to &&
						existing.type === newRelation.type,
				)
				if (!exists) {
					allRelations.push(newRelation)
				}
			}

			// 转换为文本格式并保存
			await this.ensureStoragePath()
			const relationsPath = this.getRelationsPath()
			const content =
				allRelations
					.map((rel) => `${rel.from} -> ${rel.to} [${rel.type}] (${rel.strength}) @${rel.timestamp}`)
					.join("\n") + "\n"

			await fs.writeFile(relationsPath, content, "utf-8")
		} catch (error) {
			if (error instanceof StorageError) {
				throw error
			}

			throw new StorageError(
				`保存依赖关系失败: ${error instanceof Error ? error.message : String(error)}`,
				"SAVE_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取所有依赖关系 - 从relations.txt读取
	 */
	async getDependencyRelations(): Promise<DependencyRelation[]> {
		try {
			const relationsPath = this.getRelationsPath()

			try {
				const content = await fs.readFile(relationsPath, "utf-8")
				const lines = content
					.trim()
					.split("\n")
					.filter((line) => line.trim())

				return lines
					.map((line) => {
						// 解析格式: from -> to [type] (strength) @timestamp
						const match = line.match(/^(.+?)\s*->\s*(.+?)\s*\[(.+?)\]\s*\((.+?)\)\s*@(.+?)$/)
						if (!match) {
							this.logger.warn(`[FileStorage] 无法解析依赖关系行: ${line}`)
							return null
						}

						const [, from, to, type, strengthStr, timestamp] = match
						const strength = parseFloat(strengthStr) || 0

						return {
							from: from.trim(),
							to: to.trim(),
							type: type.trim() as any,
							strength,
							timestamp: timestamp.trim(),
						}
					})
					.filter((rel) => rel !== null) as DependencyRelation[]
			} catch {
				return []
			}
		} catch (error) {
			throw new StorageError(
				`获取所有依赖关系失败: ${error instanceof Error ? error.message : String(error)}`,
				"READ_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取指定路径的依赖关系
	 */
	async getDependenciesForPath(path: string): Promise<DependencyRelation[]> {
		const allRelations = await this.getDependencyRelations()
		return allRelations.filter((relation) => relation.from === path)
	}

	/**
	 * 获取指定路径的被依赖关系
	 */
	async getDependentsOfPath(path: string): Promise<DependencyRelation[]> {
		const allRelations = await this.getDependencyRelations()
		return allRelations.filter((relation) => relation.to === path)
	}

	/**
	 * 删除指定路径的依赖关系
	 */
	async deleteDependencyRelationsForPath(path: string): Promise<void> {
		try {
			const allRelations = await this.getDependencyRelations()
			const filteredRelations = allRelations.filter((relation) => relation.from !== path)

			// 重写relations.txt文件
			const relationsPath = this.getRelationsPath()
			const content =
				filteredRelations
					.map((rel) => `${rel.from} -> ${rel.to} [${rel.type}] (${rel.strength}) @${rel.timestamp}`)
					.join("\n") + (filteredRelations.length > 0 ? "\n" : "")

			await fs.writeFile(relationsPath, content, "utf-8")
		} catch (error) {
			throw new StorageError(
				`删除依赖关系失败: ${error instanceof Error ? error.message : String(error)}`,
				"DELETE_ERROR",
				true,
			)
		}
	}

	/**
	 * 保存项目根信息 - 保存为root_info.json
	 */
	async saveRootInfo(rootInfo: RootInfo): Promise<void> {
		try {
			await this.ensureStoragePath()

			const filePath = nodePath.join(this.basePath, "root_info.json")
			await safeWriteJson(filePath, rootInfo)
		} catch (error) {
			throw new StorageError(
				`保存项目根信息失败: ${error instanceof Error ? error.message : String(error)}`,
				"SAVE_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取项目根信息 - 从root_info.json读取
	 */
	async getRootInfo(): Promise<RootInfo | null> {
		try {
			const storagePath = nodePath.join(this.basePath, "root_info.json")

			try {
				await fs.access(storagePath)
			} catch {
				return null
			}

			const content = await fs.readFile(storagePath, "utf-8")
			return StorageUtils.deserialize<RootInfo>(content)
		} catch (error) {
			this.logger.warn("[FileStorage] 获取项目根信息失败:", error)
			return null
		}
	}

	/**
	 * 删除项目根信息
	 */
	async deleteRootInfo(): Promise<void> {
		try {
			const storagePath = nodePath.join(this.basePath, "root_info.json")

			try {
				await fs.unlink(storagePath)
			} catch {
				// 文件不存在，忽略
			}
		} catch (error) {
			throw new StorageError(
				`删除项目根信息失败: ${error instanceof Error ? error.message : String(error)}`,
				"DELETE_ERROR",
				true,
			)
		}
	}

	/**
	 * 保存构建状态
	 */
	async saveKnowledgeGraphBuildStatus(state: KnowledgeGraphBuildState): Promise<void> {
		try {
			await this.ensureStoragePath()

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
				totalFilesToProcess: 0
			}

			const filePath = nodePath.join(this.basePath, "build_state.json")
			await safeWriteJson(filePath, currentStatus)
			this.logger.info(
				`[FileStorage] 构建状态已保存: ${currentStatus.status}, 进度: ${currentStatus.progress.toFixed(1)}%`,
			)
		} catch (error) {
			throw new StorageError(
				`保存构建状态失败: ${error instanceof Error ? error.message : String(error)}`,
				"SAVE_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取构建状态
	 */
	async getBuildStatus(): Promise<KnowledgeGraphBuildState | null> {
		try {
			const storagePath = nodePath.join(this.basePath, "build_state.json")

			try {
				await fs.access(storagePath)
			} catch {
				return null
			}

			const content = await fs.readFile(storagePath, "utf-8")
			return StorageUtils.deserialize<KnowledgeGraphBuildState>(content)
		} catch (error) {
			this.logger.warn("[FileStorage] 获取构建状态失败:", error)
			return null
		}
	}

	/**
	 * 更新构建状态 - 支持部分更新
	 */
	async updateBuildStatus(updates: Partial<KnowledgeGraphBuildState>): Promise<void> {
		try {
			const currentState = await this.getBuildStatus()
			if (!currentState) {
				throw new StorageError("构建状态不存在，无法更新", "STATE_NOT_FOUND", false)
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

			await this.saveKnowledgeGraphBuildStatus(updatedState)
		} catch (error) {
			if (error instanceof StorageError) {
				throw error
			}
			throw new StorageError(
				`更新构建状态失败: ${error instanceof Error ? error.message : String(error)}`,
				"UPDATE_ERROR",
				true,
			)
		}
	}

	/**
	 * 更新任务进度和当前文件
	 */
	async updateTaskProgress(
		progress: number,
		currentFile: string,
		stage: "root_analysis" | "file_summary" | "directory_summary" | "dependency_graph" | "completed",
		stageProgress: number = progress,
	): Promise<void> {
		await this.updateBuildStatus({
			progress,
			currentFile,
			lastUpdateTime: new Date().toISOString(),
		})
	}

	/**
	 * 增加已处理文件数
	 */
	async incrementProcessedFiles(): Promise<void> {
		const currentState = await this.getBuildStatus()
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

			await this.updateBuildStatus({
				processedFiles: newProcessedFiles,
				progress: Math.min(100, overallProgress),
			})

			this.logger.info(
				`[FileStorage] 文件处理进度: ${newProcessedFiles}/${currentState.totalFiles}, 总进度: ${overallProgress.toFixed(1)}%`,
			)
		}
	}

	/**
	 * 增加失败文件数
	 */
	async incrementFailedFiles(): Promise<void> {
		const currentState = await this.getBuildStatus()
		if (currentState) {
			await this.updateBuildStatus({
				failedFiles: currentState.failedFiles + 1,
			})
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
  const currentState = await this.getBuildStatus();
  if (currentState) {
    // 给可能未定义的属性加默认值
    const currentTotalRequests = currentState.totalRequests ?? 0; // 若为undefined，默认0
    const currentTotalDuration = currentState.totalDuration ?? 0;
    // 处理totalTokens（若整个对象未定义，默认初始化为{input:0, output:0}）
    const currentTotalTokens = currentState.totalTokens ?? { input: 0, output: 0 };

    await this.updateBuildStatus({
      totalRequests: currentTotalRequests + requestCount,
      totalDuration: currentTotalDuration + duration,
      totalTokens: {
        input: (currentTotalTokens.input ?? 0) + tokens.input, // 子属性也加默认值
        output: (currentTotalTokens.output ?? 0) + tokens.output,
      },
    });
  }
}

	/**
	 * 删除构建状态
	 */
	async deleteKnowledgeGraphBuildStatus(): Promise<void> {
		try {
			const storagePath = nodePath.join(this.basePath, "build_state.json")

			try {
				await fs.unlink(storagePath)
			} catch {
				// 文件不存在，忽略
			}
		} catch (error) {
			throw new StorageError(
				`删除构建状态失败: ${error instanceof Error ? error.message : String(error)}`,
				"DELETE_ERROR",
				true,
			)
		}
	}

	/**
	 * 清空存储 - 删除所有知识图谱文件
	 */
	async clear(): Promise<void> {
		try {
			await this.ensureStoragePath()

			const filesToDelete = [
				"files.json",
				"build_state.json",
				"root_info.json",
				"file_summaries.jsonl",
				"dir_summaries.jsonl",
			]

			for (const file of filesToDelete) {
				try {
					await fs.unlink(nodePath.join(this.basePath, file))
				} catch (error) {
					// 文件不存在，忽略
					this.logger.info(`[FileStorage] 文件不存在，跳过删除: ${file}`)
				}
			}

			// 同时删除可能存在的旧格式文件
			try {
				const files = await fs.readdir(this.basePath)
				for (const file of files) {
					if (
						file.endsWith(".json") &&
						(file.startsWith("file_") || file.startsWith("directory_") || file.startsWith("dependency_"))
					) {
						try {
							await fs.unlink(nodePath.join(this.basePath, file))
						} catch (error) {
							this.logger.warn(`[FileStorage] 删除旧格式文件失败: ${file}`, error)
						}
					}
				}
			} catch (error) {
				// 目录不存在或其他错误，忽略
			}
		} catch (error) {
			throw new StorageError(
				`清空存储失败: ${error instanceof Error ? error.message : String(error)}`,
				"CLEAR_ERROR",
				true,
			)
		}
	}

	/**
	 * 检查存储是否存在
	 */
	async exists(): Promise<boolean> {
		try {
			await fs.access(this.basePath)
			return true
		} catch {
			return false
		}
	}

	/**
	 * 获取存储信息 - 统计新格式文件
	 */
	async getStorageInfo(): Promise<StorageInfo> {
		try {
			await this.ensureStoragePath()

			const knowledgeGraphFiles = [
				"files.json",
				"build_state.json",
				"root_info.json",
				"file_summaries.jsonl",
				"dir_summaries.jsonl",
				"relations.txt",
				"directory_tree.md",
				"index.md",
			]

			let totalSize = 0
			let itemCount = 0
			let fileCount = 0 // 从files.json中获取文件数量

			for (const file of knowledgeGraphFiles) {
				try {
					const filePath = nodePath.join(this.basePath, file)
					const stats = await fs.stat(filePath)
					totalSize += stats.size
					itemCount++
				} catch (error) {
					// 文件不存在，跳过
				}
			}

			// 从files.json获取文件数量 - 只统计成功状态的文件
			try {
				const filesList = await this.getFilesList()
				fileCount = Object.values(filesList).filter((info) => info.status === "success").length
			} catch (error) {
				fileCount = 0
			}

			// 尝试从构建状态中获取最后更新时间
			let lastUpdated = new Date().toISOString()
			try {
				const KnowledgeGraphBuildStatus = await this.getBuildStatus()
				if (KnowledgeGraphBuildStatus && KnowledgeGraphBuildStatus.lastUpdateTime) {
					lastUpdated = KnowledgeGraphBuildStatus.lastUpdateTime
				}
			} catch (error) {
				// 忽略错误，使用当前时间
			}

			return {
				type: "file",
				path: this.basePath,
				size: totalSize,
				itemCount,
				fileCount,
				lastUpdated,
			}
		} catch (error) {
			throw new StorageError(
				`获取存储信息失败: ${error instanceof Error ? error.message : String(error)}`,
				"INFO_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取任务统计信息
	 */
	async getTaskStatistics(): Promise<{
		files: {
			total: number
			pending: number
			processing: number
			success: number
			failed: number
		}
		directories: {
			total: number
			pending: number
			success: number
			failed: number
		}
		KnowledgeGraphBuildStatus: KnowledgeGraphBuildState | null
	}> {
		try {
			const filesList = await this.getFilesList()
			const directoriesList = await this.getDirectoriesList()
			const KnowledgeGraphBuildStatus = await this.getBuildStatus()

			// 统计文件状态
			const fileStats = {
				total: 0,
				pending: 0,
				processing: 0,
				success: 0,
				failed: 0,
			}

			for (const fileInfo of Object.values(filesList)) {
				fileStats.total++
				fileStats[fileInfo.status]++
			}

			// 统计目录状态
			const dirStats = {
				total: 0,
				pending: 0,
				success: 0,
				failed: 0,
			}

			for (const dirInfo of Object.values(directoriesList)) {
				dirStats.total++
				dirStats[dirInfo.status]++
			}

			return {
				files: fileStats,
				directories: dirStats,
				KnowledgeGraphBuildStatus,
			}
		} catch (error) {
			throw new StorageError(
				`获取任务统计信息失败: ${error instanceof Error ? error.message : String(error)}`,
				"READ_ERROR",
				true,
			)
		}
	}

	/**
	 * 保存目录树 - 保存到directory_tree.md
	 */
	async saveDirectoryTree(treeContent: string): Promise<void> {
		try {
			await this.ensureStoragePath()
			const treePath = this.getDirectoryTreePath()
			await fs.writeFile(treePath, treeContent, "utf-8")
		} catch (error) {
			throw new StorageError(
				`保存目录树失败: ${error instanceof Error ? error.message : String(error)}`,
				"SAVE_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取目录树
	 */
	async getDirectoryTree(): Promise<string | null> {
		try {
			const treePath = this.getDirectoryTreePath()
			const content = await fs.readFile(treePath, "utf-8")
			return content
		} catch {
			return null
		}
	}

	/**
	 * 保存主索引文件 - 保存到index.md
	 */
	async saveIndex(indexContent: string): Promise<void> {
		try {
			await this.ensureStoragePath()
			const indexPath = this.getIndexPath()
			await fs.writeFile(indexPath, indexContent, "utf-8")
		} catch (error) {
			throw new StorageError(
				`保存主索引文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"SAVE_ERROR",
				true,
			)
		}
	}

	/**
	 * 获取主索引文件
	 */
	async getIndex(): Promise<string | null> {
		try {
			const indexPath = this.getIndexPath()
			const content = await fs.readFile(indexPath, "utf-8")
			return content
		} catch {
			return null
		}
	}

	/**
	 * 生成目录树内容
	 */
	async generateDirectoryTree(rootPath: string): Promise<string> {
		try {
			const filesList = await this.getFilesList()
			// 只包含成功状态的文件
			const files = Object.entries(filesList)
				.filter(([_, info]) => info.status === "success")
				.map(([path, _]) => path)
				.sort()

			let treeContent = `# 项目目录结构\n\n生成时间: ${new Date().toISOString()}\n\n`
			treeContent += "```\n"

			// 构建目录树结构
			const tree = new Map<string, string[]>()

			for (const file of files) {
				const parts = file.split("/")
				let currentPath = ""

				for (let i = 0; i < parts.length; i++) {
					const part = parts[i]
					const parentPath = currentPath
					currentPath = currentPath ? `${currentPath}/${part}` : part

					if (i === parts.length - 1) {
						// 这是文件
						if (!tree.has(parentPath)) {
							tree.set(parentPath, [])
						}
						tree.get(parentPath)!.push(part)
					} else {
						// 这是目录
						if (!tree.has(parentPath)) {
							tree.set(parentPath, [])
						}
						if (!tree.get(parentPath)!.includes(part + "/")) {
							tree.get(parentPath)!.push(part + "/")
						}
					}
				}
			}

			// 递归生成树结构
			const generateTreeLevel = (path: string, prefix: string = ""): string => {
				const items = tree.get(path) || []
				items.sort((a, b) => {
					const aIsDir = a.endsWith("/")
					const bIsDir = b.endsWith("/")
					if (aIsDir && !bIsDir) return -1
					if (!aIsDir && bIsDir) return 1
					return a.localeCompare(b)
				})

				let result = ""
				items.forEach((item, index) => {
					const isLast = index === items.length - 1
					const connector = isLast ? "└── " : "├── "
					const nextPrefix = prefix + (isLast ? "    " : "│   ")

					result += `${prefix}${connector}${item}\n`

					if (item.endsWith("/")) {
						const dirName = item.slice(0, -1)
						const fullPath = path ? `${path}/${dirName}` : dirName
						result += generateTreeLevel(fullPath, nextPrefix)
					}
				})

				return result
			}

			treeContent += generateTreeLevel("")
			treeContent += "```\n"

			return treeContent
		} catch (error) {
			throw new StorageError(
				`生成目录树失败: ${error instanceof Error ? error.message : String(error)}`,
				"GENERATE_ERROR",
				true,
			)
		}
	}

	/**
	 * 生成主索引文件内容
	 */
	async generateIndex(): Promise<string> {
		try {
			const filesList = await this.getFilesList()
			const rootInfo = await this.getRootInfo()
			const KnowledgeGraphBuildStatus = await this.getBuildStatus()

			let indexContent = `# 知识图谱索引\n\n`
			indexContent += `生成时间: ${new Date().toISOString()}\n\n`

			// 项目概览
			if (rootInfo) {
				indexContent += `## 项目概览\n\n`
				indexContent += `**项目定位**: ${rootInfo.project_positioning}\n\n`
				indexContent += `**技术栈**: ${rootInfo.tech_stack.join(", ")}\n\n`
				indexContent += `**核心模块**: ${rootInfo.core_modules.join(", ")}\n\n`
				indexContent += `**入口点**: ${rootInfo.entry_points.join(", ")}\n\n`
			}

			// 构建状态
			if (KnowledgeGraphBuildStatus) {
				indexContent += `## 构建状态\n\n`
				indexContent += `**阶段**: ${KnowledgeGraphBuildStatus.phase}\n\n`
				indexContent += `**进度**: ${KnowledgeGraphBuildStatus.progress}%\n\n`
				indexContent += `**状态**: ${KnowledgeGraphBuildStatus.status}\n\n`
				indexContent += `**最后更新**: ${KnowledgeGraphBuildStatus.lastUpdateTime}\n\n`
			}

			// 从文件和目录列表获取统计信息
			const successFiles = Object.values(filesList).filter((info) => info.status === "success").length
			const totalFiles = Object.keys(filesList).length

			try {
				const directoriesList = await this.getDirectoriesList()
				const successDirectories = Object.values(directoriesList).filter(
					(info) => info.status === "success",
				).length
				const totalDirectories = Object.keys(directoriesList).length

				indexContent += `## 处理统计\n\n`
				indexContent += `**完成文件数**: ${successFiles}/${totalFiles}\n\n`
				indexContent += `**完成目录数**: ${successDirectories}/${totalDirectories}\n\n`
			} catch (error) {
				// 目录文件不存在时的后备处理
				indexContent += `## 处理统计\n\n`
				indexContent += `**完成文件数**: ${successFiles}/${totalFiles}\n\n`
			}

			// 文件统计 - 只统计成功状态的文件
			const successFilePaths = Object.entries(filesList)
				.filter(([_, info]) => info.status === "success")
				.map(([path, _]) => path)

			indexContent += `## 文件统计\n\n`
			indexContent += `**总文件数**: ${successFilePaths.length}\n\n`

			// 文件类型统计
			const fileTypes = new Map<string, number>()
			for (const file of successFilePaths) {
				const ext = StorageUtils.getFileExtension(file)
				fileTypes.set(ext || "no-ext", (fileTypes.get(ext || "no-ext") || 0) + 1)
			}

			indexContent += `### 文件类型分布\n\n`
			for (const [ext, count] of Array.from(fileTypes.entries()).sort((a, b) => b[1] - a[1])) {
				indexContent += `- **${ext || "无扩展名"}**: ${count} 个文件\n`
			}
			indexContent += "\n"

			// 存储文件说明
			indexContent += `## 存储文件说明\n\n`
			indexContent += `- **files.json**: 文件列表，记录所有分析的文件及其时间戳\n`
			indexContent += `- **root_info.json**: 项目根目录分析结果\n`
			indexContent += `- **build_state.json**: 构建状态和进度信息\n`
			indexContent += `- **file_summaries.jsonl**: 文件摘要，JSONL格式，每行一个文件的分析结果\n`
			indexContent += `- **dir_summaries.jsonl**: 目录摘要，JSONL格式，每行一个目录的分析结果\n`
			indexContent += `- **relations.txt**: 依赖关系，每行一条依赖链\n`
			indexContent += `- **directory_tree.md**: 项目目录结构树\n`
			indexContent += `- **index.md**: 本索引文件\n\n`

			return indexContent
		} catch (error) {
			throw new StorageError(
				`生成主索引失败: ${error instanceof Error ? error.message : String(error)}`,
				"GENERATE_ERROR",
				true,
			)
		}
	}

	/**
	 * 按源路径分组依赖关系
	 */
	private groupRelationsByFrom(relations: DependencyRelation[]): Map<string, DependencyRelation[]> {
		const grouped = new Map<string, DependencyRelation[]>()

		for (const relation of relations) {
			const key = relation.from
			if (!grouped.has(key)) {
				grouped.set(key, [])
			}
			grouped.get(key)!.push(relation)
		}

		return grouped
	}
}
