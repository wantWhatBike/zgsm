import * as fs from "fs/promises"
import { createWriteStream, WriteStream } from "fs"
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
	private isInitialized: boolean = false
	private writeStreams: Map<string, WriteStream> = new Map()

	constructor(config: StorageConfig, logger?: ILogger) {
		this.config = config
		this.basePath = config.path
		this.logger = logger || createLogger("FileStorage")
	}

	/**
	 * 初始化存储 - 优化版本，避免重复检查
	 */
	private async ensureStoragePath(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			await fs.mkdir(this.basePath, { recursive: true })
			this.isInitialized = true
		} catch (error) {
			throw new StorageError(
				`无法创建存储目录: ${error instanceof Error ? error.message : String(error)}`,
				"STORAGE_INIT_ERROR",
				false,
			)
		}
	}

	/**
	 * 获取或创建写入流 - 复用流以提高性能
	 */
	private async getWriteStream(fileName: string): Promise<WriteStream> {
		const filePath = nodePath.join(this.basePath, fileName)

		if (this.writeStreams.has(fileName)) {
			const stream = this.writeStreams.get(fileName)!
			if (!stream.destroyed) {
				return stream
			}
			this.writeStreams.delete(fileName)
		}

		await this.ensureStoragePath()
		const stream = createWriteStream(filePath, { flags: "a", encoding: "utf-8" })
		this.writeStreams.set(fileName, stream)

		// 设置错误处理
		stream.on("error", (error) => {
			this.logger.error(`[JsonFileStorage] WriteStream error for ${fileName}: ${error.message}`)
			this.writeStreams.delete(fileName)
		})

		return stream
	}

	/**
	 * 关闭单个写入流
	 */
	private async closeStream(fileName: string): Promise<void> {
		const stream = this.writeStreams.get(fileName)
		if (stream && !stream.destroyed) {
			await new Promise<void>((resolve, reject) => {
				stream.end((error?: Error) => {
					if (error) {
						this.logger.warn(`[JsonFileStorage] 关闭流失败: ${fileName}`, error)
						reject(error)
					} else {
						this.logger.debug(`[JsonFileStorage] 流已关闭: ${fileName}`)
						resolve()
					}
				})
			})
			this.writeStreams.delete(fileName)
		}
	}

	/**
	 * 关闭所有写入流
	 */
	private async closeAllStreams(): Promise<void> {
		const closePromises: Promise<void>[] = []

		for (const [fileName, stream] of this.writeStreams.entries()) {
			if (!stream.destroyed) {
				closePromises.push(
					new Promise<void>((resolve, reject) => {
						stream.end((error?: Error) => {
							if (error) {
								this.logger.warn(
									`[JsonFileStorage] Error closing stream for ${fileName}: ${error.message}`,
								)
								reject(error)
							} else {
								resolve()
							}
						})
					}),
				)
			}
		}

		await Promise.allSettled(closePromises)
		this.writeStreams.clear()
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

	public async add(fileName: string, data: any): Promise<void> {
		await this.ensureStoragePath()
		return await this.appendToJsonl(nodePath.join(this.basePath, fileName), data)
	}

	public async addBatch(fileName: string, data: any[]): Promise<void> {
		if (data.length === 0) return

		try {
			// 使用流式写入优化大批量数据性能
			if (data.length > 100) {
				await this.addBatchWithStream(fileName, data)
				// 修复资源泄漏：写入完成后立即关闭流
				await this.closeStream(fileName)
			} else {
				// 小批量数据使用原有方式
				await this.ensureStoragePath()
				const filePath = nodePath.join(this.basePath, fileName)
				const content = data.map((item) => JSON.stringify(item)).join("\n") + "\n"
				await fs.appendFile(filePath, content, "utf-8")
			}
		} catch (error) {
			throw new StorageError(
				`批量追加JSONL文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"JSONL_APPEND_ERROR",
				true,
			)
		}
	}

	/**
	 * 使用流式写入处理大批量数据
	 */
	private async addBatchWithStream(fileName: string, data: any[]): Promise<void> {
		const stream = await this.getWriteStream(fileName)

		return new Promise((resolve, reject) => {
			let writeIndex = 0

			const writeNext = () => {
				let canContinue = true

				// 批量写入，避免阻塞事件循环
				while (canContinue && writeIndex < data.length) {
					const item = data[writeIndex++]
					const jsonLine = JSON.stringify(item) + "\n"

					if (writeIndex === data.length) {
						// 最后一条数据
						stream.write(jsonLine, (error) => {
							if (error) {
								reject(new StorageError(`流式写入失败: ${error.message}`, "STREAM_WRITE_ERROR", true))
							} else {
								resolve()
							}
						})
						return
					} else {
						canContinue = stream.write(jsonLine)
					}
				}

				if (writeIndex < data.length) {
					// 等待 drain 事件后继续写入
					stream.once("drain", writeNext)
				}
			}

			writeNext()
		})
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
			const remainingItems = items.filter((item) => !predicate(item))

			// 如果数量有变化，则重写文件
			if (remainingItems.length !== items.length) {
				await this.writeJsonl(filePath, remainingItems)
				this.logger.info(
					`[JsonFileStorage] 已从 ${fileName} 删除 ${items.length - remainingItems.length} 条记录`,
				)
			}
		} catch (error) {
			throw new StorageError(
				`删除记录失败: ${error instanceof Error ? error.message : String(error)}`,
				"DELETE_ITEMS_ERROR",
				true,
			)
		}
	}

	/**
	 * 追加到JSONL文件 - 优化版本，使用流式写入
	 */
	private async appendToJsonl(filePath: string, data: any): Promise<void> {
		try {
			const fileName = nodePath.basename(filePath)
			const stream = await this.getWriteStream(fileName)
			const jsonLine = JSON.stringify(data) + "\n"

			return new Promise((resolve, reject) => {
				stream.write(jsonLine, (error) => {
					if (error) {
						reject(new StorageError(`追加JSONL文件失败: ${error.message}`, "JSONL_APPEND_ERROR", true))
					} else {
						resolve()
					}
				})
			})
		} catch (error) {
			throw new StorageError(
				`追加JSONL文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"JSONL_APPEND_ERROR",
				true,
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

	/**
	 * 清理资源 - 关闭所有流
	 */
	async dispose(): Promise<void> {
		await this.closeAllStreams()
	}
}
