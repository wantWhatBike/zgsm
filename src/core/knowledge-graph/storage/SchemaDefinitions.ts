/**
 * 集中式 Schema 定义模块
 * 
 * 职责：
 * - 作为单一数据源，定义数据库表结构和 LLM Schema
 * - 自动生成 SQL DDL 语句
 * - 自动生成 LLM 结构化输出模板
 * - 提供字段提取和验证工具方法
 * 
 * 设计原则：
 * - DRY：Schema 定义只在一处维护
 * - 单一数据源：TypeScript 类型定义驱动所有 Schema 生成
 * - 类型安全：确保数据库结构与 TypeScript 类型定义一致
 */

/**
 * 字段定义接口
 */
interface FieldDefinition {
	name: string                           // 字段名
	sqlType: 'TEXT' | 'INTEGER' | 'REAL'   // SQL 数据类型
	isPrimaryKey?: boolean                 // 是否为主键
	isIndexed?: boolean                    // 是否创建索引
	storeAsColumn?: boolean                // 是否存储为独立列（用于索引和查询）
	llmDescription?: string                // LLM Schema 中的字段描述
	llmExample?: any                       // LLM Schema 中的示例值
}

/**
 * 表结构定义接口
 */
interface TableSchema {
	tableName: string          // 表名
	fields: FieldDefinition[]  // 字段定义列表
}

/**
 * 文件摘要表 Schema
 * 对应 TypeScript 类型：FileSummary (src/core/knowledge-graph/types.ts)
 */
const FILE_SUMMARIES_SCHEMA: TableSchema = {
	tableName: 'file_summaries',
	fields: [
		{
			name: 'path',
			sqlType: 'TEXT',
			isPrimaryKey: true,
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'File path',
			llmExample: 'src/utils/helper.ts'
		},
		{
			name: 'type',
			sqlType: 'TEXT',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'File type',
			llmExample: 'source'
		},
		{
			name: 'summary',
			sqlType: 'TEXT',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'Core function in ≤15 words',
			llmExample: 'Utility functions for data transformation'
		},
		{
			name: 'description',
			sqlType: 'TEXT',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: '~150 words: business logic, architectural role, data flow',
			llmExample: 'This file provides utility functions...'
		},
		{
			name: 'keywords',
			sqlType: 'TEXT',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'Keywords array (max 10)',
			llmExample: ['keyword1', 'keyword2', 'keyword3']
		},
		{
			name: 'functions',
			sqlType: 'TEXT',
			storeAsColumn: true,
			llmDescription: 'Function name to description mapping',
			llmExample: {
				function_name1: 'Function description, 50-100 words',
				function_name2: 'Function description, 50-100 words'
			}
		},
		{
			name: 'dependencies',
			sqlType: 'TEXT',
			storeAsColumn: true,
			llmDescription: 'Dependency file paths',
			llmExample: ['path/to/file1.ts', 'path/to/file2.ts']
		},
		{
			name: 'timestamp',
			sqlType: 'TEXT',
			storeAsColumn: true,
			llmDescription: 'ISO timestamp',
			llmExample: '2024-01-01T00:00:00.000Z'
		},
		{
			name: 'lastModified',
			sqlType: 'INTEGER',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'Last modified timestamp (Unix epoch)',
			llmExample: 1704067200000
		}
	]
}

/**
 * 目录摘要表 Schema
 * 对应 TypeScript 类型：DirectorySummary (src/core/knowledge-graph/types.ts)
 */
const DIRECTORY_SUMMARIES_SCHEMA: TableSchema = {
	tableName: 'directory_summaries',
	fields: [
		{
			name: 'path',
			sqlType: 'TEXT',
			isPrimaryKey: true,
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'Directory path',
			llmExample: 'src/utils'
		},
		{
			name: 'summary',
			sqlType: 'TEXT',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'Core purpose in ≤15 words',
			llmExample: 'Utility modules for common operations'
		},
		{
			name: 'description',
			sqlType: 'TEXT',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: '~150 words: role, functionality, business value',
			llmExample: 'This directory contains utility modules...'
		},
		{
			name: 'keywords',
			sqlType: 'TEXT',
			isIndexed: true,
			storeAsColumn: true,
			llmDescription: 'Keywords array (max 10)',
			llmExample: ['keyword1', 'keyword2']
		},
		{
			name: 'key_files',
			sqlType: 'TEXT',
			storeAsColumn: true,
			llmDescription: 'Key file names (max 5)',
			llmExample: ['file1.ts', 'file2.ts']
		},
		{
			name: 'timestamp',
			sqlType: 'TEXT',
			storeAsColumn: true,
			llmDescription: 'ISO timestamp',
			llmExample: '2024-01-01T00:00:00.000Z'
		}
	]
}

