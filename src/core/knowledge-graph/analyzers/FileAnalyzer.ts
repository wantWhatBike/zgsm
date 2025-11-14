/**
 * 文件分析器 - 分析项目文件
 */

import * as fs from "fs/promises"
import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { FILE_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { FileSummary, FileAnalysisResult, RootInfo, KnowledgeGraphError, BuildProgress } from "../types"
import { FILE_TYPE_MAPPING, ANALYSIS_CONFIG, ERROR_CODES } from "../constants"
import { getFileType, safeReadFile, isFileReadable } from "../tools/FileFilter"
import { FileListService } from "../tools/FileListService"
import { createLogger, ILogger } from "../../../utils/logger"

export class FileAnalyzer {
  private llmClient: LLMClient
  private workspacePath: string
  private config: any
  private logger: ILogger
  private storage: any = null // 存储实例，用于增量构建

  constructor(llmClient: LLMClient, workspacePath: string, config: any = {}) {
    this.llmClient = llmClient
    this.workspacePath = workspacePath
    this.config = { ...ANALYSIS_CONFIG, ...config }
    this.logger = createLogger()
  }

  /**
   * 设置存储实例
   */
  setStorage(storage: any): void {
    this.storage = storage
  }

  /**
   * 分析项目文件
   */
  async analyzeFiles(
    workspacePath: string,
    onProgress?: (progress: BuildProgress) => void,
    onFileSummary?: (summary: FileSummary) => Promise<void>
  ): Promise<FileSummary[]> {
    try {
      // 1. 获取文件列表
      onProgress?.({
        phase: 'file_analysis',
        current: 0,
        total: 1,
        message: '获取文件列表...',
        percentage: 0
      })

      const fileList = await this.getFileList(workspacePath)
      
      onProgress?.({
        phase: 'file_analysis',
        current: 1,
        total: fileList.length + 1,
        message: `找到 ${fileList.length} 个文件`,
        percentage: Math.round((1 / (fileList.length + 1)) * 100)
      })

      // 2. 分批分析文件
      const batchSize = this.config.batchSize || 10
      const summaries: FileSummary[] = []
      
      for (let i = 0; i < fileList.length; i += batchSize) {
        const batch = fileList.slice(i, i + batchSize)
        const batchSummaries = await this.analyzeFileBatch(batch, workspacePath)
        
        // 如果提供了增量保存回调，立即保存每个文件摘要
        if (onFileSummary) {
          for (const summary of batchSummaries) {
            await onFileSummary(summary)
          }
        }
        
        summaries.push(...batchSummaries)
        
        const progress = {
          phase: 'file_analysis' as const,
          current: i + batch.length,
          total: fileList.length,
          message: `已分析 ${i + batch.length}/${fileList.length} 个文件`,
          percentage: Math.round(((i + batch.length) / fileList.length) * 100)
        }
        
        onProgress?.(progress)
      }

      return summaries

    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `文件分析失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 分析特定文件
   */
  async analyzeSpecificFiles(
    filePaths: string[],
    onProgress?: (progress: BuildProgress) => void,
    onFileSummary?: (summary: FileSummary) => Promise<void>
  ): Promise<FileSummary[]> {
    try {
      const summaries: FileSummary[] = []
      
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i]
        const summary = await this.analyzeSingleFile(filePath)
        
        if (summary) {
          // 如果提供了增量保存回调，立即保存文件摘要
          if (onFileSummary) {
            await onFileSummary(summary)
          }
          summaries.push(summary)
        }
        
        onProgress?.({
          phase: 'file_analysis',
          current: i + 1,
          total: filePaths.length,
          message: `分析文件: ${filePath}`,
          percentage: Math.round(((i + 1) / filePaths.length) * 100)
        })
      }
      
      return summaries
      
    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `分析特定文件失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 获取变化的文件 - 基于时间戳的增量构建
   */
  async getChangedFiles(
    workspacePath: string,
    previousFiles: Set<string>
  ): Promise<string[]> {
    try {
      const currentFiles = await this.getFileList(workspacePath)
      const changedFiles: string[] = []
      
      // 检查新增和修改的文件
      for (const file of currentFiles) {
        const fullPath = path.join(workspacePath, file)
        
        try {
          const stats = await fs.stat(fullPath)
          const currentTimestamp = stats.mtimeMs
          
          // 使用存储的shouldReanalyzeFile方法检查是否需要重新分析
          const shouldReanalyze = await this.shouldReanalyzeFileWithStorage(file, currentTimestamp)
          if (shouldReanalyze) {
            changedFiles.push(file)
          }
        } catch (error) {
          // 文件读取失败，跳过
          this.logger.warn(`[FileAnalyzer] 无法读取文件状态: ${file}`, error)
        }
      }
      
      // 检查删除的文件
      const deletedFiles = Array.from(previousFiles).filter(file => !currentFiles.includes(file))
      if (deletedFiles.length > 0) {
        this.logger.warn(`[FileAnalyzer] 检测到 ${deletedFiles.length} 个文件被删除`)
      }
      
      return changedFiles
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `获取变化文件失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 获取文件列表
   */
  private async getFileList(workspacePath: string): Promise<string[]> {
    try {
      // 获取所有文件
      const fileListService = new FileListService()
      const allFiles = await fileListService.getProjectFiles(workspacePath)
      
      // 过滤文件 - allFiles 已经是经过 FileFilter 过滤的绝对路径
      const filteredFiles = []
      
      for (const fullPath of allFiles) {
        // 转换为相对路径
        const relativePath = path.relative(workspacePath, fullPath)
        
        // 检查文件是否可读
        if (!await isFileReadable(fullPath)) {
          continue
        }
        
        // 检查文件大小
        const stats = await fs.stat(fullPath)
        if (stats.size > this.config.maxFileSize) {
          continue
        }
        
        // 检查文件类型
        const fileType = getFileType(relativePath)
        if (fileType === 'other') {
          continue
        }
        
        filteredFiles.push(relativePath)
      }
      
      return filteredFiles
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `获取文件列表失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 分析文件批次
   */
  private async analyzeFileBatch(filePaths: string[], workspacePath: string): Promise<FileSummary[]> {
    try {
      const fileContents: Array<{path: string, content: string}> = []
      
      // 读取文件内容
      for (const filePath of filePaths) {
        const fullPath = path.join(workspacePath, filePath)
        const content = await safeReadFile(fullPath)
        
        if (content) {
          fileContents.push({
            path: filePath,
            content
          })
        }
      }
      
      if (fileContents.length === 0) {
        return []
      }
      
      // 获取项目根信息
      const rootInfo = await this.getRootInfo(workspacePath)
      
      // 构建提示词
      const prompt = buildPrompt(FILE_ANALYSIS_PROMPT, {
        rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : '无项目背景信息',
        fileContents: formatFileContents(fileContents),
        fileList: formatFileList(filePaths)
      })
      
      // 检查是否应该继续（暂停检查）
      if (this.shouldAbortAnalysis()) {
        this.logger.info('[FileAnalyzer] 分析被暂停，跳过LLM请求')
        return []
      }
      
      // 发送LLM请求
      const response = await this.llmClient.sendStructuredRequest<FileSummary[]>(
        prompt,
        this.getFileSummarySchema()
      )
      
      if (!response.success || !response.data) {
        throw new KnowledgeGraphError(
          `文件批次分析失败: ${response.error || '未知错误'}`,
          ERROR_CODES.INVALID_RESPONSE,
          false,
          false
        )
      }
      
      // 验证和清理数据
      return response.data.map(summary => this.validateAndCleanFileSummary(summary))
      
    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `分析文件批次失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 分析单个文件
   */
  private async analyzeSingleFile(filePath: string): Promise<FileSummary | null> {
    try {
      const fullPath = path.join(this.workspacePath, filePath)
      
      // 检查文件是否可读
      if (!await isFileReadable(fullPath)) {
        return null
      }
      
      // 读取文件内容
      const content = await safeReadFile(fullPath)
      if (!content) {
        return null
      }
      
      // 检查是否应该继续（暂停检查）
      if (this.shouldAbortAnalysis()) {
        this.logger.info(`[FileAnalyzer] 分析被暂停，跳过文件: ${filePath}`)
        return null
      }
      
      // 获取项目根信息
      const rootInfo = await this.getRootInfo(this.workspacePath)
      
      // 构建提示词
      const prompt = buildPrompt(FILE_ANALYSIS_PROMPT, {
        rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : '无项目背景信息',
        fileContents: formatFileContents([{path: filePath, content}]),
        fileList: filePath
      })
      
      // 发送LLM请求
      const response = await this.llmClient.sendStructuredRequest<FileSummary>(
        prompt,
        this.getSingleFileSummarySchema()
      )
      
      if (!response.success || !response.data) {
        this.logger.warn(`[FileAnalyzer] 分析文件失败: ${filePath}`, response.error)
        return null
      }
      
      return this.validateAndCleanFileSummary(response.data)
      
    } catch (error) {
      this.logger.warn(`[FileAnalyzer] 分析单个文件失败: ${filePath}`, error)
      return null
    }
  }

  /**
   * 获取项目根信息
   */
  private async getRootInfo(workspacePath: string): Promise<RootInfo | null> {
    try {
      // 这里应该从存储中获取，暂时返回null
      return null
    } catch (error) {
      this.logger.warn('[FileAnalyzer] 获取项目根信息失败:', error)
      return null
    }
  }

  /**
   * 检查是否应该重新分析文件 - 使用存储的时间戳比较
   */
  private async shouldReanalyzeFileWithStorage(filePath: string, currentTimestamp: number): Promise<boolean> {
    try {
      // 如果没有存储实例，默认需要分析
      if (!this.storage) {
        return true
      }
      
      return await this.storage.shouldReanalyzeFile(filePath, currentTimestamp)
    } catch (error) {
      this.logger.warn(`[FileAnalyzer] 检查文件重新分析状态失败: ${filePath}`, error)
      return true
    }
  }

  /**
   * 检查是否应该重新分析文件 - 兼容旧接口
   */
  private async shouldReanalyzeFile(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.workspacePath, filePath)
      const stats = await fs.stat(fullPath)
      return await this.shouldReanalyzeFileWithStorage(filePath, stats.mtimeMs)
    } catch (error) {
      return true
    }
  }

  /**
   * 验证和清理文件摘要
   */
  private validateAndCleanFileSummary(summary: FileSummary): FileSummary {
    const now = new Date().toISOString()
    
    return {
      path: summary.path || '',
      type: this.validateFileType(summary.type),
      description: summary.description || '未提供描述',
      keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 10) : [],
      core_functions: typeof summary.core_functions === 'object' ? summary.core_functions : {},
      dependencies: Array.isArray(summary.dependencies) ? summary.dependencies : [],
      timestamp: summary.timestamp || now,
      size: summary.size || 0,
      lastModified: summary.lastModified || Date.now()
    }
  }

  /**
   * 验证文件类型
   */
  private validateFileType(type: string): 'source' | 'config' | 'document' | 'test' {
    if (['source', 'config', 'document', 'test'].includes(type)) {
      return type as any
    }
    return 'source'
  }

  /**
   * 获取文件摘要模式
   */
  private getFileSummarySchema(): any {
    return {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          type: { 
            type: "string",
            enum: ["source", "config", "document", "test"]
          },
          description: { type: "string" },
          keywords: { 
            type: "array", 
            items: { type: "string" },
            maxItems: 10
          },
          core_functions: { 
            type: "object",
            additionalProperties: { type: "string" }
          },
          dependencies: { 
            type: "array", 
            items: { type: "string" }
          },
          timestamp: { type: "string" },
          size: { type: "number" },
          lastModified: { type: "number" }
        },
        required: ["path", "type", "description", "keywords", "core_functions", "dependencies"]
      }
    }
  }

  /**
   * 获取单个文件摘要模式
   */
  private getSingleFileSummarySchema(): any {
    return {
      type: "object",
      properties: {
        path: { type: "string" },
        type: { 
          type: "string",
          enum: ["source", "config", "document", "test"]
        },
        description: { type: "string" },
        keywords: { 
          type: "array", 
          items: { type: "string" },
          maxItems: 10
        },
        core_functions: { 
          type: "object",
          additionalProperties: { type: "string" }
        },
        dependencies: { 
          type: "array", 
          items: { type: "string" }
        },
        timestamp: { type: "string" },
        size: { type: "number" },
        lastModified: { type: "number" }
      },
      required: ["path", "type", "description", "keywords", "core_functions", "dependencies"]
    }
  }

  /**
   * 设置暂停检查回调
   */
  private pauseChecker?: () => boolean

  /**
   * 设置暂停检查器
   */
  setPauseChecker(checker: () => boolean): void {
    this.pauseChecker = checker
  }

  /**
   * 检查是否应该中止分析（用于暂停功能）
   */
  private shouldAbortAnalysis(): boolean {
    return this.pauseChecker?.() || false
  }
}