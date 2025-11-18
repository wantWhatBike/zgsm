import * as fs from "fs/promises"
import path, * as nodePath from "path"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import { StorageConfig, StorageInfo, StorageError, IStorage } from "./IStorage"
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
import { pathExists, safeReadFile } from "../tools/FileUtils"

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

	public async load(file: string): Promise<string | null> {
		return safeReadFile(nodePath.join(this.basePath, file))
	}

	/**
	 * 保存文件列表 - 新格式：包含状态信息
	 */
	public async overwrite(fileName: string, data: any): Promise<void> {
		await this.ensureStoragePath()
		await safeWriteJson(nodePath.join(this.basePath, fileName), data)
	}

	public async add(fileName: string, data:any): Promise<void> {
		await this.ensureStoragePath()
		return await this.appendToJsonl(nodePath.join(this.basePath, fileName), data)
	}

	/**
	 * 追加到JSONL文件  TODO 当前是追加，改为upsert
	 */
	private async appendToJsonl(filePath: string, data: any): Promise<void> {
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
	 * 初始化必要的存储文件
	 */
	async initialize(): Promise<void> {
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
	 * 删除路径
	 */
	async clear(name: string): Promise<void> {
		if (!this.basePath) {
			throw new Error("[Storage] basePath is null, cannot clear.")
		}
		const fullPath = path.join(this.basePath, name)
		try {			
			// 检查基础路径是否存在
			const baseExists = await pathExists(fullPath)
			if (!baseExists) {
				this.logger.warn(`[Storage] path ${fullPath} does not exist, skip clear.`)
				return
			}
			this.logger.debug(`[Storage] start to delete file: ${fullPath}`)
			await fs.unlink(fullPath)
			this.logger.debug(`[Storage] Successfully Deleted file: ${fullPath}`)
		} catch (error) {
			throw new StorageError(`删除${fullPath}失败: ${error instanceof Error ? error.message : String(error)}`)
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
}
