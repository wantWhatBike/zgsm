/**
 * SQLite 存储实现（使用 sql.js）
 * 用于持久化文件摘要和目录摘要，支持增量更新和基于索引的搜索
 * 注意：使用标准 sql.js（不包含 FTS5），搜索功能使用 LIKE 实现
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { IStorage, StorageError, StorageInitResult } from './IStorage'
import type { Database } from 'sql.js'
import initSqlJs from 'sql.js'
import { SchemaDefinitions } from './SchemaDefinitions'
import { ILogger, createLogger } from '../../../utils/logger'

/**
 * SQLite 存储实现（基于 sql.js）
 */
export class SqliteStorage implements IStorage {
	private db: Database | null = null
	private dbPath: string
	private initialized: boolean = false
	private logger: ILogger

	constructor(storagePath: string, logger?: ILogger) {
		this.dbPath = path.join(storagePath, 'knowledge-graph.db')
		this.logger = logger || createLogger('SqliteStorage')
	}

	/**
	 * 初始化数据库
	 */
	async initialize(): Promise<StorageInitResult> {
		if (this.initialized) {
			this.logger.debug('[SqliteStorage] 数据库已初始化，跳过')
			return { migrated: false }
		}

		this.logger.info('[SqliteStorage] 开始初始化数据库...')
		
		try {
			// 确保存储目录存在
			const dir = path.dirname(this.dbPath)
			await fs.mkdir(dir, { recursive: true })

			// 初始化 sql.js
			// 注意：打包后此文件代码在 dist/extension.js 中，__dirname 指向 dist 目录
			// wasm 文件也被复制到 dist/sql-wasm.wasm，所以可以直接用相对路径
			const SQL = await initSqlJs({
				locateFile: (file) => {
					// 返回 wasm 文件的绝对路径
					return path.join(__dirname, file)
				}
			})

			// 尝试从文件加载现有数据库
			let data: Uint8Array | undefined
			let isNewDatabase = false
			try {
				const buffer = await fs.readFile(this.dbPath)
				data = new Uint8Array(buffer)
				this.logger.info(`[SqliteStorage] 加载现有数据库: ${this.dbPath}`)
			} catch (error) {
				// 文件不存在，创建新数据库
				data = undefined
				isNewDatabase = true
				this.logger.info(`[SqliteStorage] 创建新数据库: ${this.dbPath}`)
			}

			// 创建或加载数据库
			this.db = new SQL.Database(data)
			if (!this.db) {
				throw new StorageError('无法创建数据库连接', 'DB_CONNECTION_ERROR', false)
			}

			// 创建表结构（返回是否有表结构变更）
			const schemaChanged = this.createTables()

			// ⭐️ 关键：sql.js 是内存数据库，必须保存到磁盘
			// 新建数据库或表结构变更时需要保存
			if (isNewDatabase || schemaChanged) {
				await this.saveDatabase()
				this.logger.info('[SqliteStorage] 💾 数据库已保存到磁盘')
			}

			this.initialized = true
			
			// ⭐️ 返回迁移信息
			if (schemaChanged) {
				this.logger.warn('[SqliteStorage] ⚠️  表结构已迁移，数据已清空')
				return {
					migrated: true,
					message: '表结构已更新，旧数据已清除'
				}
			}
			
			if (isNewDatabase) {
				this.logger.info('[SqliteStorage] ✅ 数据库初始化完成（新建）')
			} else {
				this.logger.info('[SqliteStorage] ✅ 数据库初始化完成（已加载）')
			}
			
			return { migrated: false }
		} catch (error) {
			this.logger.error('[SqliteStorage] ❌ 数据库初始化失败:', error)
			throw new StorageError(
				`初始化 SQLite 存储失败: ${error instanceof Error ? error.message : String(error)}`,
				'INIT_ERROR',
				false
			)
		}
	}

