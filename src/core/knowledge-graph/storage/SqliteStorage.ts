/**
 * SQLite 存储实现
 * 用于持久化文件摘要和目录摘要，支持增量更新和全文检索（FTS5）
 */

import * as path from 'path'
import * as fs from 'fs'
import { IStorage, StorageError } from './IStorage'
import Database from 'better-sqlite3';

/**
 * SQLite 数据库实例类型
 */
interface DatabaseInstance {
	pragma(sql: string): void
	exec(sql: string): void
	prepare(sql: string): {
		run(...params: any[]): any
		all(...params: any[]): any[]
	}
	transaction(fn: () => void): () => void
	close(): void
}

/**
 * SQLite 存储实现
 */
export class SqliteStorage implements IStorage {
	private db: DatabaseInstance | null = null
	private dbPath: string
	private initialized: boolean = false

	constructor(storagePath: string) {
		this.dbPath = path.join(storagePath, 'knowledge-graph.db')
	}

	/**
	 * 初始化数据库
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return

		try {
			// 确保存储目录存在
			const dir = path.dirname(this.dbPath)
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}

			// 打开数据库连接
			this.db = new Database(this.dbPath)
			if (!this.db) {
				throw new StorageError('无法创建数据库连接', 'DB_CONNECTION_ERROR', false)
			}
			this.db.pragma('journal_mode = WAL') // 使用 WAL 模式提高性能

			// 创建表结构
			this.createTables()

			this.initialized = true
		} catch (error) {
			throw new StorageError(
				`初始化 SQLite 存储失败: ${error instanceof Error ? error.message : String(error)}`,
				'INIT_ERROR',
				false
			)
		}
	}

	/**
	 * 创建表结构
	 */
	private createTables(): void {
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		// 文件摘要表
		db.exec(`
			CREATE TABLE IF NOT EXISTS file_summaries (
				path TEXT PRIMARY KEY,
				type TEXT,
				description TEXT,
				keywords TEXT,
				functions TEXT,
				dependencies TEXT,
				timestamp TEXT,
				lastModified INTEGER,
				data TEXT
			);
		`)

		// 目录摘要表
		db.exec(`
			CREATE TABLE IF NOT EXISTS directory_summaries (
				path TEXT PRIMARY KEY,
				type TEXT,
				description TEXT,
				keywords TEXT,
				key_files TEXT,
				timestamp TEXT,
				data TEXT
			);
		`)

		// FTS5 全文搜索表 - 文件摘要
		db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS file_summaries_fts USING fts5(
				path,
				description,
				keywords,
				content='file_summaries',
				content_rowid='rowid',
				tokenize='unicode61'
			);
		`)

		// FTS5 全文搜索表 - 目录摘要
		db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS directory_summaries_fts USING fts5(
				path,
				description,
				keywords,
				content='directory_summaries',
				content_rowid='rowid',
				tokenize='unicode61'
			);
		`)

