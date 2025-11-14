/**
 * 知识图谱管理器测试
 * 重构后的测试文件，测试KnowledgeGraphManager而不是KnowledgeGraphService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeGraphManager, knowledgeGraphManager } from '../KnowledgeGraphManager'
import { DEFAULT_CONFIG } from '../constants'
import { KnowledgeGraphError } from '../types'
import * as vscode from 'vscode'


describe('KnowledgeGraphManager', () => {
  let manager: KnowledgeGraphManager
  let mockClineProvider: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // 直接在beforeEach中定义模拟函数
    mockClineProvider = {
      getState: vi.fn().mockResolvedValue({
        apiConfiguration: {
          apiProvider: 'zgsm'
        },
        knowledgeGraphEnabled: true
      }),
      postMessageToWebview: vi.fn().mockResolvedValue(undefined)
    } as any
    
    // 重置单例实例
    (KnowledgeGraphManager as any).instance = null
    manager = KnowledgeGraphManager.getInstance()
    manager.setProvider(mockClineProvider)
  })

  describe('单例模式', () => {
    it('应该返回相同的实例', () => {
      const instance1 = KnowledgeGraphManager.getInstance()
      const instance2 = KnowledgeGraphManager.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('应该提供全局实例', () => {
      expect(knowledgeGraphManager).toBeInstanceOf(KnowledgeGraphManager)
      // 全局实例可能没有被初始化，所以只检查类型
      expect(KnowledgeGraphManager.getInstance()).toBeInstanceOf(KnowledgeGraphManager)
    })
  })

  describe('配置管理', () => {
    it('应该更新配置', () => {
      const newConfig = { maxConcurrency: 8, batchSize: 20 }
      manager.updateConfig(newConfig)
      
      expect(manager.getConfig().maxConcurrency).toBe(8)
      expect(manager.getConfig().batchSize).toBe(20)
    })

    it('应该返回当前配置副本', () => {
      const config = manager.getConfig()
      config.maxConcurrency = 999 // 修改副本
      
      // 原始配置不应该被修改
      expect(manager.getConfig().maxConcurrency).toBe(DEFAULT_CONFIG.maxConcurrency)
    })
  })

  describe('状态检查', () => {
    it('应该返回构建状态', () => {
      const status = manager.getBuildStatus()
      expect(status).toHaveProperty('enabled')
      expect(status).toHaveProperty('isRunning')
      expect(status).toHaveProperty('isPaused')
      expect(status).toHaveProperty('progress')
      expect(status).toHaveProperty('status')
    })

    it('应该返回构建进度', () => {
      const progress = manager.getBuildProgress()
      expect(progress).toBeNull() // 未初始化时应该为null
    })

    it('应该检查是否正在构建', () => {
      expect(manager.isCurrentlyBuilding()).toBe(false)
    })

    it('应该检查是否暂停', () => {
      expect(manager.isCurrentlyPaused()).toBe(false)
    })
  })

  describe('初始化检查', () => {
    it('应该检查知识图谱是否启用', async () => {
      // 未设置提供者时应该返回false
      const emptyManager = KnowledgeGraphManager.getInstance()
      ;(emptyManager as any).clineProvider = null
      
      const result = await (emptyManager as any).isKnowledgeGraphEnabled()
      expect(result).toBe(false)
    })

    it('应该处理API提供者检查', async () => {
      const wrongProvider = {
        getState: vi.fn().mockResolvedValue({
          apiConfiguration: {
            apiProvider: 'openai' // 错误的提供者
          },
          knowledgeGraphEnabled: true
        }),
        postMessageToWebview: vi.fn().mockResolvedValue(undefined)
      } as any
      
      manager.setProvider(wrongProvider)
      const result = await (manager as any).isKnowledgeGraphEnabled()
      expect(result).toBe(false)
    })
  })

  describe('错误处理', () => {
    it('应该处理未初始化错误', async () => {
      // 未初始化时构建应该抛出错误
      await expect(manager.buildKnowledgeGraph()).rejects.toThrow()
    })

    it('应该处理重复构建错误', async () => {
      // 需要先初始化服务
      await manager.initialize()
      
      // 模拟正在构建的状态
      ;(manager as any).isBuilding = true
      
      await expect(manager.buildKnowledgeGraph()).rejects.toThrow('知识图谱构建已在进行中')
    })

    it('应该处理暂停错误', async () => {
      // 需要先初始化服务
      await manager.initialize()
      
      // 未构建时暂停应该抛出错误
      await expect(manager.pauseBuild()).rejects.toThrow('没有正在进行的构建')
    })

    it('应该处理继续错误', async () => {
      // 需要先初始化服务
      await manager.initialize()
      
      // 未构建时继续应该抛出错误
      await expect(manager.resumeBuild()).rejects.toThrow('没有正在进行的构建')
    })
  })

  describe('搜索功能', () => {
    it('应该处理未初始化搜索', async () => {
      await expect(manager.searchKnowledgeGraph('test')).rejects.toThrow('知识图谱服务未初始化')
    })
  })

  describe('导出功能', () => {
    it('应该处理未初始化导出', async () => {
      await expect(manager.exportKnowledgeGraph('json', '/test/output.json')).rejects.toThrow('知识图谱服务未初始化')
    })
  })

  describe('状态查询', () => {
    it('应该返回知识图谱状态', async () => {
      const status = await manager.getKnowledgeGraphStatus()
      
      expect(status).toHaveProperty('exists')
      expect(status).toHaveProperty('info')
      expect(status).toHaveProperty('buildState')
      expect(status).toHaveProperty('rootInfo')
      expect(typeof status.exists).toBe('boolean')
    })
  })

  describe('清除功能', () => {
    it('应该处理未初始化清除', async () => {
      await expect(manager.clearKnowledgeGraph()).rejects.toThrow('知识图谱服务未初始化')
    })
  })

  describe('配置验证', () => {
    it('应该验证配置参数', () => {
      const validConfigs = [
        { maxConcurrency: 1 },
        { batchSize: 1 },
        { maxFiles: 1 },
        { fileSizeLimit: 1 }
      ]

      for (const validConfig of validConfigs) {
        expect(() => {
          manager.updateConfig(validConfig)
        }).not.toThrow()
      }
    })

    it('应该处理存储类型配置', () => {
      manager.updateConfig({ ...DEFAULT_CONFIG, storageType: 'file' })
      
      // 验证存储类型配置
      expect(manager.getConfig().storageType).toBe('file')
      
      // 更新其他配置项，存储类型保持不变
      manager.updateConfig({ maxConcurrency: 10 })
      expect(manager.getConfig().storageType).toBe('file')
      expect(manager.getConfig().maxConcurrency).toBe(10)
    })
  })

  describe('错误类型', () => {
    it('应该正确识别知识图谱错误', () => {
      const error = new KnowledgeGraphError('测试错误', 'TEST_ERROR')
      
      expect(error).toBeInstanceOf(KnowledgeGraphError)
      expect(error.message).toBe('测试错误')
      expect(error.code).toBe('TEST_ERROR')
    })

    it('应该处理不同类型的错误', () => {
      const errors = [
        new KnowledgeGraphError('文件太大', 'FILE_TOO_LARGE'),
        new KnowledgeGraphError('网络错误', 'NETWORK_ERROR'),
        new KnowledgeGraphError('存储错误', 'STORAGE_ERROR')
      ]

      errors.forEach(error => {
        expect(error).toBeInstanceOf(KnowledgeGraphError)
        expect(error.code).toBeDefined()
      })
    })
  })

  describe('生命周期管理', () => {
    it('应该正确销毁管理器', async () => {
      await expect(manager.dispose()).resolves.not.toThrow()
      
      // 销毁后实例应该为null
      expect((KnowledgeGraphManager as any).instance).toBeNull()
    })

    it('应该正确停止服务', async () => {
      // 先初始化
      await manager.initialize()
      
      // 然后停止服务
      await expect(manager.stopService()).resolves.not.toThrow()
      
      // 检查状态
      expect((manager as any).isInitialized).toBe(false)
      expect((manager as any).isHealthCheckRunning).toBe(false)
    })

    it('应该正确重启服务', async () => {
      // 重启服务
      await expect(manager.restartService()).resolves.not.toThrow()
    })
  })

  describe('健康检查', () => {
    it('应该处理健康检查失败', async () => {
      // 模拟多次失败
      (manager as any).healthCheckFailureCount = 4 // 超过阈值
      
      // 触发健康检查失败处理
      await expect((manager as any).handleHealthCheckFailure()).resolves.not.toThrow()
    })

    it('应该正确停止健康检查', () => {
      manager.stopHealthCheck()
      
      expect((manager as any).isHealthCheckRunning).toBe(false)
      expect((manager as any).healthCheckTimer).toBeNull()
      expect((manager as any).healthCheckFailureCount).toBe(0)
    })
  })
})

describe('KnowledgeGraphManager 集成测试', () => {
  it('应该正确处理完整的生命周期', async () => {
    // 重置单例
    (KnowledgeGraphManager as any).instance = null
    
    const testManager = KnowledgeGraphManager.getInstance()
    const mockProvider = {
      getState: vi.fn().mockResolvedValue({
        apiConfiguration: {
          apiProvider: 'zgsm'
        },
        knowledgeGraphEnabled: true
      }),
      postMessageToWebview: vi.fn().mockResolvedValue(undefined)
    } as any
    testManager.setProvider(mockProvider)
    
    // 1. 初始化
    await expect(testManager.initialize()).resolves.not.toThrow()
    
    // 2. 检查状态
    const status = await testManager.getKnowledgeGraphStatus()
    expect(status).toBeDefined()
    
    // 3. 更新配置
    testManager.updateConfig({ maxConcurrency: 15 })
    expect(testManager.getConfig().maxConcurrency).toBe(15)
    
    // 4. 清理
    await expect(testManager.dispose()).resolves.not.toThrow()
  })
})