	/**
	 * 创建表结构
	 * @returns 是否发生了表结构变更（用于决定是否需要保存）
	 */
	private createTables(): boolean {
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		let schemaChanged = false

		// 验证 file_summaries 表结构
		if (this.tableExists('file_summaries')) {
			const expectedColumns = SchemaDefinitions.getColumnNames('file_summaries')
			const isValid = this.validateTableSchema('file_summaries', expectedColumns)
			if (!isValid) {
				this.logger.warn('[SqliteStorage] ⚠️  检测到 file_summaries 表结构不一致')
				this.logger.warn(`[SqliteStorage] 期望列: ${expectedColumns.join(', ')}`)
				const actualColumns = this.getActualColumns('file_summaries')
				this.logger.warn(`[SqliteStorage] 实际列: ${actualColumns.join(', ')}`)
				this.logger.warn('[SqliteStorage] 正在删除旧表并重建...')
				this.dropTable('file_summaries')
				schemaChanged = true
			}
		}

		// 验证 directory_summaries 表结构
		if (this.tableExists('directory_summaries')) {
			const expectedColumns = SchemaDefinitions.getColumnNames('directory_summaries')
			const isValid = this.validateTableSchema('directory_summaries', expectedColumns)
			if (!isValid) {
				this.logger.warn('[SqliteStorage] ⚠️  检测到 directory_summaries 表结构不一致')
				this.logger.warn(`[SqliteStorage] 期望列: ${expectedColumns.join(', ')}`)
				const actualColumns = this.getActualColumns('directory_summaries')
				this.logger.warn(`[SqliteStorage] 实际列: ${actualColumns.join(', ')}`)
				this.logger.warn('[SqliteStorage] 正在删除旧表并重建...')
				this.dropTable('directory_summaries')
				schemaChanged = true
			}
		}

		// 使用 SchemaDefinitions 生成表结构
		db.run(SchemaDefinitions.generateTableDDL('file_summaries'))
		db.run(SchemaDefinitions.generateTableDDL('directory_summaries'))

		if (schemaChanged) {
			this.logger.warn('[SqliteStorage] ✅ 表结构已更新，旧数据已清除')
			this.logger.warn('[SqliteStorage] 💡 提示：请重新构建知识图谱以生成新的摘要数据')
		}

		// 注意：标准 sql.js 不支持 FTS5，使用普通索引替代
		// 为搜索字段创建索引以提升查询性能
		const fileIndexFields = SchemaDefinitions.getIndexedFields('file_summaries')
		for (const field of fileIndexFields) {
			db.run(`CREATE INDEX IF NOT EXISTS idx_file_summaries_${field} ON file_summaries(${field})`)
		}

		const dirIndexFields = SchemaDefinitions.getIndexedFields('directory_summaries')
		for (const field of dirIndexFields) {
			db.run(`CREATE INDEX IF NOT EXISTS idx_directory_summaries_${field} ON directory_summaries(${field})`)
		}
		
		return schemaChanged
	}


	/**
	 * 保存数据库到文件
	 */
	private async saveDatabase(): Promise<void> {
		if (!this.db) return

		try {
			const data = this.db.export()
			await fs.writeFile(this.dbPath, data)
		} catch (error) {
			this.logger.error('[SqliteStorage] 保存数据库失败:', error)
		}
	}

