/**
 * 存储工厂
 * 根据配置创建相应的存储实例
 */

import { StorageConfig, IStorage, StorageError } from "./StorageInterface"
import { FileStorage } from "./FileStorage"
import path from "path"
import * as os from "os"
import { createHash } from "crypto"

/**
 * 存储工厂类
 * 使用工厂模式创建存储实例，支持扩展不同类型的存储
 */
export class StorageFactory {
	/**
	 * 创建存储实例
	 * @param config 存储配置
	 * @returns 存储实例
	 */
	static createStorage(config: StorageConfig): IStorage {

        StorageFactory.validateConfig(config)
		switch (config.type) {
			case "file":
				return new FileStorage(config)

			case "database":
				// 未来可以扩展数据库存储
				throw new StorageError("数据库存储暂未实现", "UNSUPPORTED_STORAGE_TYPE", false)

			default:
				throw new StorageError(`不支持的存储类型: ${config.type}`, "UNSUPPORTED_STORAGE_TYPE", false)
		}
	}


    
	/**
	 * 创建存储实例
	 */
	private createFileStorage(workspacePath: string, config: StorageConfig): FileStorage {
		const storageConfig: StorageConfig = {
			type: config!.type,
			path: StorageFactory.getWorkspaceStoragePath(workspacePath),
		}
		
	}

    

	/**
	 * 验证存储配置
	 * @param config 存储配置
	 * @returns 是否有效
	 */
	static validateConfig(config: StorageConfig): boolean {
		if (!config) {
			return false
		}

		// 检查必需字段
		if (!config.type || !config.path) {
			return false
		}

		// 检查支持的存储类型
		const supportedTypes: StorageConfig["type"][] = ["file", "database"]
		if (!supportedTypes.includes(config.type)) {
			return false
		}

		// 文件存储特定验证
		if (config.type === "file") {
			// 路径不能为空
			if (!config.path.trim()) {
				return false
			}
		}

		return true
	}

	/**
	 * 获取存储路径
	 */
	static getWorkspaceStoragePath(workspacePath: string): string {
		const projectName = path.basename(workspacePath)
		const projectHash = createHash("sha256").update(workspacePath).digest("hex").substring(0, 8)
		return path.join(os.homedir(), ".costrict", "cache", "knowledge-graph", `${projectName}-${projectHash}`)
	}
}
