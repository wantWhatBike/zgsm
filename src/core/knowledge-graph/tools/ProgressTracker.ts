/**
 * 进度追踪器 - 追踪知识图谱构建进度
 */

import { BuildProgress } from "../types"
import { EventEmitter } from "events"
import { createLogger, ILogger } from "../../../utils/logger"

export class ProgressTracker extends EventEmitter {
  private currentProgress: BuildProgress | null = null
  private progressHistory: BuildProgress[] = []
  private startTime: number = 0
  private phaseStartTimes: Map<string, number> = new Map()
  private logger: ILogger

  constructor() {
    super()
    this.logger = createLogger()
  }

  /**
   * 更新进度
   */
  update(progress: BuildProgress): void {
    const now = Date.now()
    
    // 记录阶段开始时间
    if (!this.phaseStartTimes.has(progress.phase)) {
      this.phaseStartTimes.set(progress.phase, now)
      this.logger.info(`[ProgressTracker] 阶段开始: ${progress.phase}`)
    }
    
    // 更新当前进度
    this.currentProgress = { ...progress }
    
    // 添加到历史记录
    this.progressHistory.push({ ...progress })
    
    // 限制历史记录长度
    if (this.progressHistory.length > 1000) {
      this.progressHistory = this.progressHistory.slice(-500)
    }
    
    // 触发进度更新事件
    this.emit('progress', progress)
    
    // 如果进度完成，触发完成事件
    if (progress.phase === 'completed' && progress.percentage === 100) {
      this.logger.info(`[ProgressTracker] 构建完成`)
      this.emit('completed', progress)
    }
    
    // 记录重要进度更新
    if (progress.percentage % 10 === 0) {
      this.logger.info(`[ProgressTracker] 进度更新: ${progress.phase} ${progress.percentage}% - ${progress.message}`)
    }
  }

  /**
   * 获取当前进度
   */
  getCurrentProgress(): BuildProgress | null {
    return this.currentProgress
  }

  /**
   * 获取进度历史
   */
  getProgressHistory(): BuildProgress[] {
    return [...this.progressHistory]
  }

  /**
   * 获取总体进度 - 使用新的加权值分配
   */
  getOverallProgress(): number {
    if (!this.currentProgress) return 0
    
    // 重新定义各阶段的权重，更符合实际工作量
    const phaseWeights = {
      root_analysis: 0.10,      // 10%: 根目录分析
      file_analysis: 0.59,      // 11%~70%: 文件摘要 (59%)
      directory_analysis: 0.10, // 71%~80%: 目录摘要 (10%)
      dependency_analysis: 0.10,// 81%~90%: 关系分析 (10%)
      completed: 0.11           // 91%~100%: 主索引生成 (11%)
    }
    
    const currentPhase = this.currentProgress.phase
    const currentWeight = phaseWeights[currentPhase] || 0
    const previousWeight = this.getPreviousPhasesWeight(currentPhase)
    
    const phaseProgress = this.currentProgress.percentage / 100
    let overallProgress = previousWeight + (currentWeight * phaseProgress)
    
    // 确保进度在合理范围内
    overallProgress = Math.min(Math.max(overallProgress, 0), 1.0)
    
    return overallProgress
  }

  /**
   * 获取预估剩余时间（毫秒）
   */
  getEstimatedTimeRemaining(): number {
    if (!this.currentProgress || this.currentProgress.phase === 'completed') {
      return 0
    }
    
    const overallProgress = this.getOverallProgress()
    if (overallProgress === 0) return -1 // 无法预估
    
    const elapsedTime = Date.now() - this.startTime
    const estimatedTotalTime = elapsedTime / overallProgress
    const remainingTime = estimatedTotalTime - elapsedTime
    
    return Math.max(remainingTime, 0)
  }

