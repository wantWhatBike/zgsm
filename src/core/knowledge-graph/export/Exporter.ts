/**
 * 导出器 - 提供知识图谱数据导出功能
 */

import { FileStorage } from "../storage/FileStorage"
import {
  FileSummary,
  DirectorySummary,
  DependencyRelation,
  ExportFormat,
  ExportOptions,
  ExportResult
} from "../types"
import { EXPORT_CONFIG, ERROR_CODES } from "../constants"
import { KnowledgeGraphError } from "../errors/KnowledgeGraphError"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import * as fs from "fs/promises"
import * as path from "path"
import { createWriteStream } from "fs"
import { createLogger, ILogger } from "../../../utils/logger"
import { IStorage } from "../storage/StorageInterface"

export class Exporter {
  private storage: IStorage
  private logger: ILogger

  constructor(storage: IStorage, logger:ILogger) {
    this.storage = storage
    this.logger = logger
  }

  /**
   * 导出知识图谱数据
   */
  async export(options: ExportOptions): Promise<ExportResult> {
    try {
      const { format, outputPath, includeMetadata = true } = options
      
      // 获取数据
      const fileSummaries = await this.storage.getAllFileSummaries()
      const directorySummaries = await this.storage.getAllDirectorySummaries()
      const dependencyRelations = await this.storage.getDependencyRelations()
      
      // 根据格式导出
      let result: ExportResult
      
      switch (format) {
        case 'json':
          result = await this.exportToJson(
            fileSummaries, 
            directorySummaries, 
            dependencyRelations, 
            outputPath, 
            includeMetadata
          )
          break
          
        case 'jsonl':
          result = await this.exportToJsonl(
            fileSummaries, 
            directorySummaries, 
            dependencyRelations, 
            outputPath, 
            includeMetadata
          )
          break
          
        case 'markdown':
          result = await this.exportToMarkdown(
            fileSummaries, 
            directorySummaries, 
            dependencyRelations, 
            outputPath, 
            includeMetadata
          )
          break
          
        default:
          throw new KnowledgeGraphError(
            `不支持的导出格式: ${format}`,
            ERROR_CODES.INVALID_RESPONSE,
            false,
            false
          )
      }
      
      return result
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `导出失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.STORAGE_ERROR,
        false,
        true
      )
    }
  }

  /**
   * 导出为JSON格式
   */
  private async exportToJson(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[],
    dependencyRelations: DependencyRelation[],
    outputPath: string,
    includeMetadata: boolean
  ): Promise<ExportResult> {
    const data = {
      metadata: includeMetadata ? this.createMetadata() : undefined,
      files: fileSummaries,
      directories: directorySummaries,
      dependencies: dependencyRelations,
      summary: {
        totalFiles: fileSummaries.length,
        totalDirectories: directorySummaries.length,
        totalDependencies: dependencyRelations.length,
        exportTime: new Date().toISOString()
      }
    }
    
    await safeWriteJson(outputPath, data)
    
    return {
      format: 'json',
      outputPath,
      size: (await fs.stat(outputPath)).size,
      recordCount: fileSummaries.length + directorySummaries.length + dependencyRelations.length,
      exportTime: new Date().toISOString()
    }
  }

  /**
   * 导出为JSONL格式
   */
  private async exportToJsonl(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[],
    dependencyRelations: DependencyRelation[],
    outputPath: string,
    includeMetadata: boolean
  ): Promise<ExportResult> {
    const writeStream = createWriteStream(outputPath, { encoding: 'utf8' })
    let recordCount = 0
    
    try {
      // 写入元数据
      if (includeMetadata) {
        writeStream.write(JSON.stringify({ type: 'metadata', data: this.createMetadata() }) + '\n')
        recordCount++
      }
      
      // 写入文件摘要
      for (const summary of fileSummaries) {
        writeStream.write(JSON.stringify({ type: 'file', data: summary }) + '\n')
        recordCount++
        
        // 批量写入，避免内存问题
        if (recordCount % EXPORT_CONFIG.jsonl.batchSize === 0) {
          await this.flushStream(writeStream)
        }
      }
      
      // 写入目录摘要
      for (const summary of directorySummaries) {
        writeStream.write(JSON.stringify({ type: 'directory', data: summary }) + '\n')
        recordCount++
        
        if (recordCount % EXPORT_CONFIG.jsonl.batchSize === 0) {
          await this.flushStream(writeStream)
        }
      }
      
      // 写入依赖关系
      for (const relation of dependencyRelations) {
        writeStream.write(JSON.stringify({ type: 'dependency', data: relation }) + '\n')
        recordCount++
        
        if (recordCount % EXPORT_CONFIG.jsonl.batchSize === 0) {
          await this.flushStream(writeStream)
        }
      }
      
      // 写入统计信息
      writeStream.write(JSON.stringify({
        type: 'summary',
        data: {
          totalFiles: fileSummaries.length,
          totalDirectories: directorySummaries.length,
          totalDependencies: dependencyRelations.length,
          exportTime: new Date().toISOString()
        }
      }) + '\n')
      recordCount++
      
      // 结束写入
      writeStream.end()
      
      // 等待写入完成
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })
      
      return {
        format: 'jsonl',
        outputPath,
        size: (await fs.stat(outputPath)).size,
        recordCount,
        exportTime: new Date().toISOString()
      }
      
    } catch (error) {
      writeStream.destroy()
      throw error
    }
  }

  /**
   * 导出为Markdown格式
   */
  private async exportToMarkdown(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[],
    dependencyRelations: DependencyRelation[],
    outputPath: string,
    includeMetadata: boolean
  ): Promise<ExportResult> {
    const content = this.generateMarkdownContent(
      fileSummaries,
      directorySummaries,
      dependencyRelations,
      includeMetadata
    )
    
    await fs.writeFile(outputPath, content, 'utf8')
    
    return {
      format: 'markdown',
      outputPath,
      size: (await fs.stat(outputPath)).size,
      recordCount: fileSummaries.length + directorySummaries.length + dependencyRelations.length,
      exportTime: new Date().toISOString()
    }
  }

  /**
   * 创建元数据
   */
  private createMetadata(): any {
    return {
      version: '1.0.0',
      generator: 'CoStrict Knowledge Graph',
      exportTime: new Date().toISOString(),
      format: 'knowledge-graph-v1'
    }
  }

  /**
   * 生成Markdown内容
   */
  private generateMarkdownContent(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[],
    dependencyRelations: DependencyRelation[],
    includeMetadata: boolean
  ): string {
    let content = '# 知识图谱报告\n\n'
    
    if (includeMetadata) {
      content += '## 元数据\n\n'
      content += '```json\n'
      content += JSON.stringify(this.createMetadata(), null, 2)
      content += '\n```\n\n'
    }
    
    // 统计信息
    content += '## 统计信息\n\n'
    content += `- 文件总数: ${fileSummaries.length}\n`
    content += `- 目录总数: ${directorySummaries.length}\n`
    content += `- 依赖关系总数: ${dependencyRelations.length}\n`
    content += `- 导出时间: ${new Date().toISOString()}\n\n`
    
    // 目录结构
    content += '## 目录结构\n\n'
    content += this.generateDirectoryTree(fileSummaries, directorySummaries)
    content += '\n\n'
    
    // 文件摘要
    content += '## 文件摘要\n\n'
    for (const summary of fileSummaries.slice(0, 50)) { // 限制数量
      content += `### ${summary.path}\n\n`
      content += `- **类型**: ${summary.type}\n`
      content += `- **关键词**: ${summary.keywords.join(', ')}\n`
      content += `- **描述**: ${summary.description}\n\n`
      
      if (Object.keys(summary.core_functions).length > 0) {
        content += '**核心函数**:\n'
        for (const [funcName, funcDesc] of Object.entries(summary.core_functions)) {
          content += `- ${funcName}: ${funcDesc}\n`
        }
        content += '\n'
      }
    }
    
    if (fileSummaries.length > 50) {
      content += `> 注：仅显示前50个文件，共${fileSummaries.length}个文件\n\n`
    }
    
    // 目录摘要
    content += '## 目录摘要\n\n'
    for (const summary of directorySummaries.slice(0, 20)) { // 限制数量
      content += `### ${summary.path}\n\n`
      content += `- **类型**: ${summary.type}\n`
      content += `- **关键词**: ${summary.keywords.join(', ')}\n`
      content += `- **描述**: ${summary.description}\n`
      
      if (summary.key_files.length > 0) {
        content += `- **核心文件**: ${summary.key_files.join(', ')}\n`
      }
      
      if (summary.upstream.length > 0) {
        content += `- **上游依赖**: ${summary.upstream.join(', ')}\n`
      }
      
      if (summary.downstream.length > 0) {
        content += `- **下游依赖**: ${summary.downstream.join(', ')}\n`
      }
      
      if (summary.collaboration) {
        content += `- **协作关系**: ${summary.collaboration}\n`
      }
      
      content += '\n'
    }
    
    if (directorySummaries.length > 20) {
      content += `> 注：仅显示前20个目录，共${directorySummaries.length}个目录\n\n`
    }
    
    // 依赖关系
    if (dependencyRelations.length > 0) {
      content += '## 依赖关系\n\n'
      content += '| 源 | 目标 | 类型 | 强度 | 描述 |\n'
      content += '|----|------|------|------|------|\n'
      
      for (const relation of dependencyRelations.slice(0, 30)) {
        content += `| ${relation.from} | ${relation.to} | ${relation.type} | ${relation.strength} | |\n`
      }
      
      if (dependencyRelations.length > 30) {
        content += `\n> 注：仅显示前30个依赖关系，共${dependencyRelations.length}个依赖关系\n\n`
      }
    }
    
    return content
  }

