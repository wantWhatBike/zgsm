/**
 * 目录分析器 - 分析项目目录
 */

import * as path from "path"
import { LLMClient } from "../llm/LLMClient"
import { DIRECTORY_ANALYSIS_PROMPT, buildPrompt, formatSummaries } from "../llm/PromptTemplates"
import { DirectorySummary, FileSummary, KnowledgeGraphError, BuildProgress } from "../types"
import { ERROR_CODES } from "../constants"
import { createLogger, ILogger } from "../../../utils/logger"

export class DirectoryAnalyzer {
  private llmClient: LLMClient
  private workspacePath: string
  private logger: ILogger

  constructor(llmClient: LLMClient, workspacePath: string) {
    this.llmClient = llmClient
    this.workspacePath = workspacePath
    this.logger = createLogger()
  }

  /**
   * 分析目录 - 支持增量落盘
   */
  async analyzeDirectories(
    fileSummaries: FileSummary[],
    onProgress?: (progress: BuildProgress) => void,
    onDirectorySummary?: (summary: DirectorySummary) => Promise<void>
  ): Promise<DirectorySummary[]> {
    try {
      // 1. 构建目录结构
      const directoryStructure = this.buildDirectoryStructure(fileSummaries)
      const directories = Array.from(directoryStructure.keys()).sort()
      
      onProgress?.({
        phase: 'directory_analysis',
        current: 0,
        total: directories.length,
        message: `开始分析 ${directories.length} 个目录...`,
        percentage: 0
      })

      // 2. 从最深层的目录开始分析
      const summaries: DirectorySummary[] = []
      
      for (let i = 0; i < directories.length; i++) {
        const dirPath = directories[i]
        const dirFiles = directoryStructure.get(dirPath) || []
        
        // 获取子目录摘要
        const subDirSummaries = this.getSubDirectorySummaries(dirPath, summaries)
        
        // 分析目录
        const summary = await this.analyzeDirectory(
          dirPath,
          dirFiles,
          subDirSummaries,
          fileSummaries
        )
        
        if (summary) {
          summaries.push(summary)
          
          // 如果提供了增量保存回调，立即保存目录摘要
          if (onDirectorySummary) {
            try {
              await onDirectorySummary(summary)
              this.logger.info(`[DirectoryAnalyzer] 已保存目录摘要: ${summary.path}`)
            } catch (error) {
              this.logger.error(`[DirectoryAnalyzer] 保存目录摘要失败: ${summary.path}`, error)
            }
          }
        }
        
        onProgress?.({
          phase: 'directory_analysis',
          current: i + 1,
          total: directories.length,
          message: `分析目录: ${dirPath}`,
          percentage: Math.round(((i + 1) / directories.length) * 100)
        })
      }

      return summaries

    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `目录分析失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 分析特定目录 - 支持增量落盘
   */
  async analyzeSpecificDirectories(
    dirPaths: string[],
    allFileSummaries: FileSummary[],
    onProgress?: (progress: BuildProgress) => void,
    onDirectorySummary?: (summary: DirectorySummary) => Promise<void>
  ): Promise<DirectorySummary[]> {
    try {
      const summaries: DirectorySummary[] = []
      
      for (let i = 0; i < dirPaths.length; i++) {
        const dirPath = dirPaths[i]
        
        // 获取目录下的文件摘要
        const dirFiles = allFileSummaries.filter(summary => {
          const fileDir = path.dirname(summary.path)
          return fileDir === dirPath
        })
        
        // 获取子目录摘要
        const subDirSummaries = this.getSubDirectorySummaries(dirPath, summaries)
        
        // 分析目录
        const summary = await this.analyzeDirectory(
          dirPath,
          dirFiles,
          subDirSummaries,
          allFileSummaries
        )
        
        if (summary) {
          summaries.push(summary)
          
          // 如果提供了增量保存回调，立即保存目录摘要
          if (onDirectorySummary) {
            try {
              await onDirectorySummary(summary)
              this.logger.info(`[DirectoryAnalyzer] 已保存目录摘要: ${summary.path}`)
            } catch (error) {
              this.logger.error(`[DirectoryAnalyzer] 保存目录摘要失败: ${summary.path}`, error)
            }
          }
        }
        
        onProgress?.({
          phase: 'directory_analysis',
          current: i + 1,
          total: dirPaths.length,
          message: `分析目录: ${dirPath}`,
          percentage: Math.round(((i + 1) / dirPaths.length) * 100)
        })
      }
      
      return summaries
      
    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `分析特定目录失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 构建目录结构
   */
  private buildDirectoryStructure(fileSummaries: FileSummary[]): Map<string, FileSummary[]> {
    const structure = new Map<string, FileSummary[]>()
    
    for (const summary of fileSummaries) {
      const dirPath = path.dirname(summary.path)
      
      if (!structure.has(dirPath)) {
        structure.set(dirPath, [])
      }
      
      structure.get(dirPath)!.push(summary)
    }
    
    return structure
  }

  /**
   * 获取子目录摘要
   */
  private getSubDirectorySummaries(
    parentPath: string,
    existingSummaries: DirectorySummary[]
  ): DirectorySummary[] {
    return existingSummaries.filter(summary => {
      // 检查是否为子目录
      if (summary.path === parentPath) {
        return false
      }
      
      // 检查是否为直接子目录
      const relativePath = path.relative(parentPath, summary.path)
      return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
    })
  }

  /**
   * 分析单个目录
   */
  private async analyzeDirectory(
    dirPath: string,
    dirFiles: FileSummary[],
    subDirSummaries: DirectorySummary[],
    allFileSummaries: FileSummary[]
  ): Promise<DirectorySummary | null> {
    try {
      if (dirFiles.length === 0 && subDirSummaries.length === 0) {
        return null
      }
      
      // 获取项目根信息（这里简化处理）
      const rootInfo = null
      
      // 构建提示词
      const prompt = buildPrompt(DIRECTORY_ANALYSIS_PROMPT, {
        rootInfo: rootInfo ? JSON.stringify(rootInfo, null, 2) : '无项目背景信息',
        directory: dirPath,
        summaries: this.formatDirectoryInput(dirFiles, subDirSummaries),
        fileList: this.getProjectFileList(allFileSummaries)
      })
      
      // 发送LLM请求
      const response = await this.llmClient.sendStructuredRequest<DirectorySummary>(
        prompt,
        this.getDirectorySummarySchema()
      )
      
      if (!response.success || !response.data) {
        this.logger.warn(`[DirectoryAnalyzer] 分析目录失败: ${dirPath}`, response.error)
        return null
      }
      
      return this.validateAndCleanDirectorySummary(response.data, dirPath)
      
    } catch (error) {
      this.logger.warn(`[DirectoryAnalyzer] 分析目录失败: ${dirPath}`, error)
      return null
    }
  }

  /**
   * 格式化目录输入
   */
  private formatDirectoryInput(
    dirFiles: FileSummary[],
    subDirSummaries: DirectorySummary[]
  ): string {
    const parts: string[] = []
    
    // 添加文件摘要
    if (dirFiles.length > 0) {
      parts.push('目录下的文件摘要:')
      parts.push(formatSummaries(dirFiles))
    }
    
    // 添加子目录摘要
    if (subDirSummaries.length > 0) {
      parts.push('子目录摘要:')
      parts.push(formatSummaries(subDirSummaries))
    }
    
    return parts.join('\n\n')
  }

  /**
   * 获取项目文件列表
   */
  private getProjectFileList(fileSummaries: FileSummary[]): string {
    return fileSummaries.map(summary => summary.path).join('\n')
  }

  /**
   * 验证和清理目录摘要
   */
  private validateAndCleanDirectorySummary(summary: DirectorySummary, dirPath: string): DirectorySummary {
    const now = new Date().toISOString()
    
    return {
      path: summary.path || dirPath,
      type: this.validateDirectoryType(summary.type),
      description: summary.description || '未提供描述',
      keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 10) : [],
      key_files: Array.isArray(summary.key_files) ? summary.key_files.slice(0, 5) : [],
      upstream: Array.isArray(summary.upstream) ? summary.upstream : [],
      downstream: Array.isArray(summary.downstream) ? summary.downstream : [],
      collaboration: summary.collaboration || '',
      timestamp: summary.timestamp || now
    }
  }

  /**
   * 验证目录类型
   */
  private validateDirectoryType(type: string): 'module' | 'utils' | 'config' | 'feature' {
    const validTypes = ['module', 'utils', 'config', 'feature']
    if (validTypes.includes(type)) {
      return type as any
    }
    return 'module'
  }

  /**
   * 获取目录摘要模式
   */
  private getDirectorySummarySchema(): any {
    return {
      type: "object",
      properties: {
        path: { type: "string" },
        type: { 
          type: "string",
          enum: ["module", "utils", "config", "feature"]
        },
        description: { type: "string" },
        keywords: { 
          type: "array", 
          items: { type: "string" },
          maxItems: 10
        },
        key_files: { 
          type: "array", 
          items: { type: "string" },
          maxItems: 5
        },
        upstream: { 
          type: "array", 
          items: { type: "string" }
        },
        downstream: { 
          type: "array", 
          items: { type: "string" }
        },
        collaboration: { type: "string" },
        timestamp: { type: "string" }
      },
      required: ["path", "type", "description", "keywords", "key_files", "upstream", "downstream"]
    }
  }
}