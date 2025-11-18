/**
 * 存储工厂
 * 根据配置创建相应的存储实例
 */

import { StorageConfig, IStorage, StorageError } from "./IStorage"
import { FileStorage } from "./FileStorage"
import path from "path"
import * as os from "os"
import { createHash } from "crypto"

// 存储创建器接口
interface StorageCreator {
  create(config: StorageConfig): IStorage
  supports(type: string): boolean
}

// 文件存储创建器
class FileStorageCreator implements StorageCreator {
  create(config: StorageConfig): IStorage {
    return new FileStorage(config)
  }
  
  supports(type: string): boolean {
    return type === "file"
  }
}

// 数据库存储创建器（占位符）
class DatabaseStorageCreator implements StorageCreator {
  create(config: StorageConfig): IStorage {
    throw new StorageError("数据库存储暂未实现", "UNSUPPORTED_STORAGE_TYPE", false)
  }
  
  supports(type: string): boolean {
    return type === "database"
  }
}

/**
 * 存储工厂类
 * 使用工厂模式创建存储实例，支持扩展不同类型的存储
 * 重构后符合开闭原则，添加新存储类型无需修改现有代码
 */
export class StorageFactory {
  private static creators: StorageCreator[] = [
    new FileStorageCreator(),
    new DatabaseStorageCreator()
  ]

  /**
   * 注册新的存储创建器
   */
  static registerCreator(creator: StorageCreator): void {
    this.creators.push(creator)
  }

  /**
   * 创建存储实例
   * @param config 存储配置
   * @returns 存储实例
   */
  static createStorage(config: StorageConfig): IStorage {
    this.validateConfig(config)
    
    const creator = this.creators.find(c => c.supports(config.type))
    if (!creator) {
      throw new StorageError(`不支持的存储类型: ${config.type}`, "UNSUPPORTED_STORAGE_TYPE", false)
    }
    
    return creator.create(config)
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
