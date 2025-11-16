/**
 * 依赖关系分析器 - 分析项目依赖关系
 */

import { LLMClient } from "../llm/LLMClient"
import { DEPENDENCY_ANALYSIS_PROMPT, buildPrompt } from "../llm/PromptTemplates"
import { DependencyRelation, FileSummary, DirectorySummary, KnowledgeGraphError, KnowledgeGraphConfig } from "../types"
import { ERROR_CODES } from "../constants"
import { createLogger, ILogger } from "../../../utils/logger"

export class DependencyAnalyzer {
  private llmClient: LLMClient
  private logger: ILogger
  private config: KnowledgeGraphConfig
  private workspacePath: string

  constructor(llmClient: LLMClient, workspacePath: string, config: KnowledgeGraphConfig) {
    this.llmClient = llmClient
    this.logger = createLogger()
    this.config = config
    this.workspacePath = workspacePath
  }

  /**
   * 分析依赖关系
   */
  async analyzeDependencies(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[]
  ): Promise<DependencyRelation[]> {
    try {
      const allRelations: DependencyRelation[] = []
      
      // 1. 从文件摘要中提取依赖关系
      const fileRelations = this.extractFileDependencies(fileSummaries)
      allRelations.push(...fileRelations)
      
      // 2. 从目录摘要中提取依赖关系
      const directoryRelations = this.extractDirectoryDependencies(directorySummaries)
      allRelations.push(...directoryRelations)
      
      // 3. 使用LLM分析复杂的依赖关系
      if (fileSummaries.length > 0 && directorySummaries.length > 0) {
        const complexRelations = await this.analyzeComplexDependencies(
          fileSummaries,
          directorySummaries
        )
        allRelations.push(...complexRelations)
      }
      
      // 4. 去重和合并
      const uniqueRelations = this.deduplicateRelations(allRelations)
      
      return uniqueRelations
      
    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `依赖关系分析失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 分析特定依赖关系
   */
  async analyzeSpecificDependencies(
    updatedFileSummaries: FileSummary[],
    updatedDirectorySummaries: DirectorySummary[]
  ): Promise<DependencyRelation[]> {
    try {
      const relations: DependencyRelation[] = []
      
      // 分析更新的文件
      for (const summary of updatedFileSummaries) {
        const fileRelations = this.extractFileDependencies([summary])
        relations.push(...fileRelations)
      }
      
      // 分析更新的目录
      for (const summary of updatedDirectorySummaries) {
        const dirRelations = this.extractDirectoryDependencies([summary])
        relations.push(...dirRelations)
      }
      
      // 分析复杂的交叉依赖
      if (updatedFileSummaries.length > 0 && updatedDirectorySummaries.length > 0) {
        const complexRelations = await this.analyzeComplexDependencies(
          updatedFileSummaries,
          updatedDirectorySummaries
        )
        relations.push(...complexRelations)
      }
      
      return this.deduplicateRelations(relations)
      
    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `分析特定依赖关系失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 从文件摘要中提取依赖关系
   */
  private extractFileDependencies(fileSummaries: FileSummary[]): DependencyRelation[] {
    const relations: DependencyRelation[] = []
    const now = new Date().toISOString()
    
    for (const summary of fileSummaries) {
      if (!summary.dependencies || summary.dependencies.length === 0) {
        continue
      }
      
      for (const dependency of summary.dependencies) {
        // 计算依赖强度
        const strength = this.calculateDependencyStrength(summary, dependency)
        
        relations.push({
          from: summary.path,
          to: dependency,
          type: this.inferDependencyType(summary, dependency),
          strength,
          timestamp: now
        })
      }
    }
    
    return relations
  }

  /**
   * 从目录摘要中提取依赖关系
   */
  private extractDirectoryDependencies(directorySummaries: DirectorySummary[]): DependencyRelation[] {
    const relations: DependencyRelation[] = []
    const now = new Date().toISOString()
    
    for (const summary of directorySummaries) {
      // 添加上游依赖
      if (summary.upstream && summary.upstream.length > 0) {
        for (const upstream of summary.upstream) {
          relations.push({
            from: upstream,
            to: summary.path,
            type: 'reference',
            strength: 0.7,
            timestamp: now
          })
        }
      }
      
      // 添加下游依赖
      if (summary.downstream && summary.downstream.length > 0) {
        for (const downstream of summary.downstream) {
          relations.push({
            from: summary.path,
            to: downstream,
            type: 'reference',
            strength: 0.7,
            timestamp: now
          })
        }
      }
    }
    
    return relations
  }

  /**
   * 分析复杂的依赖关系
   */
  private async analyzeComplexDependencies(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[]
  ): Promise<DependencyRelation[]> {
    try {
      // 构建提示词
      const prompt = buildPrompt(DEPENDENCY_ANALYSIS_PROMPT, {
        rootInfo: '项目背景信息已提供',
        fileSummaries: JSON.stringify(fileSummaries.slice(0, 50), null, 2), // 限制数量
        directorySummaries: JSON.stringify(directorySummaries.slice(0, 20), null, 2) // 限制数量
      })
      
      // 发送LLM请求
      const response = await this.llmClient.sendStructuredRequest<DependencyRelation[]>(
        prompt,
        this.getDependencyRelationSchema()
      )
      
      if (!response.success || !response.data) {
        this.logger.warn('[DependencyAnalyzer] 复杂依赖关系分析失败:', response.error)
        return []
      }
      
      // 验证和清理数据
      return response.data.filter(relation => this.validateDependencyRelation(relation))
      
    } catch (error) {
      this.logger.warn('[DependencyAnalyzer] 分析复杂依赖关系失败:', error)
      return []
    }
  }

  /**
   * 计算依赖强度
   */
  private calculateDependencyStrength(from: FileSummary, to: string): number {
    let strength = 0.5 // 基础强度
    
    // 根据文件类型调整强度
    if (from.type === 'source') {
      strength += 0.2
    }
    
    // 根据依赖数量调整强度
    if (from.dependencies && from.dependencies.length > 0) {
      const dependencyCount = from.dependencies.length
      if (dependencyCount <= 3) {
        strength += 0.2 // 依赖较少，重要性高
      } else if (dependencyCount > 10) {
        strength -= 0.1 // 依赖过多，强度降低
      }
    }
    
    // 根据文件复杂度调整强度
    if (from.core_functions && Object.keys(from.core_functions).length > 5) {
      strength += 0.1
    }
    
    // 确保强度在合理范围内
    return Math.max(0.1, Math.min(1.0, strength))
  }

  /**
   * 推断依赖类型
   */
  private inferDependencyType(from: FileSummary, to: string): DependencyRelation['type'] {
    const fromExt = this.getFileExtension(from.path)
    const toExt = this.getFileExtension(to)
    
    // 同类型文件之间的依赖通常是import
    if (fromExt === toExt) {
      return 'import'
    }
    
    // 不同类型文件之间的依赖通常是reference
    return 'reference'
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filePath: string): string {
    const parts = filePath.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
  }

  /**
   * 验证依赖关系
   */
  private validateDependencyRelation(relation: DependencyRelation): boolean {
    return !!(
      relation.from &&
      relation.to &&
      relation.from !== relation.to && // 避免自依赖
      relation.type &&
      typeof relation.strength === 'number' &&
      relation.strength >= 0 && relation.strength <= 1 &&
      relation.timestamp
    )
  }

  /**
   * 去重依赖关系
   */
  private deduplicateRelations(relations: DependencyRelation[]): DependencyRelation[] {
    const seen = new Set<string>()
    const unique: DependencyRelation[] = []
    
    for (const relation of relations) {
      const key = `${relation.from}→${relation.to}:${relation.type}`
      
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(relation)
      }
    }
    
    return unique
  }

  /**
   * 获取依赖关系模式
   */
  private getDependencyRelationSchema(): any {
    return {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: { 
            type: "string",
            enum: ["import", "reference", "inheritance", "composition"]
          },
          strength: { 
            type: "number",
            minimum: 0,
            maximum: 1
          },
          timestamp: { type: "string" }
        },
        required: ["from", "to", "type", "strength", "timestamp"]
      }
    }
  }

  /**
   * 获取依赖关系图
   */
  async getDependencyGraph(): Promise<{
    nodes: Array<{id: string, type: string, label: string}>,
    edges: Array<{from: string, to: string, type: string, strength: number}>
  }> {
    try {
      // 这里应该从存储中获取依赖关系
      // 暂时返回空图
      return {
        nodes: [],
        edges: []
      }
    } catch (error) {
      throw new KnowledgeGraphError(
        `获取依赖关系图失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 分析依赖循环
   */
  async detectCircularDependencies(): Promise<string[][]> {
    try {
      // 这里应该实现循环检测算法
      // 暂时返回空结果
      return []
    } catch (error) {
      throw new KnowledgeGraphError(
        `检测依赖循环失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 获取关键路径
   */
  async getCriticalPaths(): Promise<string[][]> {
    try {
      // 这里应该实现关键路径分析
      // 暂时返回空结果
      return []
    } catch (error) {
      throw new KnowledgeGraphError(
        `获取关键路径失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }
}