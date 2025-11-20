import * as fs from "fs/promises"
import path, * as nodePath from "path"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import { StorageConfig, StorageError, IStorage } from "./IStorage"

import { createLogger, ILogger } from "../../../utils/logger"
import { pathExists, safeReadFile } from "../tools/FileUtils"

// TODO: 仅用于存储小数据，比如构建状态、文件列表、根目录分析信息。
export class JsonFileStorage implements IStorage {
	private config: StorageConfig
	private basePath: string
	private logger: ILogger

	constructor(config: StorageConfig, logger?: ILogger) {
		this.config = config
		this.basePath = config.path
		this.logger = logger || createLogger('FileStorage')
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

	public async addBatch(fileName: string, data: any[]): Promise<void> {
		await this.ensureStoragePath()
		if (data.length === 0) return

		const filePath = nodePath.join(this.basePath, fileName)
		try {
			const content = data.map((item) => JSON.stringify(item)).join("\n") + "\n"
			await fs.appendFile(filePath, content, "utf-8")
		} catch (error) {
			throw new StorageError(
				`批量追加JSONL文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"JSONL_APPEND_ERROR",
				true,
			)
		}
	}

	public async deleteItems(fileName: string, predicate: (item: any) => boolean): Promise<void> {
		await this.ensureStoragePath()
		const filePath = nodePath.join(this.basePath, fileName)
		
		// 如果文件不存在，直接返回
		if (!(await pathExists(filePath))) {
			return
		}

		try {
			// 读取所有数据
			const items = await this.readJsonl<any>(filePath)
			
			// 过滤掉需要删除的项（保留 predicate 返回 false 的项）
			// predicate 返回 true 表示要删除
			const remainingItems = items.filter(item => !predicate(item))
			
			// 如果数量有变化，则重写文件
			if (remainingItems.length !== items.length) {
				await this.writeJsonl(filePath, remainingItems)
				this.logger.info(`[JsonFileStorage] 已从 ${fileName} 删除 ${items.length - remainingItems.length} 条记录`)
			}
		} catch (error) {
			throw new StorageError(
				`删除记录失败: ${error instanceof Error ? error.message : String(error)}`,
				"DELETE_ITEMS_ERROR",
				true
			)
		}
	}

	/**
	 * 追加到JSONL文件
	 */
	private async appendToJsonl(filePath: string, data: any): Promise<void> {
		try {
			const jsonLine = JSON.stringify(data) + "\n"
			await fs.appendFile(filePath, jsonLine, "utf-8")
		} catch (error) {
			throw new StorageError(
				`追加JSONL文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"JSONL_APPEND_ERROR",
				true
			)
		}
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
			throw new StorageError("basePath is null, cannot clear", "INVALID_PATH", false)
		}
		const fullPath = path.join(this.basePath, name)
		try {
			// 检查基础路径是否存在
			const baseExists = await pathExists(fullPath)
			if (!baseExists) {
				this.logger.warn(`[FileStorage] 文件 ${fullPath} 不存在，跳过删除`)
				return
			}
			this.logger.debug(`[FileStorage] 开始删除文件: ${fullPath}`)
			await fs.unlink(fullPath)
			this.logger.debug(`[FileStorage] 成功删除文件: ${fullPath}`)
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