  /**
   * 生成目录树
   */
  private generateDirectoryTree(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[]
  ): string {
    // 构建文件树
    const fileTree = this.buildFileTree(fileSummaries)
    
    // 生成树形字符串
    return this.generateTreeString(fileTree, '', true)
  }

  /**
   * 构建文件树
   */
  private buildFileTree(fileSummaries: FileSummary[]): FileTreeNode {
    const root: FileTreeNode = {
      name: '项目根目录',
      path: '',
      type: 'directory',
      children: new Map()
    }
    
    for (const summary of fileSummaries) {
      const parts = summary.path.split('/').filter(p => p.length > 0)
      this.addToTree(root, parts, summary)
    }
    
    return root
  }

  /**
   * 添加到树
   */
  private addToTree(node: FileTreeNode, parts: string[], summary: FileSummary): void {
    if (parts.length === 0) return
    
    const [current, ...rest] = parts
    
    if (!node.children.has(current)) {
      node.children.set(current, {
        name: current,
        path: node.path ? `${node.path}/${current}` : current,
        type: rest.length > 0 ? 'directory' : 'file',
        children: new Map()
      })
    }
    
    const child = node.children.get(current)!
    
    if (rest.length > 0) {
      this.addToTree(child, rest, summary)
    }
  }

  /**
   * 生成树形字符串
   */
  private generateTreeString(node: FileTreeNode, prefix: string, isLast: boolean): string {
    let result = ''
    
    if (node.path) {
      const connector = isLast ? '└── ' : '├── '
      result += prefix + connector + node.name + '\n'
    }
    
    const children = Array.from(node.children.values())
    const childPrefix = prefix + (isLast ? '    ' : '│   ')
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const isLastChild = i === children.length - 1
      result += this.generateTreeString(child, childPrefix, isLastChild)
    }
    
