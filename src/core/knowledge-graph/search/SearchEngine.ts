/**
 * 搜索引擎 - 提供知识图谱搜索功能
 */

import { FileStorage } from "../storage/FileStorage"
import { SearchResult, FileSummary, DirectorySummary, DependencyRelation } from "../types"
import { ERROR_CODES } from "../constants"
import { KnowledgeGraphError } from "../errors/KnowledgeGraphError"
import { createLogger, ILogger } from "../../../utils/logger"

export class SearchEngine {
  private storage: FileStorage
  private logger: ILogger
  private index: SearchIndex = {
    files: new Map(),
    directories: new Map(),
    keywords: new Map(),
    functions: new Map()
  }

  constructor(storage: FileStorage) {
    this.storage = storage
    this.logger = createLogger()
  }

  /**
   * 构建搜索索引
   */
  async buildIndex(
    fileSummaries: FileSummary[],
    directorySummaries: DirectorySummary[]
  ): Promise<void> {
    try {
      // 清空现有索引
      this.clearIndex()
      
      // 构建文件索引
      for (const summary of fileSummaries) {
        this.indexFile(summary)
      }
      
      // 构建目录索引
      for (const summary of directorySummaries) {
        this.indexDirectory(summary)
      }
      
      // 构建关键词索引
      this.buildKeywordIndex()
      
      // 构建函数索引
      this.buildFunctionIndex()
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `构建搜索索引失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 更新搜索索引
   */
  async updateIndex(
    updatedFileSummaries: FileSummary[],
    updatedDirectorySummaries: DirectorySummary[]
  ): Promise<void> {
    try {
      // 移除旧的索引项
      for (const summary of updatedFileSummaries) {
        this.removeFileFromIndex(summary.path)
      }
      
      for (const summary of updatedDirectorySummaries) {
        this.removeDirectoryFromIndex(summary.path)
      }
      
      // 添加新的索引项
      for (const summary of updatedFileSummaries) {
        this.indexFile(summary)
      }
      
      for (const summary of updatedDirectorySummaries) {
        this.indexDirectory(summary)
      }
      
      // 重新构建关键词和函数索引
      this.buildKeywordIndex()
      this.buildFunctionIndex()
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `更新搜索索引失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 搜索知识图谱
   */
  async search(query: string): Promise<SearchResult[]> {
    try {
      if (!query || query.trim().length === 0) {
        return []
      }
      
      const searchQuery = this.parseQuery(query)
      const results: SearchResult[] = []
      
      // 执行不同类型的搜索
      if (searchQuery.type === 'exact') {
        results.push(...this.exactSearch(searchQuery.terms))
      } else if (searchQuery.type === 'fuzzy') {
        results.push(...this.fuzzySearch(searchQuery.terms))
      } else {
        results.push(...this.combinedSearch(searchQuery.terms))
      }
      
      // 排序和去重
      const sortedResults = this.sortAndDeduplicateResults(results)
      
      return sortedResults.slice(0, 50) // 限制结果数量
      
    } catch (error) {
      throw new KnowledgeGraphError(
        `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 精确搜索
   */
  private exactSearch(terms: string[]): SearchResult[] {
    const results: SearchResult[] = []
    
    for (const term of terms) {
      const lowerTerm = term.toLowerCase()
      
      // 搜索文件
      for (const [filePath, summary] of this.index.files) {
        if (this.fileMatchesTerm(summary, lowerTerm)) {
          results.push(this.createFileSearchResult(summary, lowerTerm))
        }
      }
      
      // 搜索目录
      for (const [dirPath, summary] of this.index.directories) {
        if (this.directoryMatchesTerm(summary, lowerTerm)) {
          results.push(this.createDirectorySearchResult(summary, lowerTerm))
        }
      }
      
      // 搜索函数
      for (const [funcName, funcInfo] of this.index.functions) {
        if (funcName.toLowerCase().includes(lowerTerm)) {
          results.push(this.createFunctionSearchResult(funcInfo, lowerTerm))
        }
      }
    }
    
    return results
  }

  /**
   * 模糊搜索
   */
  private fuzzySearch(terms: string[]): SearchResult[] {
    const results: SearchResult[] = []
    
    for (const term of terms) {
      const lowerTerm = term.toLowerCase()
      
      // 搜索关键词索引
      for (const [keyword, items] of this.index.keywords) {
        if (keyword.includes(lowerTerm) || this.calculateSimilarity(keyword, lowerTerm) > 0.7) {
          for (const item of items) {
            results.push(this.createKeywordSearchResult(item, keyword, lowerTerm))
          }
        }
      }
      
      // 模糊匹配文件路径
      for (const [filePath, summary] of this.index.files) {
        if (filePath.toLowerCase().includes(lowerTerm)) {
          results.push(this.createFileSearchResult(summary, lowerTerm))
        }
      }
    }
    
    return results
  }

  /**
   * 组合搜索
   */
  private combinedSearch(terms: string[]): SearchResult[] {
    const results: SearchResult[] = []
    
    // 组合精确搜索和模糊搜索
    results.push(...this.exactSearch(terms))
    results.push(...this.fuzzySearch(terms))
    
    return results
  }

  /**
   * 索引文件
   */
  private indexFile(summary: FileSummary): void {
    this.index.files.set(summary.path, summary)
    
    // 索引关键词
    for (const keyword of summary.keywords) {
      this.addToKeywordIndex(keyword, {
        type: 'file',
        path: summary.path,
        name: this.getFileName(summary.path),
        description: summary.description
      })
    }
    
    // 索引函数
    for (const [funcName, funcDesc] of Object.entries(summary.core_functions)) {
      this.index.functions.set(funcName, {
        name: funcName,
        description: funcDesc,
        filePath: summary.path,
        type: 'function'
      })
    }
  }

  /**
   * 索引目录
   */
  private indexDirectory(summary: DirectorySummary): void {
    this.index.directories.set(summary.path, summary)
    
    // 索引关键词
    for (const keyword of summary.keywords) {
      this.addToKeywordIndex(keyword, {
        type: 'directory',
        path: summary.path,
        name: this.getDirectoryName(summary.path),
        description: summary.description
      })
    }
  }

  /**
   * 添加到关键词索引
   */
  private addToKeywordIndex(keyword: string, item: KeywordIndexItem): void {
    const lowerKeyword = keyword.toLowerCase()
    
    if (!this.index.keywords.has(lowerKeyword)) {
      this.index.keywords.set(lowerKeyword, [])
    }
    
    this.index.keywords.get(lowerKeyword)!.push(item)
  }

  /**
   * 构建关键词索引
   */
  private buildKeywordIndex(): void {
    // 关键词索引已经在索引文件和目录时构建
  }

  /**
   * 构建函数索引
   */
  private buildFunctionIndex(): void {
    // 函数索引已经在索引文件时构建
  }

  /**
   * 从索引中移除文件
   */
  private removeFileFromIndex(filePath: string): void {
    const summary = this.index.files.get(filePath)
    if (!summary) return
    
    // 从文件索引中移除
    this.index.files.delete(filePath)
    
    // 从关键词索引中移除
    for (const keyword of summary.keywords) {
      this.removeFromKeywordIndex(keyword, filePath)
    }
    
    // 从函数索引中移除
    for (const funcName of Object.keys(summary.core_functions)) {
      this.index.functions.delete(funcName)
    }
  }

  /**
   * 从索引中移除目录
   */
  private removeDirectoryFromIndex(dirPath: string): void {
    const summary = this.index.directories.get(dirPath)
    if (!summary) return
    
    // 从目录索引中移除
    this.index.directories.delete(dirPath)
    
    // 从关键词索引中移除
    for (const keyword of summary.keywords) {
      this.removeFromKeywordIndex(keyword, dirPath)
    }
  }

  /**
   * 从关键词索引中移除
   */
  private removeFromKeywordIndex(keyword: string, path: string): void {
    const lowerKeyword = keyword.toLowerCase()
    const items = this.index.keywords.get(lowerKeyword)
    
    if (items) {
      const filtered = items.filter(item => item.path !== path)
      if (filtered.length > 0) {
        this.index.keywords.set(lowerKeyword, filtered)
      } else {
        this.index.keywords.delete(lowerKeyword)
      }
    }
  }

  /**
   * 清空索引
   */
  private clearIndex(): void {
    this.index = {
      files: new Map(),
      directories: new Map(),
      keywords: new Map(),
      functions: new Map()
    }
  }

  /**
   * 解析搜索查询
   */
  private parseQuery(query: string): SearchQuery {
    const trimmed = query.trim()
    
    // 检查是否为精确搜索（包含引号）
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return {
        type: 'exact',
        terms: [trimmed.slice(1, -1)]
      }
    }
    
    // 检查是否为模糊搜索（包含通配符）
    if (trimmed.includes('*') || trimmed.includes('?')) {
      return {
        type: 'fuzzy',
        terms: this.tokenizeQuery(trimmed)
      }
    }
    
    // 默认组合搜索
    return {
      type: 'combined',
      terms: this.tokenizeQuery(trimmed)
    }
  }

  /**
   * 分词查询
   */
  private tokenizeQuery(query: string): string[] {
    // 简单的分词实现
    return query
      .toLowerCase()
      .split(/[\s,\.;\:\(\)\[\]\{\}]+/)
      .filter(term => term.length > 1)
      .map(term => term.replace(/[*?]/g, ''))
  }

  /**
   * 计算相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    if (longer.length === 0) return 1.0
    
    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  /**
   * 计算Levenshtein距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = []
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    
    return matrix[str2.length][str1.length]
  }

  /**
   * 检查文件是否匹配搜索词
   */
  private fileMatchesTerm(summary: FileSummary, term: string): boolean {
    return (
      summary.path.toLowerCase().includes(term) ||
      summary.description.toLowerCase().includes(term) ||
      summary.keywords.some(keyword => keyword.toLowerCase().includes(term)) ||
      Object.keys(summary.core_functions).some(func => func.toLowerCase().includes(term))
    )
  }

  /**
   * 检查目录是否匹配搜索词
   */
  private directoryMatchesTerm(summary: DirectorySummary, term: string): boolean {
    return (
      summary.path.toLowerCase().includes(term) ||
      summary.description.toLowerCase().includes(term) ||
      summary.keywords.some(keyword => keyword.toLowerCase().includes(term)) ||
      summary.collaboration.toLowerCase().includes(term)
    )
  }

  /**
   * 创建文件搜索结果
   */
  private createFileSearchResult(summary: FileSummary, matchedTerm: string): SearchResult {
    const highlights = this.extractHighlights(summary, matchedTerm)
    
    return {
      type: 'file',
      path: summary.path,
      name: this.getFileName(summary.path),
      description: summary.description,
      relevance: this.calculateRelevance(summary, matchedTerm),
      highlights
    }
  }

  /**
   * 创建目录搜索结果
   */
  private createDirectorySearchResult(summary: DirectorySummary, matchedTerm: string): SearchResult {
    const highlights = this.extractDirectoryHighlights(summary, matchedTerm)
    
    return {
      type: 'directory',
      path: summary.path,
      name: this.getDirectoryName(summary.path),
      description: summary.description,
      relevance: this.calculateDirectoryRelevance(summary, matchedTerm),
      highlights
    }
  }

  /**
   * 创建函数搜索结果
   */
  private createFunctionSearchResult(funcInfo: FunctionInfo, matchedTerm: string): SearchResult {
    return {
      type: 'function',
      path: funcInfo.filePath,
      name: funcInfo.name,
      description: funcInfo.description,
      relevance: 0.9,
      highlights: [funcInfo.name]
    }
  }

  /**
   * 创建关键词搜索结果
   */
  private createKeywordSearchResult(item: KeywordIndexItem, keyword: string, matchedTerm: string): SearchResult {
    return {
      type: item.type,
      path: item.path,
      name: item.name,
      description: item.description,
      relevance: this.calculateKeywordRelevance(keyword, matchedTerm),
      highlights: [keyword]
    }
  }

  /**
   * 提取高亮内容
   */
  private extractHighlights(summary: FileSummary, term: string): string[] {
    const highlights: string[] = []
    
    if (summary.description.toLowerCase().includes(term)) {
      highlights.push('description')
    }
    
    for (const keyword of summary.keywords) {
      if (keyword.toLowerCase().includes(term)) {
        highlights.push(keyword)
      }
    }
    
    for (const funcName of Object.keys(summary.core_functions)) {
      if (funcName.toLowerCase().includes(term)) {
        highlights.push(funcName)
      }
    }
    
    return highlights
  }

  /**
   * 提取目录高亮内容
   */
  private extractDirectoryHighlights(summary: DirectorySummary, term: string): string[] {
    const highlights: string[] = []
    
    if (summary.description.toLowerCase().includes(term)) {
      highlights.push('description')
    }
    
    for (const keyword of summary.keywords) {
      if (keyword.toLowerCase().includes(term)) {
        highlights.push(keyword)
      }
    }
    
    if (summary.collaboration.toLowerCase().includes(term)) {
      highlights.push('collaboration')
    }
    
    return highlights
  }

  /**
   * 计算相关性
   */
  private calculateRelevance(summary: FileSummary, term: string): number {
    let score = 0.5
    
    // 路径匹配
    if (summary.path.toLowerCase().includes(term)) {
      score += 0.3
    }
    
    // 描述匹配
    if (summary.description.toLowerCase().includes(term)) {
      score += 0.2
    }
    
    // 关键词匹配
    const keywordMatches = summary.keywords.filter(k => k.toLowerCase().includes(term)).length
    score += (keywordMatches / summary.keywords.length) * 0.2
    
    // 函数名匹配
    const functionMatches = Object.keys(summary.core_functions).filter(f => f.toLowerCase().includes(term)).length
    score += (functionMatches / Object.keys(summary.core_functions).length) * 0.1
    
    return Math.min(1.0, score)
  }

  /**
   * 计算目录相关性
   */
  private calculateDirectoryRelevance(summary: DirectorySummary, term: string): number {
    let score = 0.5
    
    // 路径匹配
    if (summary.path.toLowerCase().includes(term)) {
      score += 0.3
    }
    
    // 描述匹配
    if (summary.description.toLowerCase().includes(term)) {
      score += 0.2
    }
    
    // 关键词匹配
    const keywordMatches = summary.keywords.filter(k => k.toLowerCase().includes(term)).length
    score += (keywordMatches / summary.keywords.length) * 0.2
    
    // 协作描述匹配
    if (summary.collaboration.toLowerCase().includes(term)) {
      score += 0.1
    }
    
    return Math.min(1.0, score)
  }

  /**
   * 计算关键词相关性
   */
  private calculateKeywordRelevance(keyword: string, term: string): number {
    if (keyword === term) {
      return 1.0
    }
    
    if (keyword.includes(term)) {
      return 0.8
    }
    
    const similarity = this.calculateSimilarity(keyword, term)
    return Math.max(0.5, similarity)
  }

  /**
   * 排序和去重结果
   */
  private sortAndDeduplicateResults(results: SearchResult[]): SearchResult[] {
    // 按相关性排序
    const sorted = results.sort((a, b) => b.relevance - a.relevance)
    
    // 去重
    const seen = new Set<string>()
    const unique: SearchResult[] = []
    
    for (const result of sorted) {
      const key = `${result.type}:${result.path}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(result)
      }
    }
    
    return unique
  }

  /**
   * 获取文件名
   */
  private getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath
  }

  /**
   * 获取目录名
   */
  private getDirectoryName(dirPath: string): string {
    return dirPath.split('/').pop() || dirPath
  }
}

/**
 * 搜索索引
 */
interface SearchIndex {
  files: Map<string, FileSummary>
  directories: Map<string, DirectorySummary>
  keywords: Map<string, KeywordIndexItem[]>
  functions: Map<string, FunctionInfo>
}

/**
 * 关键词索引项
 */
interface KeywordIndexItem {
  type: 'file' | 'directory'
  path: string
  name: string
  description: string
}

/**
 * 函数信息
 */
interface FunctionInfo {
  name: string
  description: string
  filePath: string
  type: 'function'
}

/**
 * 搜索查询
 */
interface SearchQuery {
  type: 'exact' | 'fuzzy' | 'combined'
  terms: string[]
}