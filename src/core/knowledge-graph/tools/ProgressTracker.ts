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

  // 进度锁，防止并发更新导致异常
  private progressLock: boolean = false
  private lastReportedProgress: number = -1

  /**
   * 安全的进度更新 - 防止进度异常跳跃
   */
  async update(progress: BuildProgress): Promise<void> {
    // 使用锁防止并发更新导致的进度异常
    if (this.progressLock) {
      this.logger.warn('[ProgressTracker] 进度更新被锁定，跳过此次更新')
      return
    }

    this.progressLock = true

    try {
      const now = Date.now()
      
      // 记录阶段开始时间
      if (!this.phaseStartTimes.has(progress.phase)) {
        this.phaseStartTimes.set(progress.phase, now)
        this.logger.info(`[ProgressTracker] 阶段开始: ${progress.phase}`)
      }
      
      // 计算总体进度百分比
      const overallPercentage = this.calculateOverallPercentage(progress)
      
      // 验证进度合理性 - 防止进度倒退
      if (this.currentProgress && overallPercentage < this.getOverallProgress()) {
        // 允许小幅回退（可能是阶段切换），但不允许大幅回退
        const regression = this.getOverallProgress() - overallPercentage
        if (regression > 5) {
          this.logger.warn(`[ProgressTracker] 检测到异常进度回退: ${this.getOverallProgress()}% -> ${overallPercentage}%, 跳过更新`)
          return
        }
      }

      // 更新当前进度
      this.currentProgress = { ...progress }
      
      // 添加到历史记录
      this.progressHistory.push({ ...progress })
      
      // 限制历史记录长度
      if (this.progressHistory.length > 1000) {
        this.progressHistory = this.progressHistory.slice(-500)
      }
      
      // 只有在进度发生显著变化时才发送事件（避免频繁更新）
      if (Math.abs(overallPercentage - this.lastReportedProgress) >= 1) {
        this.emit('progress', {
          ...progress,
          percentage: overallPercentage
        })
        this.lastReportedProgress = overallPercentage
        
        this.logger.info(`[ProgressTracker] 进度更新: ${progress.phase} ${overallPercentage}% - ${progress.message}`)
      }

      // 完成检测
      if (progress.phase === 'completed' && overallPercentage >= 100) {
        this.emit('completed', {
          ...progress,
          percentage: 100
        })
        this.logger.info('[ProgressTracker] 构建完成')
      }

    } finally {
      this.progressLock = false
    }
  }

  /**
   * 计算总体进度百分比 - 使用精确的阶段权重
   */
  private calculateOverallPercentage(progress: BuildProgress): number {
    const phaseWeights = {
      root_analysis: { start: 0, end: 10 },
      file_analysis: { start: 10, end: 70 },
      directory_analysis: { start: 70, end: 85 },
      dependency_analysis: { start: 85, end: 95 },
      completed: { start: 95, end: 100 }
    }
    
    const phaseConfig = phaseWeights[progress.phase as keyof typeof phaseWeights]
    if (!phaseConfig) {
      this.logger.warn(`[ProgressTracker] 未知阶段: ${progress.phase}`)
      return 0
    }

    // 计算阶段内进度
    const phaseProgress = Math.min(Math.max(progress.percentage / 100, 0), 1)
    
    // 计算在总体进度中的位置
    const overallProgress = phaseConfig.start + (phaseConfig.end - phaseConfig.start) * phaseProgress
    
    return Math.min(Math.max(Math.round(overallProgress), 0), 100)
  }

  /**
   * 阶段切换 - 确保进度平滑过渡
   */
  async switchPhase(newPhase: BuildProgress['phase'], message: string = ''): Promise<void> {
    if (!this.currentProgress) {
      // 如果没有当前进度，直接设置新阶段
      await this.update({
        phase: newPhase,
        current: 0,
        total: 1,
        message: message || `开始${newPhase}阶段`,
        percentage: 0
      })
      return
    }

    // 确保当前阶段完成到100%
    if (this.currentProgress.phase !== newPhase) {
      await this.update({
        phase: this.currentProgress.phase,
        current: this.currentProgress.total,
        total: this.currentProgress.total,
        message: `完成${this.currentProgress.phase}阶段`,
        percentage: 100
      })

      // 然后开始新阶段
      await this.update({
        phase: newPhase,
        current: 0,
        total: 1,
        message: message || `开始${newPhase}阶段`,
        percentage: 0
      })
    }
  }

  /**
   * 强制设置进度（用于错误恢复）
   */
  async forceSetProgress(percentage: number, phase: BuildProgress['phase'], message: string): Promise<void> {
    this.logger.warn(`[ProgressTracker] 强制设置进度: ${percentage}% (${phase})`)
    
    const progress: BuildProgress = {
      phase,
      current: percentage,
      total: 100,
      message,
      percentage
    }

    // 跳过验证，直接更新
    this.progressLock = false
    await this.update(progress)
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
   * 获取总体进度 - 增强版本，防止进度异常
   */
  getOverallProgress(): number {
    if (!this.currentProgress) return 0
    
    // 精确的阶段权重配置，修复进度异常问题
    const phaseWeights = {
      root_analysis: { start: 0, end: 10, weight: 0.10 },      // 0-10%
      file_analysis: { start: 10, end: 70, weight: 0.60 },     // 10-70%
      directory_analysis: { start: 70, end: 85, weight: 0.15 }, // 70-85%
      dependency_analysis: { start: 85, end: 95, weight: 0.10 }, // 85-95%
      completed: { start: 95, end: 100, weight: 0.05 }         // 95-100%
    }
    
    const currentPhase = this.currentProgress.phase
    const phaseConfig = phaseWeights[currentPhase]
    if (!phaseConfig) return 0
    
    // 计算阶段内进度
    const phaseProgress = Math.min(Math.max(this.currentProgress.percentage / 100, 0), 1)
    
    // 计算在总体进度中的位置
    const overallProgress = phaseConfig.start + (phaseConfig.end - phaseConfig.start) * phaseProgress
    
    return Math.min(Math.max(Math.round(overallProgress), 0), 100)
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
    this.lastReportedProgress = -1
    this.progressLock = false
    this.emit('reset')
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.removeAllListeners()
    this.reset()
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