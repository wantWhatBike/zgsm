/**
 * 项目浏览器模式 - 知识图谱的子代理模式
 * 用于动态注入到其他Agent中，提供项目结构查询功能
 */

import { knowledgeGraphManager } from "../KnowledgeGraphManager"
import { SearchResult, FileSummary, DirectorySummary, DependencyRelation, SearchQuery } from "../types"
import { KnowledgeGraphError } from "../errors/KnowledgeGraphError"

export class ProjectExplorerMode {
  private isEnabled: boolean = false

  constructor() {
    // 使用单例的知识图谱管理器
  }

  /**
   * 启用项目浏览器模式
   */
  enable(): void {
    this.isEnabled = true
  }

  /**
   * 禁用项目浏览器模式
   */
  disable(): void {
    this.isEnabled = false
  }

  /**
   * 检查是否启用
   */
  isActive(): boolean {
    return this.isEnabled
  }

  /**
   * 获取项目概览
   */
  async getProjectOverview(): Promise<string|null> {
    if (!this.isEnabled) {
      throw new KnowledgeGraphError('项目浏览器模式未启用', 'MODE_NOT_ENABLED')
    }

    try {
      const rootInfo = await knowledgeGraphManager.getRootInfo()
      if (!rootInfo){
        return null
      }
      let overview = '# 项目概览\n\n'
      
      if (rootInfo) {
        overview += '## 项目定位\n'
        overview += `${rootInfo.project_description}\n\n`
        
        overview += '## 技术栈\n'
        overview += rootInfo.tech_stack.map((tech: string) => `- ${tech}`).join('\n') + '\n\n'
        
        overview += '## 核心模块\n'
        overview += rootInfo.core_modules.map((module: string) => `- ${module}`).join('\n') + '\n\n'
        
        overview += '## 核心依赖\n'
        overview += rootInfo.core_dependencies.map((dep: string) => `- ${dep}`).join('\n') + '\n\n'
      }
      
      return overview
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `获取项目概览失败: ${error instanceof Error ? error.message : String(error)}`,
        'QUERY_FAILED'
      )
    }
  }

  /**
   * 搜索项目结构
   */
  async searchProjectStructure(query: SearchQuery): Promise<string> {
    if (!this.isEnabled) {
      throw new KnowledgeGraphError('项目浏览器模式未启用', 'MODE_NOT_ENABLED')
    }

    try {
      const results = await knowledgeGraphManager.search(query)
      
      if (results.length === 0) {
        return `未找到与 "${query}" 相关的结果。`
      }
      
      let result = `# 搜索结果: "${query}"\n\n`
      result += `找到 ${results.length} 个相关结果：\n\n`
      
      // 按类型分组
      const groupedResults = this.groupSearchResultsByType(results)
      
      for (const [type, items] of groupedResults) {
        result += `## ${this.translateType(type)} (${items.length})\n\n`
        
        for (const item of items.slice(0, 10)) { // 限制显示数量
          result += `### ${item.name}\n`
          result += `- **路径**: ${item.path}\n`
          // TODO: description 字段已删除，暂时不显示
          // result += `- **描述**: ${item.description}\n`
          result += `- **相关度**: ${(item.relevance * 100).toFixed(1)}%\n`
          
          if (item.highlights.length > 0) {
            result += `- **匹配项**: ${item.highlights.join(', ')}\n`
          }
          
          result += '\n'
        }
        
        if (items.length > 10) {
          result += `> 还有 ${items.length - 10} 个结果未显示\n\n`
        }
      }
      
      return result
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `搜索项目结构失败: ${error instanceof Error ? error.message : String(error)}`,
        'SEARCH_FAILED'
      )
    }
  }

  /**
   * 获取文件详情
   */
  async getFileDetails(filePath: string): Promise<string> {
    if (!this.isEnabled) {
      throw new KnowledgeGraphError('项目浏览器模式未启用', 'MODE_NOT_ENABLED')
    }

    try {

      // 这里需要从存储中获取文件详情
      // 使用知识图谱管理器的搜索功能
      const searchResults = await knowledgeGraphManager.search({type: 'exact', filePath: filePath})
      const fileResult = searchResults.find(r => r.type === 'file' && r.path === filePath)
      
      if (!fileResult) {
        return `未找到文件: ${filePath}`
      }
      
      let details = `# 文件详情: ${filePath}\n\n`
      details += `**名称**: ${fileResult.name}\n`
      details += `**路径**: ${fileResult.path}\n`
      // TODO: description 字段已删除，暂时不显示
      // details += `**描述**: ${fileResult.description}\n`
      details += `**相关度**: ${(fileResult.relevance * 100).toFixed(1)}%\n`
      
      if (fileResult.highlights.length > 0) {
        details += `**匹配项**: ${fileResult.highlights.join(', ')}\n`
      }
      
      // 获取依赖关系
      const dependencies = await this.getFileDependencies(filePath)
      if (dependencies.length > 0) {
        details += '\n## 依赖关系\n\n'
        details += '### 依赖的文件\n'
        dependencies.forEach(dep => {
          details += `- ${dep.to} (${dep.type}, 强度: ${dep.strength})\n`
        })
      }
      
      return details
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `获取文件详情失败: ${error instanceof Error ? error.message : String(error)}`,
        'QUERY_FAILED'
      )
    }
  }

  /**
   * 获取技术栈信息
   */
  async getTechStack(): Promise<string|null> {
    if (!this.isEnabled) {
      throw new KnowledgeGraphError('项目浏览器模式未启用', 'MODE_NOT_ENABLED')
    }

    try {
      const rootInfo = await knowledgeGraphManager.getRootInfo()
      if(!rootInfo) {
        return null
      }
      
      let techStack = '# 技术栈分析\n\n'
      
      techStack += '## 主要技术\n'
      rootInfo.tech_stack.forEach((tech: string) => {
        techStack += `- ${tech}\n`
      })
      
      techStack += '\n## 核心依赖\n'
      rootInfo.core_dependencies.forEach((dep: string) => {
        techStack += `- ${dep}\n`
      })
      
      techStack += '\n## 环境要求\n'
      rootInfo.environment_requirements.forEach((req: string) => {
        techStack += `- ${req}\n`
      })
      
      if (rootInfo.build_steps.length > 0) {
        techStack += '\n## 构建步骤\n'
        rootInfo.build_steps.forEach((step: string, index: number) => {
          techStack += `${index + 1}. ${step}\n`
        })
      }
      
      return techStack
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `获取技术栈信息失败: ${error instanceof Error ? error.message : String(error)}`,
        'QUERY_FAILED'
      )
    }
  }
  
  /**
   * 辅助方法：按类型分组搜索结果
   */
  private groupSearchResultsByType(results: SearchResult[]): Map<string, SearchResult[]> {
    const grouped = new Map<string, SearchResult[]>()
    
    for (const result of results) {
      if (!grouped.has(result.type)) {
        grouped.set(result.type, [])
      }
      grouped.get(result.type)!.push(result)
    }
    
    return grouped
  }

  /**
   * 辅助方法：翻译类型名称
   */
  private translateType(type: string): string {
    const typeMap: Record<string, string> = {
      'file': '文件',
      'directory': '目录',
      'function': '函数',
      'dependency': '依赖'
    }
    
    return typeMap[type] || type
  }

  /**
   * 辅助方法：翻译阶段名称
   */
  private translatePhase(phase: string): string {
    const phaseMap: Record<string, string> = {
      'root_analysis': '根目录分析',
      'directory_file_analysis': '目录文件分析',
      'dependency_analysis': '依赖分析',
      'completed': '已完成'
    }
    
    return phaseMap[phase] || phase
  }

  /**
   * 辅助方法：获取文件依赖关系
   */
  private async getFileDependencies(filePath: string): Promise<DependencyRelation[]> {
    // 这里需要通过某种方式获取依赖关系
    // 使用知识图谱管理器的搜索功能，返回空数组作为后备方案
    // 在实际实现中，应该通过存储接口获取
    return []
  }

  /**
   * 获取模式信息
   */
  getModeInfo(): string {
    return `
# 项目浏览器模式

项目浏览器模式是知识图谱的子代理模式，提供以下功能：

## 核心功能
- **项目概览**: 获取项目整体信息、技术栈、核心模块等
- **结构搜索**: 搜索项目中的文件、目录、函数等
- **详情查看**: 查看文件和目录的详细信息
- **依赖分析**: 分析项目依赖关系
- **技术栈分析**: 分析项目使用的技术栈
- **探索报告**: 生成完整的项目探索报告

## 使用方法
1. 启用模式: \`projectExplorer.enable()\`
2. 执行查询: \`projectExplorer.searchProjectStructure("关键词")\`
3. 获取详情: \`projectExplorer.getFileDetails("文件路径")\`

## 注意事项
- 需要先构建知识图谱才能使用
- 模式启用后才会响应查询请求
- 所有查询都会返回格式化的Markdown文本
`
  }
}