/**
 * Schema 映射表
 */
const SCHEMAS: Record<string, TableSchema> = {
	'file_summaries': FILE_SUMMARIES_SCHEMA,
	'directory_summaries': DIRECTORY_SUMMARIES_SCHEMA
}

/**
 * 集中式 Schema 定义工具类
 */
export class SchemaDefinitions {
	/**
	 * 生成 CREATE TABLE DDL 语句
	 */
	static generateTableDDL(tableName: string): string {
		const schema = SCHEMAS[tableName]
		if (!schema) {
			throw new Error(`Unknown table: ${tableName}`)
		}

		const columns: string[] = []
		
		// 添加定义的列
		for (const field of schema.fields) {
			if (!field.storeAsColumn) continue
			
			let columnDef = `${field.name} ${field.sqlType}`
			
			if (field.isPrimaryKey) {
				columnDef += ' PRIMARY KEY'
			}
			
			columns.push(columnDef)
		}
		
		// 添加 data 列（存储完整 JSON）
		columns.push('data TEXT')
		
		return `CREATE TABLE IF NOT EXISTS ${tableName} (\n\t${columns.join(',\n\t')}\n)`
	}

	/**
	 * 获取表的所有列名（用于表结构验证）
	 */
	static getColumnNames(tableName: string): string[] {
		const schema = SCHEMAS[tableName]
		if (!schema) {
			throw new Error(`Unknown table: ${tableName}`)
		}

		const columns = schema.fields
			.filter(f => f.storeAsColumn)
			.map(f => f.name)
		
		// 添加 data 列
		columns.push('data')
		
		return columns
	}

	/**
	 * 获取需要创建索引的字段列表
	 */
	static getIndexedFields(tableName: string): string[] {
		const schema = SCHEMAS[tableName]
		if (!schema) {
			throw new Error(`Unknown table: ${tableName}`)
		}

		return schema.fields
			.filter(f => f.isIndexed && f.storeAsColumn)
			.map(f => f.name)
	}

	/**
	 * 生成 LLM 结构化输出 Schema
	 * 返回示例对象，用于 LLM 结构化输出
	 */
	static getLLMSchema(tableName: string): any {
		const schema = SCHEMAS[tableName]
		if (!schema) {
			throw new Error(`Unknown table: ${tableName}`)
		}

		// 根据表名返回不同格式
		if (tableName === 'file_summaries') {
			// 文件摘要返回数组格式
			const example: any = {}
			for (const field of schema.fields) {
				if (field.llmDescription) {
					example[field.name] = field.llmExample || field.llmDescription
				}
			}
			return [example]
		} else if (tableName === 'directory_summaries') {
			// 目录摘要返回单个对象格式
			const example: any = {}
			for (const field of schema.fields) {
				if (field.llmDescription) {
					example[field.name] = field.llmExample || field.llmDescription
				}
			}
			return example
		}

		return {}
	}

	/**
	 * 从完整对象中提取索引字段
	 * 用于插入数据时提取需要存储为独立列的字段
	 */
	static extractIndexFields(tableName: string, item: any): Record<string, any> {
		const schema = SCHEMAS[tableName]
		if (!schema) {
			throw new Error(`Unknown table: ${tableName}`)
		}

		const result: Record<string, any> = {}
		
		for (const field of schema.fields) {
			if (!field.storeAsColumn) continue
			
			const value = item[field.name]
			
			// 特殊处理数组和对象类型：序列化为 JSON
			if (value !== undefined) {
				if (Array.isArray(value) || typeof value === 'object') {
					result[field.name] = JSON.stringify(value)
				} else {
					result[field.name] = value
				}
			} else {
				// 提供默认值
				if (field.sqlType === 'TEXT') {
					result[field.name] = ''
				} else if (field.sqlType === 'INTEGER') {
					result[field.name] = 0
				} else if (field.sqlType === 'REAL') {
					result[field.name] = 0.0
				}
			}
		}
		
		return result
	}

	/**
	 * 获取表的 Schema 定义（用于调试和测试）
	 */
	static getSchema(tableName: string): TableSchema | undefined {
		return SCHEMAS[tableName]
	}

	/**
	 * 获取所有表名
	 */
	static getAllTableNames(): string[] {
		return Object.keys(SCHEMAS)
	}
}