		// 创建触发器以自动同步 FTS 索引
		this.createFTSTriggers()
	}

	/**
	 * 创建 FTS 触发器
	 */
	private createFTSTriggers(): void {
		const db = this.db
		if (!db) return

		// 文件摘要 FTS 触发器
		db.exec(`
			CREATE TRIGGER IF NOT EXISTS file_summaries_ai AFTER INSERT ON file_summaries BEGIN
				INSERT INTO file_summaries_fts(rowid, path, description, keywords)
				VALUES (new.rowid, new.path, new.description, new.keywords);
			END;
		`)

		db.exec(`
			CREATE TRIGGER IF NOT EXISTS file_summaries_ad AFTER DELETE ON file_summaries BEGIN
				INSERT INTO file_summaries_fts(file_summaries_fts, rowid, path, description, keywords)
				VALUES('delete', old.rowid, old.path, old.description, old.keywords);
			END;
		`)

		db.exec(`
			CREATE TRIGGER IF NOT EXISTS file_summaries_au AFTER UPDATE ON file_summaries BEGIN
				INSERT INTO file_summaries_fts(file_summaries_fts, rowid, path, description, keywords)
				VALUES('delete', old.rowid, old.path, old.description, old.keywords);
				INSERT INTO file_summaries_fts(rowid, path, description, keywords)
				VALUES (new.rowid, new.path, new.description, new.keywords);
			END;
		`)

		// 目录摘要 FTS 触发器
		db.exec(`
			CREATE TRIGGER IF NOT EXISTS directory_summaries_ai AFTER INSERT ON directory_summaries BEGIN
				INSERT INTO directory_summaries_fts(rowid, path, description, keywords)
				VALUES (new.rowid, new.path, new.description, new.keywords);
			END;
		`)

		db.exec(`
			CREATE TRIGGER IF NOT EXISTS directory_summaries_ad AFTER DELETE ON directory_summaries BEGIN
				INSERT INTO directory_summaries_fts(directory_summaries_fts, rowid, path, description, keywords)
				VALUES('delete', old.rowid, old.path, old.description, old.keywords);
			END;
		`)

		db.exec(`
			CREATE TRIGGER IF NOT EXISTS directory_summaries_au AFTER UPDATE ON directory_summaries BEGIN
				INSERT INTO directory_summaries_fts(directory_summaries_fts, rowid, path, description, keywords)
				VALUES('delete', old.rowid, old.path, old.description, old.keywords);
				INSERT INTO directory_summaries_fts(rowid, path, description, keywords)
				VALUES (new.rowid, new.path, new.description, new.keywords);
			END;
		`)
	}

	/**
	 * 检查存储是否存在
	 */
	async exists(): Promise<boolean> {
		return fs.existsSync(this.dbPath)
	}

	/**
	 * 清空表
	 */
	async clear(table: string): Promise<void> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)
			db.prepare(`DELETE FROM ${tableName}`).run()
		} catch (error) {
			throw new StorageError(
				`清空表失败: ${error instanceof Error ? error.message : String(error)}`,
				'CLEAR_ERROR'
			)
		}
	}

	/**
	 * 加载表数据（返回 JSONL 格式字符串，兼容现有代码）
	 */
	async load(table: string): Promise<string | null> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)
			const rows = db.prepare(`SELECT data FROM ${tableName}`).all() as Array<{ data: string }>

			if (rows.length === 0) return null

			// 返回 JSONL 格式
			return rows.map(row => row.data).join('\n')
		} catch (error) {
			throw new StorageError(
				`加载表数据失败: ${error instanceof Error ? error.message : String(error)}`,
				'LOAD_ERROR'
			)
		}
	}

	/**
	 * 覆盖写入表数据
	 */
	async overwrite(table: string, data: any): Promise<void> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)

			// 开启事务
			const transaction = db.transaction(() => {
				// 清空表
				db.prepare(`DELETE FROM ${tableName}`).run()

				// 根据数据类型处理
				if (typeof data === 'string') {
					// JSONL 格式字符串
					const lines = data.split('\n').filter(line => line.trim())
					for (const line of lines) {
						this.insertRow(tableName, JSON.parse(line))
					}
				} else if (Array.isArray(data)) {
					// 数组格式
					for (const item of data) {
						this.insertRow(tableName, item)
					}
				} else {
					// 单个对象
					this.insertRow(tableName, data)
				}
			})

			transaction()
		} catch (error) {
			throw new StorageError(
				`覆盖写入失败: ${error instanceof Error ? error.message : String(error)}`,
				'OVERWRITE_ERROR'
			)
		}
	}

	/**
	 * 添加单条数据
	 */
	async add(table: string, data: any): Promise<void> {
		this.ensureInitialized()

		try {
			const tableName = this.normalizeTableName(table)
			this.insertRow(tableName, data)
		} catch (error) {
			throw new StorageError(
				`添加数据失败: ${error instanceof Error ? error.message : String(error)}`,
				'ADD_ERROR'
			)
		}
	}

	/**
	 * 批量添加数据
	 */
	async addBatch(table: string, data: any[]): Promise<void> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)

			const transaction = db.transaction(() => {
				for (const item of data) {
					this.insertRow(tableName, item)
				}
			})

			transaction()
		} catch (error) {
			throw new StorageError(
				`批量添加失败: ${error instanceof Error ? error.message : String(error)}`,
				'ADD_BATCH_ERROR'
			)
		}
	}

	/**
	 * 删除符合条件的项
	 */
	async deleteItems(table: string, predicate: (item: any) => boolean): Promise<void> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)

			// 先查询所有数据
			const rows = db.prepare(`SELECT * FROM ${tableName}`).all()

			// 过滤出需要删除的项
			const transaction = db.transaction(() => {
				for (const row of rows) {
					const item = JSON.parse((row as any).data)
					if (predicate(item)) {
						db.prepare(`DELETE FROM ${tableName} WHERE path = ?`).run((row as any).path)
					}
				}
			})

			transaction()
		} catch (error) {
			throw new StorageError(
				`删除数据失败: ${error instanceof Error ? error.message : String(error)}`,
				'DELETE_ERROR'
			)
		}
	}

	/**
	 * 全文搜索（FTS5）
	 */
	async search(table: string, query: string, limit: number = 10): Promise<any[]> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)
			const ftsTable = `${tableName}_fts`

			const stmt = db.prepare(`
				SELECT fs.* 
				FROM ${ftsTable} fts
				JOIN ${tableName} fs ON fts.rowid = fs.rowid
				WHERE ${ftsTable} MATCH ?
				LIMIT ?
			`)

			const rows = stmt.all(query, limit)
			return rows.map((row: any) => JSON.parse(row.data))
		} catch (error) {
			throw new StorageError(
				`全文搜索失败: ${error instanceof Error ? error.message : String(error)}`,
				'SEARCH_ERROR'
			)
		}
	}

	/**
	 * 插入行数据
	 */
	private insertRow(tableName: string, item: any): void {
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)
		
		const dataJson = JSON.stringify(item)

		if (tableName === 'file_summaries') {
			db.prepare(`
				INSERT OR REPLACE INTO file_summaries 
				(path, type, description, keywords, functions, dependencies, timestamp, lastModified, data)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				item.path,
				item.type,
				item.description || '',
				JSON.stringify(item.keywords || []),
				JSON.stringify(item.functions || {}),
				JSON.stringify(item.dependencies || []),
				item.timestamp,
				item.lastModified || 0,
				dataJson
			)
		} else if (tableName === 'directory_summaries') {
			db.prepare(`
				INSERT OR REPLACE INTO directory_summaries 
				(path, type, description, keywords, key_files, timestamp, data)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`).run(
				item.path,
				item.type,
				item.description || '',
				JSON.stringify(item.keywords || []),
				JSON.stringify(item.key_files || []),
				item.timestamp,
				dataJson
			)
		}
	}

	/**
	 * 规范化表名
	 */
	private normalizeTableName(table: string): string {
		// 移除 .jsonl 后缀
		const normalized = table.replace(/\.jsonl$/, '').replace(/-/g, '_')
		
		// 映射到实际表名
		if (normalized.includes('file_summar')) return 'file_summaries'
		if (normalized.includes('directory_summar')) return 'directory_summaries'
		
		return normalized
	}

	/**
	 * 确保已初始化
	 */
	private ensureInitialized(): void {
		if (!this.initialized || !this.db) {
			throw new StorageError('存储未初始化，请先调用 initialize()', 'NOT_INITIALIZED', false)
		}
	}

	/**
	 * 关闭数据库连接
	 */
	close(): void {
		if (this.db) {
			this.db.close()
			this.db = null
			this.initialized = false
		}
	}
}