  /**
   * 获取阶段统计
   */
  getPhaseStats(): Map<string, PhaseStats> {
    const stats = new Map<string, PhaseStats>()
    
    for (const progress of this.progressHistory) {
      const phase = progress.phase
      
      if (!stats.has(phase)) {
        stats.set(phase, {
          phase,
          startTime: this.phaseStartTimes.get(phase) || 0,
          endTime: 0,
          duration: 0,
          minProgress: 100,
          maxProgress: 0,
          avgProgress: 0,
          updates: 0
        })
      }
      
      const phaseStats = stats.get(phase)!
      phaseStats.updates++
      phaseStats.maxProgress = Math.max(phaseStats.maxProgress, progress.percentage)
      phaseStats.minProgress = Math.min(phaseStats.minProgress, progress.percentage)
      
      // 如果阶段完成，记录结束时间
      if (progress.percentage === 100 && progress.phase !== 'completed') {
        phaseStats.endTime = Date.now()
        phaseStats.duration = phaseStats.endTime - phaseStats.startTime
      }
    }
    
    // 计算平均进度
    for (const [phase, phaseStats] of stats) {
      if (phaseStats.updates > 0) {
        const phaseProgresses = this.progressHistory
          .filter(p => p.phase === phase)
          .map(p => p.percentage)
        phaseStats.avgProgress = phaseProgresses.reduce((sum, p) => sum + p, 0) / phaseProgresses.length
      }
    }
    
    return stats
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const now = Date.now()
    const totalDuration = this.startTime > 0 ? now - this.startTime : 0
    
    const phaseStats = this.getPhaseStats()
    const completedPhases = Array.from(phaseStats.values()).filter(s => s.endTime > 0)
    
    const avgPhaseDuration = completedPhases.length > 0
      ? completedPhases.reduce((sum, s) => sum + s.duration, 0) / completedPhases.length
      : 0
    
    const progressVelocity = this.progressHistory.length > 1
      ? this.calculateProgressVelocity()
      : 0
    
    return {
      totalDuration,
      totalUpdates: this.progressHistory.length,
      avgPhaseDuration,
      progressVelocity,
      currentPhase: this.currentProgress?.phase || null,
      overallProgress: this.getOverallProgress(),
      estimatedTimeRemaining: this.getEstimatedTimeRemaining()
    }
  }

  /**
   * 重置进度
   */
  reset(): void {
    this.logger.info('[ProgressTracker] 重置进度')
    this.currentProgress = null
    this.progressHistory = []
    this.startTime = 0
    this.phaseStartTimes.clear()
    this.emit('reset')
  }

  /**
   * 开始追踪
   */
  start(): void {
    this.startTime = Date.now()
    this.logger.info('[ProgressTracker] 开始追踪')
    this.emit('start')
  }

  /**
   * 完成追踪
   */
  complete(): void {
    this.logger.info('[ProgressTracker] 完成追踪')
    if (this.currentProgress) {
      this.update({
        ...this.currentProgress,
        percentage: 100,
        phase: 'completed'
      })
    }
    this.emit('complete')
  }

  /**
   * 获取之前阶段的权重 - 使用新的加权值
   */
  private getPreviousPhasesWeight(currentPhase: string): number {
    const phaseOrder = ['root_analysis', 'file_analysis', 'directory_analysis', 'dependency_analysis', 'completed']
    const currentIndex = phaseOrder.indexOf(currentPhase)
    
    let weight = 0
    const phaseWeights = {
      root_analysis: 0.10,      // 10%
      file_analysis: 0.59,      // 59%
      directory_analysis: 0.10, // 10%
      dependency_analysis: 0.10 // 10%
    }
    
    for (let i = 0; i < currentIndex; i++) {
      const phase = phaseOrder[i]
      weight += phaseWeights[phase as keyof typeof phaseWeights] || 0
    }
    
    return weight
  }

  /**
   * 获取阶段的进度范围
   */
  getPhaseProgressRange(phase: string): { start: number, end: number } {
    const ranges = {
      root_analysis: { start: 0, end: 10 },
      file_analysis: { start: 10, end: 70 },
      directory_analysis: { start: 70, end: 80 },
      dependency_analysis: { start: 80, end: 90 },
      completed: { start: 90, end: 100 }
    }
    
    return ranges[phase as keyof typeof ranges] || { start: 0, end: 100 }
  }

  /**
   * 将阶段内进度转换为总体进度百分比
   */
  convertToOverallPercentage(phase: string, phaseProgress: number): number {
    const range = this.getPhaseProgressRange(phase)
    const progressInRange = (phaseProgress / 100) * (range.end - range.start)
    return Math.min(Math.max(range.start + progressInRange, 0), 100)
  }

  /**
   * 计算进度速度
   */
  private calculateProgressVelocity(): number {
    if (this.progressHistory.length < 2) return 0
    
    const recentHistory = this.progressHistory.slice(-10)
    const timeSpan = recentHistory[recentHistory.length - 1].percentage - recentHistory[0].percentage
    
    if (timeSpan <= 0) return 0
    
    const timeDiff = (Date.now() - this.startTime) / 1000 // 转换为秒
    return timeSpan / timeDiff // 每秒进度百分比
  }
}

/**
 * 阶段统计
 */
export interface PhaseStats {
  phase: string
  startTime: number
  endTime: number
  duration: number
  minProgress: number
  maxProgress: number
  avgProgress: number
  updates: number
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalDuration: number
  totalUpdates: number
  avgPhaseDuration: number
  progressVelocity: number
  currentPhase: string | null
  overallProgress: number
  estimatedTimeRemaining: number
}

/**
 * 进度事件
 */
export interface ProgressEvent {
  type: 'progress' | 'completed' | 'reset' | 'start' | 'error'
  progress?: BuildProgress
  error?: Error
  metrics?: PerformanceMetrics
}