	/**
	 * 检查存储是否存在
	 */
	async exists(): Promise<boolean> {
		try {
			await fs.access(this.dbPath)
			return true
		} catch {
			return false
		}
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
			db.run(`DELETE FROM ${tableName}`)
			await this.saveDatabase()
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
			const stmt = db.prepare(`SELECT data FROM ${tableName}`)
			const rows: Array<{ data: string }> = []
			
			while (stmt.step()) {
				const row = stmt.getAsObject() as { data: string }
				rows.push(row)
			}
			stmt.free()

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

			// 清空表
			db.run(`DELETE FROM ${tableName}`)

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

			await this.saveDatabase()
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
			await this.saveDatabase()
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

			for (const item of data) {
				this.insertRow(tableName, item)
			}

			await this.saveDatabase()
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
			const stmt = db.prepare(`SELECT * FROM ${tableName}`)
			const rows: any[] = []
			
			while (stmt.step()) {
				rows.push(stmt.getAsObject())
			}
			stmt.free()

			// 过滤出需要删除的项
			for (const row of rows) {
				const item = JSON.parse((row as any).data)
				if (predicate(item)) {
					db.run(`DELETE FROM ${tableName} WHERE path = ?`, [(row as any).path])
				}
			}

			await this.saveDatabase()
		} catch (error) {
			throw new StorageError(
				`删除数据失败: ${error instanceof Error ? error.message : String(error)}`,
				'DELETE_ERROR'
			)
		}
	}

	/**
	 * 搜索（使用 LIKE，因为标准 sql.js 不支持 FTS5）
	 */
	async search(table: string, query: string, limit: number = 10): Promise<any[]> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)
			const searchPattern = `%${query}%`

			const stmt = db.prepare(`
				SELECT * FROM ${tableName}
				WHERE description LIKE ? OR keywords LIKE ?
				LIMIT ?
			`)
			
			stmt.bind([searchPattern, searchPattern, limit])
			const rows: any[] = []
			
			while (stmt.step()) {
				const row = stmt.getAsObject()
				rows.push(JSON.parse((row as any).data))
			}
			stmt.free()

			return rows
		} catch (error) {
			throw new StorageError(
				`搜索失败: ${error instanceof Error ? error.message : String(error)}`,
				'SEARCH_ERROR'
			)
		}
	}

	/**
	 * 更新数据（使用 UPSERT）
	 * SQLite 优势：INSERT OR REPLACE 自动处理更新，无需先删除
	 */
	async update(table: string, data: any | any[]): Promise<void> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		try {
			const tableName = this.normalizeTableName(table)
			const items = Array.isArray(data) ? data : [data]

			for (const item of items) {
				this.insertRow(tableName, item)  // insertRow 已经使用 INSERT OR REPLACE
			}

			await this.saveDatabase()
		} catch (error) {
			throw new StorageError(
				`更新数据失败: ${error instanceof Error ? error.message : String(error)}`,
				'UPDATE_ERROR'
			)
		}
	}

	/**
	 * 批量更新数据
	 */
	async updateBatch(table: string, data: any[]): Promise<void> {
		return this.update(table, data)  // 复用 update 方法
	}

	/**
	 * 批量删除数据（按路径）
	 * SQLite 优势：使用 WHERE IN 一次性删除，无需读取全表
	 */
	async deleteBatch(table: string, paths: string[]): Promise<void> {
		this.ensureInitialized()
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)

		if (paths.length === 0) return

		try {
			const tableName = this.normalizeTableName(table)
			const placeholders = paths.map(() => '?').join(',')

			db.run(
				`DELETE FROM ${tableName} WHERE path IN (${placeholders})`,
				paths
			)

			await this.saveDatabase()
		} catch (error) {
			throw new StorageError(
				`批量删除失败: ${error instanceof Error ? error.message : String(error)}`,
				'DELETE_BATCH_ERROR'
			)
		}
	}

	/**
	 * 插入行数据（使用动态 Schema）
	 */
	private insertRow(tableName: string, item: any): void {
		const db = this.db
		if (!db) throw new StorageError('数据库未初始化', 'DB_NOT_INITIALIZED', false)
		
		// 验证表名
		const supportedTables = SchemaDefinitions.getAllTableNames()
		if (!supportedTables.includes(tableName)) {
			throw new StorageError(
				`不支持的表名: ${tableName}，仅支持: ${supportedTables.join(', ')}`,
				'UNSUPPORTED_TABLE',
				false
			)
		}

		// 提取索引字段
		const indexFields = SchemaDefinitions.extractIndexFields(tableName, item)
		
		// 完整 JSON 数据
		const dataJson = JSON.stringify(item)
		
		// 构建列名和占位符
		const columns = Object.keys(indexFields).concat(['data'])
		const placeholders = columns.map(() => '?').join(', ')
		const values = Object.values(indexFields).concat([dataJson])
		
		// 动态生成 INSERT 语句
		db.run(
			`INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
			values
		)
	}

	/**
	 * 规范化表名
	 */
	private normalizeTableName(table: string): string {
		// 移除 .jsonl 后缀并转换连字符为下划线
		const normalized = table.replace(/\.jsonl$/, '').replace(/-/g, '_')
		
		// 精确映射表名
		const tableMap: Record<string, string> = {
			'file_summaries': 'file_summaries',
			'directory_summaries': 'directory_summaries'
		}
		
		// 如果在映射表中找到，返回映射值；否则返回原值
		return tableMap[normalized] || normalized
	}

	/**
	 * 检查表是否存在
	 */
	private tableExists(tableName: string): boolean {
		const db = this.db
		if (!db) return false
		
		try {
			const stmt = db.prepare(
				`SELECT name FROM sqlite_master WHERE type='table' AND name=?`
			)
			stmt.bind([tableName])
			const exists = stmt.step()
			stmt.free()
			return exists
		} catch (error) {
			return false
		}
	}

	/**
	 * 获取表的实际列名
	 */
	private getActualColumns(tableName: string): string[] {
		const db = this.db
		if (!db) return []
		
		try {
			const stmt = db.prepare(`PRAGMA table_info(${tableName})`)
			const columns: string[] = []
			
			while (stmt.step()) {
				const row = stmt.getAsObject() as { name: string }
				columns.push(row.name)
			}
			stmt.free()
			
			return columns
		} catch (error) {
			return []
		}
	}

	/**
	 * 验证表结构
	 */
	private validateTableSchema(tableName: string, expectedColumns: string[]): boolean {
		const db = this.db
		if (!db) return false
		
		try {
			const actualColumns = this.getActualColumns(tableName)
			
			if (actualColumns.length !== expectedColumns.length) {
				return false
			}
			
			for (const expectedCol of expectedColumns) {
				if (!actualColumns.includes(expectedCol)) {
					return false
				}
			}
			
			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * 删除表
	 */
	private dropTable(tableName: string): void {
		const db = this.db
		if (!db) return
		
		try {
			db.run(`DROP TABLE IF EXISTS ${tableName}_fts`)
			db.run(`DROP TABLE IF EXISTS ${tableName}`)
			this.logger.info(`[SqliteStorage] ✓ 已删除表: ${tableName}`)
		} catch (error) {
			this.logger.error(`[SqliteStorage] ✗ 删除表 ${tableName} 失败:`, error)
		}
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
			// 保存数据库（同步操作，close 时不使用 async）
			try {
				const data = this.db.export()
				require('fs').writeFileSync(this.dbPath, data)
			} catch (error) {
				this.logger.error('[SqliteStorage] 关闭时保存数据库失败:', error)
			}
			
			this.db.close()
			this.db = null
			this.initialized = false
		}
	}

	/**
	 * 资源释放方法
	 */
	async dispose(): Promise<void> {
		this.close()
	}
}