    return result
  }

  /**
   * 生成索引内容
   */
  private generateIndexContent(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[],
    dependencyRelations: DependencyRelation[]
  ): string {
    let content = '# 知识图谱索引\n\n'
    
    content += '## 文件列表\n\n'
    for (const summary of fileSummaries) {
      content += `- [${summary.path}](#file-${this.escapeAnchor(summary.path)})\n`
    }
    
    content += '\n## 目录列表\n\n'
    for (const summary of directorySummaries) {
      content += `- [${summary.path}](#dir-${this.escapeAnchor(summary.path)})\n`
    }
    
    content += '\n## 详细内容\n\n'
    
    // 文件详情
    for (const summary of fileSummaries) {
      content += `### ${summary.path} {#file-${this.escapeAnchor(summary.path)}}\n\n`
      content += `${summary.description}\n\n`
    }
    
    // 目录详情
    for (const summary of directorySummaries) {
      content += `### ${summary.path} {#dir-${this.escapeAnchor(summary.path)}}\n\n`
      content += `${summary.description}\n\n`
    }
    
    return content
  }

  /**
   * 生成JSONL内容
   */
  private generateJsonlContent(items: any[]): string {
    return items.map(item => JSON.stringify(item)).join('\n')
  }

  /**
   * 刷新流
   */
  private async flushStream(stream: NodeJS.WritableStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.write('', (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  /**
   * 转义锚点
   */
  private escapeAnchor(text: string): string {
    return text.replace(/[^a-zA-Z0-9]/g, '-')
  }
}

/**
 * 文件树节点
 */
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children: Map<string, FileTreeNode>
}