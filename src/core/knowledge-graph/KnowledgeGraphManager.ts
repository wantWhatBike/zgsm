/**
 * 知识图谱管理器
 * 重构版本：移除了KnowledgeGraphService，将所有功能直接集成到管理器中
 * 基于codebase-index的架构模式，实现知识图谱的生命周期管理
 */
import * as os from "os"
import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"
import * as fs from "fs"
import * as path from "path"
import { Task } from "../task/Task"
import { LLMClient } from "./llm/LLMClient"
import { RootAnalyzer } from "./analyzers/RootAnalyzer"
import { FileAnalyzer } from "./analyzers/FileAnalyzer"
import { DirectoryAnalyzer } from "./analyzers/DirectoryAnalyzer"
import { DependencyAnalyzer } from "./analyzers/DependencyAnalyzer"
import { SearchEngine } from "./search/SearchEngine"
import { Exporter } from "./export/Exporter"
import { ProgressTracker } from "./tools/ProgressTracker"
import { FileStorage } from "./storage/FileStorage"
import { StorageConfig } from "./storage/StorageInterface"
import {
  KnowledgeGraphConfig,
  KnowledgeGraphStatus,
  BuildProgress,
  ExportFormat,
  ExportResult,
  KnowledgeGraphError,
  BuildOptions,
  RootInfo,
  FileSummary,
  DirectorySummary,
  DependencyRelation,
  BuildState
} from "./types"
import { ERROR_CODES, DEFAULT_CONFIG, PROGRESS_CONFIG } from "./constants"
import { TelemetryErrorType } from "../costrict/telemetry"
import { TelemetryService } from "@roo-code/telemetry"
import { ZgsmAuthService } from "../costrict/auth"
import { ILogger } from "../../utils/logger"
import { createLogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { t } from "../../i18n"
import { createHash } from "crypto"

/**
 * 知识图谱管理器实现类（单例模式）
 * 重构后：直接集成所有服务功能，移除中间的Service层
 * 负责管理知识图谱的初始化、构建、状态监控和配置管理
 */
export class KnowledgeGraphManager {
  public static instance: KnowledgeGraphManager
  private logger: ILogger | null = null
  private clineProvider: ClineProvider | null = null
  private isInitialized: boolean = false
  
  // 核心组件
  private task: Task | null = null
  private storage: FileStorage | null = null
  private llmClient: LLMClient | null = null
  private rootAnalyzer: RootAnalyzer | null = null
  private fileAnalyzer: FileAnalyzer | null = null
  private directoryAnalyzer: DirectoryAnalyzer | null = null
  private dependencyAnalyzer: DependencyAnalyzer | null = null
  private searchEngine: SearchEngine | null = null
  private exporter: Exporter | null = null
  private progressTracker: ProgressTracker | null = null
  
  // 健康检查相关属性
  private healthCheckTimer: NodeJS.Timeout | null = null
  private healthCheckFailureCount: number = 0
  private isHealthCheckRunning: boolean = false
  
  // 构建状态监控
  private buildStatus: KnowledgeGraphStatus = {
    enabled: false,
    isRunning: false,
    isPaused: false,
    progress: 0,
    totalFiles: 0,
    processedFiles: 0,
    currentFile: '',
    status: 'idle'
  }
  
  // 构建过程状态
  private isBuilding: boolean = false
  private paused: boolean = false
  private buildState: {
    phase: BuildProgress['phase']
    completedFiles: Set<string>
    completedDirectories: Set<string>
    startTime: number
    lastUpdateTime: string
  } = {
    phase: 'root_analysis',
    completedFiles: new Set(),
    completedDirectories: new Set(),
    startTime: 0,
    lastUpdateTime: ''
  }
  
  // 配置缓存
  private currentConfig: KnowledgeGraphConfig = { ...DEFAULT_CONFIG }
  
  // 常量定义
  private readonly HEALTH_CHECK_INTERVAL: number = 30000 // 30秒
  private readonly MAX_FAILURE_COUNT: number = 3 // 最大失败次数
  
  /**
   * 私有构造函数确保单例模式
   */
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  public static getInstance(): KnowledgeGraphManager {
    if (!KnowledgeGraphManager.instance) {
      KnowledgeGraphManager.instance = new KnowledgeGraphManager()
    }
    return KnowledgeGraphManager.instance
  }
  
  /**
   * 设置日志提供者
   */
  public setLogger(logger: ILogger): void {
    this.logger = logger
  }
  
  /**
   * 设置提供者
   */
  public setProvider(clineProvider: ClineProvider): void {
    this.clineProvider = clineProvider
  }
  
  /**
   * 内部日志方法
   */
  private log(message: string, type: "info" | "error" = "info", id: string = ""): void {
    if (this.logger?.[type]) {
      this.logger[type](`[KnowledgeGraphManager] ${id ? `[${id}] ` : ""}${message}`)
    } else {
      const logMessage = `[${new Date().toLocaleString()}] [${type}]${id ? ` [${id}] ` : ""} ${message}`
      console.log(logMessage)
    }
  }
  
  /**
   * 初始化知识图谱服务
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.log("知识图谱服务已经初始化，跳过", "info", "initialize")
      return
    }
    
    try {
      this.log("开始初始化知识图谱服务", "info", "initialize")
      
      // 检查是否启用了知识图谱功能
      if (!await this.isKnowledgeGraphEnabled()) {
        this.log("知识图谱功能未启用", "info", "initialize")
        return
      }
      
      // 初始化核心组件
      await this.initializeCoreComponents()
      
      this.isInitialized = true
      this.log("知识图谱服务初始化成功", "info", "initialize")
      
      // 启动健康检查
      this.startHealthCheck()
      
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "初始化知识图谱服务时发生未知错误"
      this.log(errorMessage, "error", "initialize")
      throw new Error(errorMessage)
    }
  }
  
  /**
   * 初始化核心组件
   */
  private async initializeCoreComponents(): Promise<void> {
    // 创建工作空间任务上下文
    this.task = this.createTaskContext()
    
    // 初始化存储
    this.storage = this.createStorage()
    
    // 初始化LLM客户端
    this.llmClient = new LLMClient(this.task, this.currentConfig.model)
    
    // 初始化分析器
    this.initializeAnalyzers()
    
    // 初始化搜索引擎和导出器
    this.searchEngine = new SearchEngine(this.storage)
    this.exporter = new Exporter(this.storage)
    this.progressTracker = new ProgressTracker()
  }
  
  /**
   * 创建存储实例
   */
  private createStorage(): FileStorage {
    const storageConfig: StorageConfig = {
      type: this.currentConfig.storageType,
      path: this.getStoragePath()
    }
    return new FileStorage(storageConfig)
  }
  
  /**
   * 初始化分析器
   */
  private initializeAnalyzers(): void {
    this.rootAnalyzer = new RootAnalyzer(this.llmClient!, this.task!.cwd)
    this.fileAnalyzer = new FileAnalyzer(this.llmClient!, this.task!.cwd, this.currentConfig)
    this.directoryAnalyzer = new DirectoryAnalyzer(this.llmClient!, this.task!.cwd)
    this.dependencyAnalyzer = new DependencyAnalyzer(this.llmClient!)
    
    // 设置存储实例，用于增量构建
    if (this.fileAnalyzer && this.storage) {
      this.fileAnalyzer.setStorage(this.storage)
    }
    
    // 设置暂停检查器
    if (this.fileAnalyzer) {
      this.fileAnalyzer.setPauseChecker(() => this.paused)
    }
  }
  
  /**
   * 检查知识图谱是否启用
   */
  private async isKnowledgeGraphEnabled(): Promise<boolean> {
    if (!this.clineProvider) {
      return false
    }
    
    try {
      const state = await this.clineProvider.getState()
      // 检查API提供者是否为zgsm
      if (state.apiConfiguration?.apiProvider !== "zgsm") {
        return false
      }
      // 检查全局设置中是否启用了知识图谱
      return state.knowledgeGraphEnabled === true
    } catch {
      return false
    }
  }
  
  /**
   * 创建工作空间任务上下文
   */
  private createTaskContext(): Task {
    const workspacePath = this.getWorkspacePath() || ""
    return {
      cwd: workspacePath,
      say: async (type: string, text: string) => {
        this.log(`Task: ${text}`, "info", "task")
      }
    } as Task
  }
  
  /**
   * 获取工作空间路径
   */
  private getWorkspacePath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null
    }
    return workspaceFolders[0].uri.fsPath
  }
  
  /**
   * 获取存储路径
   */
  private getStoragePath(): string {
    const workspacePath = this.getWorkspacePath() || ""
    const projectName = path.basename(workspacePath)
    const projectHash = createHash('sha256').update(workspacePath).digest('hex').substring(0, 8)
    
    return path.join(
      os.homedir(),
      '.costrict',
      'cache',
      'knowledge-graph',
      `${projectName}-${projectHash}`
    )
  }
  
  /**
   * 重启服务
   */
  public async restartService(): Promise<void> {
    try {
      await this.stopService()
      this.isInitialized = false
      await this.initialize()
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : "重启知识图谱服务时发生未知错误"
      this.log(errorMessage, "error", "restart")
      throw new Error(errorMessage)
    }
  }
  
  /**
   * 停止服务
   */
  public async stopService(): Promise<void> {
    this.log("停止知识图谱服务", "info", "stop")
    
    // 停止健康检查
    this.stopHealthCheck()
    
    // 清理所有组件
    this.cleanupComponents()
    
    this.isInitialized = false
  }
  
  /**
   * 清理组件
   */
  private cleanupComponents(): void {
    this.storage = null
    this.llmClient = null
    this.rootAnalyzer = null
    this.fileAnalyzer = null
    this.directoryAnalyzer = null
    this.dependencyAnalyzer = null
    this.searchEngine = null
    this.exporter = null
    this.progressTracker = null
    this.task = null
  }
  
  /**
   * 构建知识图谱
   */
  public async buildKnowledgeGraph(options: Partial<BuildOptions> = {}): Promise<void> {
    this.validateBuildPrerequisites()
    
    try {
      this.log("开始构建知识图谱", "info", "build")
      
      // 初始化构建状态
      await this.initializeBuildState(options)
      
      // 执行构建策略
      await this.executeBuildStrategy(options)
      
      this.log("知识图谱构建完成", "info", "build")
      await this.task?.say('text', '知识图谱构建完成！')
      
    } catch (error) {
      await this.handleBuildError(error)
    } finally {
      await this.finalizeBuild()
    }
  }
  
  /**
   * 验证构建前提条件
   */
  private validateBuildPrerequisites(): void {
    if (!this.isInitialized) {
      throw new Error("知识图谱服务未初始化")
    }
    
    if (this.isBuilding) {
      throw new Error("知识图谱构建已在进行中")
    }
  }
  
  /**
   * 初始化构建状态
   */
  private async initializeBuildState(options: Partial<BuildOptions>): Promise<void> {
    // 检查是否有之前的构建状态需要恢复
    if (!this.storage) throw new Error("存储未初始化")
    const previousBuildState = await this.storage.getBuildState()
    
    if (previousBuildState && options.resumeFromPrevious !== false) {
      // 恢复之前的构建状态
      this.buildState.completedFiles = new Set(previousBuildState.completedFiles)
      this.buildState.completedDirectories = new Set(previousBuildState.completedDirectories)
      this.log(`恢复之前的构建状态: ${previousBuildState.completedFiles.length} 个文件, ${previousBuildState.completedDirectories.length} 个目录`, "info", "build")
    } else {
      // 重置构建状态
      this.buildState.completedFiles.clear()
      this.buildState.completedDirectories.clear()
    }
    
    this.isBuilding = true
    this.paused = false
    this.buildState.startTime = Date.now()
    this.buildState.lastUpdateTime = new Date().toISOString()
    
    // 更新状态
    this.updateBuildStatus({
      isRunning: true,
      isPaused: false,
      status: 'running',
      progress: 0,
      currentFile: '',
      error: undefined
    })
    
    // 立即保存初始构建状态
    await this.saveBuildState()
  }
  
  /**
   * 执行构建策略
   */
  private async executeBuildStrategy(options: Partial<BuildOptions>): Promise<void> {
    await this.task?.say('text', '开始构建知识图谱...')
    await this.fullBuild(options)
  }
  
  /**
   * 处理构建错误
   */
  private async handleBuildError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error
      ? error.message
      : "构建知识图谱时发生未知错误"
    this.log(errorMessage, "error", "build")
    
    this.updateBuildStatus({
      isRunning: false,
      status: 'error',
      error: errorMessage
    })
    
    throw new Error(errorMessage)
  }
  
  /**
   * 完成构建
   */
  private async finalizeBuild(): Promise<void> {
    this.isBuilding = false
    this.paused = false
    
    // 更新最终状态
    this.updateBuildStatus({
      isRunning: false,
      isPaused: false,
      status: this.buildStatus.error ? 'error' : 'completed'
    })
    
    // 保存构建状态
    await this.saveBuildState()
    this.log("构建状态已保存", "info", "build")
  }
  
  /**
   * 完整构建
   */
  private async fullBuild(options: Partial<BuildOptions>): Promise<void> {
    const workspacePath = options.workspacePath || this.task?.cwd || this.getWorkspacePath() || ""
    
    // 1. 根目录分析
    await this.updateProgress('root_analysis', 0, 1, '分析项目根目录...')
    if (!this.rootAnalyzer) throw new Error("根分析器未初始化")
    const rootInfo = await this.rootAnalyzer.analyzeRoot()
    if (!this.storage) throw new Error("存储未初始化")
    await this.storage.saveRootInfo(rootInfo)
    
    // 2. 文件分析 - 使用增量保存机制
    await this.updateProgress('file_analysis', 0, 1, '分析项目文件...')
    if (!this.fileAnalyzer) throw new Error("文件分析器未初始化")
    const fileSummaries = await this.fileAnalyzer.analyzeFiles(workspacePath, (progress: any) => {
      this.updateProgress('file_analysis', progress.current, progress.total, progress.message)
    }, async (summary: FileSummary) => {
      // 增量保存回调：每分析完一个文件就立即保存
      try {
        await this.storage!.saveFileSummary(summary)
        this.buildState.completedFiles.add(summary.path)
        this.log(`已保存文件摘要: ${summary.path}`, "info", "build")
        
        // 定期保存构建状态（每10个文件保存一次）
        if (this.buildState.completedFiles.size % 10 === 0) {
          await this.saveBuildState()
          this.log(`已保存构建状态，完成文件数: ${this.buildState.completedFiles.size}`, "info", "build")
        }
      } catch (error) {
        this.log(`保存文件摘要失败: ${summary.path} - ${error instanceof Error ? error.message : String(error)}`, "error", "build")
        // 即使保存失败，也要记录到失败列表中，避免重复分析
        this.buildState.completedFiles.add(summary.path)
      }
    })
    
    // 最终保存构建状态
    await this.saveBuildState()
    
    // 3. 目录分析 - 使用增量落盘
    await this.updateProgress('directory_analysis', 0, 1, '分析项目目录...')
    if (!this.directoryAnalyzer) throw new Error("目录分析器未初始化")
    const directorySummaries = await this.directoryAnalyzer.analyzeDirectories(
      fileSummaries,
      (progress: any) => {
        this.updateProgress('directory_analysis', progress.current, progress.total, progress.message)
      },
      async (summary: DirectorySummary) => {
        // 增量保存回调：每分析完一个目录就立即保存
        try {
          await this.storage!.saveDirectorySummary(summary)
          this.buildState.completedDirectories.add(summary.path)
          this.log(`已保存目录摘要: ${summary.path}`, "info", "build")
          
          // 定期保存构建状态（每3个目录保存一次）
          if (this.buildState.completedDirectories.size % 3 === 0) {
            await this.saveBuildState()
            this.log(`已保存构建状态，完成目录数: ${this.buildState.completedDirectories.size}`, "info", "build")
          }
        } catch (error) {
          this.log(`保存目录摘要失败: ${summary.path} - ${error instanceof Error ? error.message : String(error)}`, "error", "build")
          // 即使保存失败，也要记录到完成列表中，避免重复分析
          this.buildState.completedDirectories.add(summary.path)
        }
      }
    )
    
    // 4. 依赖关系分析
    await this.updateProgress('dependency_analysis', 0, 1, '分析依赖关系...')
    if (!this.dependencyAnalyzer) throw new Error("依赖分析器未初始化")
    const dependencies = await this.dependencyAnalyzer.analyzeDependencies(fileSummaries, directorySummaries)
    await this.storage.saveDependencyRelations(dependencies)
    
    // 5. 生成目录树和索引文件
    await this.updateProgress('completed', 0.8, 1, '生成目录树和索引文件...')
    try {
      // 生成目录树
      const directoryTree = await this.storage.generateDirectoryTree(workspacePath)
      await this.storage.saveDirectoryTree(directoryTree)
      this.log("目录树已生成", "info", "build")
      
      // 生成主索引文件
      const indexContent = await this.storage.generateIndex()
      await this.storage.saveIndex(indexContent)
      this.log("主索引文件已生成", "info", "build")
    } catch (error) {
      this.log(`生成目录树和索引文件失败: ${error instanceof Error ? error.message : String(error)}`, "error", "build")
    }
    
    // 6. 更新搜索引擎索引
    await this.updateProgress('completed', 0.9, 1, '更新搜索索引...')
    if (!this.searchEngine) throw new Error("搜索引擎未初始化")
    await this.searchEngine.buildIndex(fileSummaries, directorySummaries)
    
    await this.updateProgress('completed', 1, 1, '构建完成！')
  }
  
  /**
   * 增量构建
   */
  private async incrementalBuild(options: Partial<BuildOptions>): Promise<void> {
    const workspacePath = options.workspacePath || this.task?.cwd || this.getWorkspacePath() || ""
    
    // 获取之前的构建状态
    if (!this.storage) throw new Error("存储未初始化")
    const previousState = await this.storage.getBuildState()
    if (!previousState) {
      // 如果没有之前的状态，执行完整构建
      return this.fullBuild(options)
    }
    
    await this.task?.say('text', '执行增量更新...')
    
    // 1. 检查变化的文件
    if (!this.fileAnalyzer) throw new Error("文件分析器未初始化")
    const changedFiles = await this.fileAnalyzer.getChangedFiles(
      workspacePath,
      new Set(previousState.completedFiles)
    )
    
    if (changedFiles.length === 0) {
      await this.task?.say('text', '没有检测到文件变化，跳过更新')
      return
    }
    
    await this.task?.say('text', `检测到 ${changedFiles.length} 个文件发生变化`)
    
    // 2. 重新分析变化的文件 - 使用增量保存
    const updatedSummaries = await this.fileAnalyzer.analyzeSpecificFiles(changedFiles, (progress: any) => {
      this.updateProgress('file_analysis', progress.current, progress.total, progress.message)
    }, async (summary: FileSummary) => {
      // 增量保存回调：每分析完一个文件就立即保存
      try {
        await this.storage!.saveFileSummary(summary)
        this.buildState.completedFiles.add(summary.path)
        // 定期保存构建状态
        if (this.buildState.completedFiles.size % 5 === 0) {
          await this.saveBuildState()
        }
      } catch (error) {
        this.log(`保存文件摘要失败: ${summary.path} - ${error instanceof Error ? error.message : String(error)}`, "error", "incremental")
      }
    })
    
    // 3. 最终保存构建状态
    await this.saveBuildState()
    
    // 4. 找到受影响的目录
    const affectedDirectories = this.getAffectedDirectories(updatedSummaries)
    
    // 5. 重新分析受影响的目录 - 使用增量落盘
    const allFileSummaries = await this.storage.getAllFileSummaries()
    if (!this.directoryAnalyzer) throw new Error("目录分析器未初始化")
    const updatedDirectorySummaries = await this.directoryAnalyzer.analyzeSpecificDirectories(
      affectedDirectories,
      allFileSummaries,
      (progress: any) => {
        this.updateProgress('directory_analysis', progress.current, progress.total, progress.message)
      },
      async (summary: DirectorySummary) => {
        // 增量保存回调：每分析完一个目录就立即保存
        try {
          await this.storage!.saveDirectorySummary(summary)
          this.buildState.completedDirectories.add(summary.path)
          // 定期保存构建状态
          if (this.buildState.completedDirectories.size % 3 === 0) {
            await this.saveBuildState()
          }
        } catch (error) {
          this.log(`保存目录摘要失败: ${summary.path} - ${error instanceof Error ? error.message : String(error)}`, "error", "incremental")
        }
      }
    )
    
    // 7. 重新分析依赖关系
    if (!this.dependencyAnalyzer) throw new Error("依赖分析器未初始化")
    const updatedDependencies = await this.dependencyAnalyzer.analyzeSpecificDependencies(
      updatedSummaries,
      updatedDirectorySummaries
    )
    
    // 删除旧的依赖关系，保存新的
    for (const summary of updatedSummaries) {
      await this.storage.deleteDependencyRelationsForPath(summary.path)
    }
    await this.storage.saveDependencyRelations(updatedDependencies)
    
    // 8. 重新生成目录树和索引文件
    try {
      const directoryTree = await this.storage.generateDirectoryTree(workspacePath)
      await this.storage.saveDirectoryTree(directoryTree)
      
      const indexContent = await this.storage.generateIndex()
      await this.storage.saveIndex(indexContent)
      
      this.log("目录树和索引文件已更新", "info", "incremental")
    } catch (error) {
      this.log(`更新目录树和索引文件失败: ${error instanceof Error ? error.message : String(error)}`, "error", "incremental")
    }
    
    // 9. 更新搜索索引
    if (!this.searchEngine) throw new Error("搜索引擎未初始化")
    await this.searchEngine.updateIndex(updatedSummaries, updatedDirectorySummaries)
    
    await this.task?.say('text', '增量更新完成！')
  }
  
  
  /**
   * 获取受影响的目录
   */
  private getAffectedDirectories(fileSummaries: FileSummary[]): string[] {
    const directories = new Set<string>()
    
    for (const summary of fileSummaries) {
      const dirPath = path.dirname(summary.path)
      directories.add(dirPath)
      
      // 也包括父目录
      let parentDir = dirPath
      while (parentDir !== '.' && parentDir !== '/') {
        parentDir = path.dirname(parentDir)
        if (parentDir && parentDir !== '.') {
          directories.add(parentDir)
        }
      }
    }
    
    return Array.from(directories)
  }
  
  /**
   * 更新进度 - 使用新的加权值分配
   */
  private async updateProgress(
    phase: BuildProgress['phase'],
    current: number,
    total: number,
    message: string
  ): Promise<void> {
    // 检查是否已暂停
    if (this.paused) {
      await this.waitForResume()
    }
    
    this.buildState.phase = phase
    const phasePercentage = total > 0 ? Math.round((current / total) * 100) : 0
    
    // 使用ProgressTracker计算总体进度百分比
    let overallPercentage = 0
    if (this.progressTracker) {
      overallPercentage = Math.round(this.progressTracker.convertToOverallPercentage(phase, phasePercentage))
    } else {
      // 如果没有ProgressTracker，使用简化计算
      const phaseRanges = {
        root_analysis: { start: 0, end: 10 },
        file_analysis: { start: 10, end: 70 },
        directory_analysis: { start: 70, end: 80 },
        dependency_analysis: { start: 80, end: 90 },
        completed: { start: 90, end: 100 }
      }
      const range = phaseRanges[phase] || { start: 0, end: 100 }
      const progressInRange = (phasePercentage / 100) * (range.end - range.start)
      overallPercentage = Math.round(range.start + progressInRange)
    }
    
    const progress: BuildProgress = {
      phase,
      current,
      total,
      message,
      percentage: phasePercentage
    }
    
    // 更新构建状态中的进度 - 使用总体进度
    this.updateBuildStatus({
      progress: overallPercentage,
      currentFile: message,
      processedFiles: current,
      totalFiles: total
    })
    
    await this.task?.say('text', `${message} (总体进度: ${overallPercentage}%, 阶段进度: ${phasePercentage}%)`)
    
    if (this.progressTracker) {
      this.progressTracker.update(progress)
    }
    
    // 发送构建进度消息到WebUI - 使用总体进度
    if (this.clineProvider) {
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphBuildProgress",
        payload: {
          progress: {
            ...progress,
            percentage: overallPercentage // 发送总体进度给前端
          }
        }
      })
    }
  }
  
  /**
   * 保存构建状态
   */
  private async saveBuildState(): Promise<void> {
    this.buildState.lastUpdateTime = new Date().toISOString()
    
    if (!this.storage) return
    
    const buildState: BuildState = {
      phase: this.buildState.phase,
      completedFiles: Array.from(this.buildState.completedFiles),
      completedDirectories: Array.from(this.buildState.completedDirectories),
      lastUpdateTime: this.buildState.lastUpdateTime
    }
    
    try {
      await this.storage.saveBuildState(buildState)
      this.log(`构建状态已保存: ${buildState.completedFiles.length} 文件, ${buildState.completedDirectories.length} 目录`, "info", "build")
    } catch (error) {
      this.log(`保存构建状态失败: ${error instanceof Error ? error.message : String(error)}`, "error", "build")
      // 构建状态保存失败不应该中断构建过程，只记录错误
    }
  }
  
  /**
   * 暂停构建
   */
  public async pauseBuild(): Promise<void> {
    this.validatePauseOperation()
    
    this.paused = true
    // 保存当前进度，不重置
    this.updateBuildStatus({
      isPaused: true,
      status: 'paused',
      isRunning: false
      // 不修改 progress，保持当前进度
    })
    
    // 保存当前构建状态
    await this.saveBuildState()
    
    await this.task?.say('text', '知识图谱构建已暂停')
    this.log("知识图谱构建已暂停", "info", "pause")
  }
  
  /**
   * 验证暂停操作
   */
  private validatePauseOperation(): void {
    // 检查是否正在构建或者状态显示为运行中
    const isCurrentlyRunning = this.isBuilding || this.buildStatus.status === 'running' || this.buildStatus.isRunning
    
    if (!isCurrentlyRunning) {
      throw new KnowledgeGraphError(
        '没有正在进行的构建',
        ERROR_CODES.NETWORK_ERROR,
        false,
        false
      )
    }
    
    if (this.paused || this.buildStatus.isPaused || this.buildStatus.status === 'paused') {
      throw new KnowledgeGraphError(
        '构建已经暂停',
        ERROR_CODES.NETWORK_ERROR,
        false,
        false
      )
    }
  }
  
  /**
   * 继续构建
   */
  public async resumeBuild(): Promise<void> {
    this.validateResumeOperation()
    
    this.paused = false
    // 恢复构建状态，保持之前的进度
    this.updateBuildStatus({
      isPaused: false,
      status: 'running',
      isRunning: true
      // 不修改 progress，保持暂停前的进度
    })
    await this.task?.say('text', '知识图谱构建已继续')
    this.log("知识图谱构建已继续", "info", "resume")
  }
  
  /**
   * 验证继续操作
   */
  private validateResumeOperation(): void {
    // 检查是否有构建任务存在（正在构建或已暂停）
    const hasBuildTask = this.isBuilding || this.buildStatus.status === 'paused' || this.buildStatus.isPaused
    
    if (!hasBuildTask) {
      throw new KnowledgeGraphError(
        '没有正在进行的构建',
        ERROR_CODES.NETWORK_ERROR,
        false,
        false
      )
    }
    
    // 检查是否已暂停
    const isCurrentlyPaused = this.paused || this.buildStatus.isPaused || this.buildStatus.status === 'paused'
    
    if (!isCurrentlyPaused) {
      throw new KnowledgeGraphError(
        '构建未暂停',
        ERROR_CODES.NETWORK_ERROR,
        false,
        false
      )
    }
  }
  
  /**
   * 等待恢复
   */
  private async waitForResume(): Promise<void> {
    while (this.paused && this.isBuilding) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  /**
   * 搜索知识图谱
   */
  public async searchKnowledgeGraph(query: string): Promise<any[]> {
    this.validateSearchOperation()
    
    try {
      return await this.searchEngine!.search(query)
    } catch (error) {
      this.handleSearchError(error)
    }
  }
  
  /**
   * 验证搜索操作
   */
  private validateSearchOperation(): void {
    if (!this.isInitialized) {
      throw new Error("知识图谱服务未初始化")
    }
    
    if (!this.searchEngine) {
      throw new Error("搜索引擎未初始化")
    }
  }
  
  /**
   * 处理搜索错误
   */
  private handleSearchError(error: unknown): never {
    const errorMessage = error instanceof Error
      ? error.message
      : "搜索知识图谱时发生未知错误"
    this.log(errorMessage, "error", "search")
    throw new Error(errorMessage)
  }
  
  /**
   * 导出知识图谱
   */
  public async exportKnowledgeGraph(format: ExportFormat, outputPath: string): Promise<ExportResult> {
    this.validateExportOperation()
    
    try {
      const options = {
        format,
        outputPath,
        includeMetadata: true
      }
      return await this.exporter!.export(options)
    } catch (error) {
      this.handleExportError(error)
    }
  }
  
  /**
   * 验证导出操作
   */
  private validateExportOperation(): void {
    if (!this.isInitialized) {
      throw new Error("知识图谱服务未初始化")
    }
    
    if (!this.exporter) {
      throw new Error("导出器未初始化")
    }
  }
  
  /**
   * 处理导出错误
   */
  private handleExportError(error: unknown): never {
    const errorMessage = error instanceof Error
      ? error.message
      : "导出知识图谱时发生未知错误"
    this.log(errorMessage, "error", "export")
    throw new Error(errorMessage)
  }
  
  /**
   * 获取知识图谱状态
   */
  public async getKnowledgeGraphStatus(): Promise<{
    exists: boolean
    info: any | null
    buildState: BuildState | null
    rootInfo: RootInfo | null
  }> {
    // 即使未初始化，也尝试创建存储来检查状态
    if (!this.storage) {
      try {
        this.storage = this.createStorage()
      } catch (error) {
        this.log("创建存储失败", "error", "status")
        return this.getEmptyStatus()
      }
    }
    
    try {
      return await this.queryStorageStatus()
    } catch (error) {
      this.log("获取知识图谱状态失败", "error", "status")
      return this.getEmptyStatus()
    }
  }
  
  /**
   * 查询存储状态
   */
  private async queryStorageStatus(): Promise<{
    exists: boolean
    info: any | null
    buildState: BuildState | null
    rootInfo: RootInfo | null
  }> {
    const exists = await this.storage!.exists()
    if (!exists) {
      return this.getEmptyStatus()
    }
    
    try {
      const [storageInfo, buildState, rootInfo, fileSummaries] = await Promise.all([
        this.storage!.getStorageInfo(),
        this.storage!.getBuildState(),
        this.storage!.getRootInfo(),
        this.storage!.getAllFileSummaries()
      ])
      
      // 创建扩展的信息对象，包含文件统计
      const info = {
        ...storageInfo,
        fileCount: fileSummaries ? fileSummaries.length : 0,
        totalFiles: fileSummaries ? fileSummaries.length : 0
      }
      
      return { exists: true, info, buildState, rootInfo }
    } catch (error) {
      this.log(`查询存储状态失败: ${error instanceof Error ? error.message : String(error)}`, "error", "status")
      return this.getEmptyStatus()
    }
  }
  
  /**
   * 获取空状态
   */
  private getEmptyStatus(): {
    exists: boolean
    info: null
    buildState: null
    rootInfo: null
  } {
    return {
      exists: false,
      info: null,
      buildState: null,
      rootInfo: null
    }
  }
  
  /**
   * 清除知识图谱
   */
  public async clearKnowledgeGraph(): Promise<void> {
    this.validateClearOperation()
    
    try {
      await this.performClearOperation()
      this.log("知识图谱已清除", "info", "clear")
    } catch (error) {
      this.handleClearError(error)
    }
  }
  
  /**
   * 验证清除操作
   */
  private validateClearOperation(): void {
    if (!this.isInitialized) {
      throw new Error("知识图谱服务未初始化")
    }
    
    if (!this.storage) {
      throw new Error("存储未初始化")
    }
  }
  
  /**
   * 执行清除操作
   */
  private async performClearOperation(): Promise<void> {
    await this.storage!.clear()
    this.buildState.completedFiles.clear()
    this.buildState.completedDirectories.clear()
    
    // 重置构建状态
    this.buildStatus = {
      enabled: this.buildStatus.enabled,
      isRunning: false,
      isPaused: false,
      progress: 0,
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      status: 'idle'
    }
    
    // 重置构建过程状态
    this.buildState = {
      phase: 'root_analysis',
      completedFiles: new Set(),
      completedDirectories: new Set(),
      startTime: 0,
      lastUpdateTime: new Date().toISOString()
    }
    
    // 重置其他状态
    this.isBuilding = false
    this.paused = false
    
    // 保存重置后的构建状态
    await this.saveBuildState()
    
    // 立即通知前端状态已重置
    this.updateBuildStatus({
      isRunning: false,
      isPaused: false,
      progress: 0,
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      status: 'idle'
    })
    
    // 额外发送一个明确的清空完成状态
    if (this.clineProvider) {
      const clearedStatusInfo = {
        status: "pending" as const,
        process: 0,
        totalFiles: 0,
        totalSucceed: 0,
        totalFailed: 0,
        failedReason: "",
        failedFiles: [],
        processTs: Math.floor(Date.now() / 1000),
        currentStage: "root_analysis" as const,
        stageProgress: 0
      }
      
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: { status: clearedStatusInfo }
      })
    }
  }
  
  /**
   * 处理清除错误
   */
  private handleClearError(error: unknown): never {
    const errorMessage = error instanceof Error
      ? error.message
      : "清除知识图谱时发生未知错误"
    this.log(errorMessage, "error", "clear")
    throw new Error(errorMessage)
  }
  
  /**
   * 获取构建状态
   */
  public getBuildStatus(): KnowledgeGraphStatus {
    return { ...this.buildStatus }
  }
  
  /**
   * 更新构建状态
   */
  private updateBuildStatus(updates: Partial<KnowledgeGraphStatus>): void {
    this.buildStatus = { ...this.buildStatus, ...updates }
    
    // 通知WebUI状态更新
    if (this.clineProvider) {
      this.clineProvider.postMessageToWebview({
        type: "knowledgeGraphStatusResponse",
        payload: {
          status: this.buildStatus
        }
      })
    }
  }
  
  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<KnowledgeGraphConfig>): void {
    const oldStorageType = this.currentConfig.storageType
    this.currentConfig = { ...this.currentConfig, ...newConfig }
    
    // 如果存储类型改变，需要重新初始化存储
    if (newConfig.storageType && newConfig.storageType !== oldStorageType && this.storage) {
      this.storage = this.createStorage()
      this.log("存储类型已更改，重新初始化存储", "info", "config")
    }
    
    this.log("知识图谱配置已更新", "info", "config")
  }
  
  /**
   * 获取当前配置
   */
  public getConfig(): KnowledgeGraphConfig {
    return { ...this.currentConfig }
  }
  
  /**
   * 检查是否正在构建
   */
  public isCurrentlyBuilding(): boolean {
    return this.isBuilding
  }

  /**
   * 检查是否已初始化
   */
  public isManagerInitialized(): boolean {
    return this.isInitialized
  }
  
  /**
   * 检查是否暂停
   */
  public isCurrentlyPaused(): boolean {
    return this.paused
  }
  
  /**
   * 获取构建进度
   */
  public getBuildProgress(): BuildProgress | null {
    return this.progressTracker?.getCurrentProgress() || null
  }
  
  /**
   * 开始健康检查
   */
  private startHealthCheck(): void {
    if (this.isHealthCheckRunning) {
      return
    }
    
    this.log("启动健康检查", "info", "health")
    this.isHealthCheckRunning = true
    
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck()
    }, this.HEALTH_CHECK_INTERVAL)
  }
  
  /**
   * 停止健康检查
   */
  public stopHealthCheck(): void {
    if (!this.isHealthCheckRunning) {
      return
    }
    
    this.log("停止健康检查", "info", "health")
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    
    this.isHealthCheckRunning = false
    this.healthCheckFailureCount = 0
  }
  
  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      await this.updateSystemStatus()
      this.healthCheckFailureCount = 0
    } catch (error) {
      await this.handleHealthCheckError(error)
    }
  }
  
  /**
   * 更新系统状态
   */
  private async updateSystemStatus(): Promise<void> {
    // 更新构建状态
    this.updateBuildStatus({
      isRunning: this.isBuilding,
      isPaused: this.paused
    })
  }
  
  /**
   * 处理健康检查错误
   */
  private async handleHealthCheckError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error
      ? error.message
      : "健康检查失败"
    this.log(errorMessage, "error", "health")
    
    await this.handleHealthCheckFailure()
  }
  
  /**
   * 处理健康检查失败
   */
  private async handleHealthCheckFailure(): Promise<void> {
    this.healthCheckFailureCount++
    
    if (this.healthCheckFailureCount > this.MAX_FAILURE_COUNT) {
      await this.handleCriticalHealthFailure()
    } else {
      this.log(`健康检查失败计数: ${this.healthCheckFailureCount}/${this.MAX_FAILURE_COUNT}`, "info", "health")
    }
  }
  
  /**
   * 处理严重的健康检查失败
   */
  private async handleCriticalHealthFailure(): Promise<void> {
    this.log(`健康检查失败${this.healthCheckFailureCount}次，超过阈值，准备重启服务`, "error", "health")
    
    try {
      await this.restartService()
      this.log("服务重启成功，重置失败计数", "info", "health")
      this.healthCheckFailureCount = 0
    } catch (restartError) {
      const restartErrorMessage = restartError instanceof Error
        ? restartError.message
        : "重启服务时发生未知错误"
      this.log(restartErrorMessage, "error", "health")
    }
  }
  
  /**
   * 记录错误
   */
  private recordError(type: TelemetryErrorType): void {
    TelemetryService.instance.captureError(`KnowledgeGraphError_${type}`)
  }
  
  /**
   * 销毁管理器
   */
  public async dispose(): Promise<void> {
    this.log("销毁知识图谱管理器", "info", "dispose")
    
    // 停止健康检查
    this.stopHealthCheck()
    
    // 停止服务
    await this.stopService()
    
    // 清理实例
    KnowledgeGraphManager.instance = null as any
  }
}

// 导出单例实例
export const knowledgeGraphManager = KnowledgeGraphManager.getInstance()

// 默认导出管理器类
export default KnowledgeGraphManager