import { LLMUsage } from '../types'

interface BatchStats {
	totalBatches: number
	totalItems: number
	totalDuration: number
}

interface LLMStats {
	totalRequests: number
	successfulRequests: number
	failedRequests: number
	totalDuration: number
	totalInputTokens: number
	totalOutputTokens: number
}

/**
 * 通用性能跟踪器
 * 职责单一：专门负责性能数据的收集、统计和报告
 * 支持耗时统计、批次统计、LLM请求统计等多种统计类型
 */
export class ProgressTracer {
	private startTimes = new Map<string, number>()
	private durations = new Map<string, number>()
	
	// 批次统计信息 - 支持多个阶段
	private batchStats = new Map<string, BatchStats>()
	
	// LLM 统计信息
	private llmStats: LLMStats = {
		totalRequests: 0,
		successfulRequests: 0,
		failedRequests: 0,
		totalDuration: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
	}

	/**
	 * 开始计时
	 */
	start(phase: string): void {
		this.startTimes.set(phase, Date.now())
	}

	/**
	 * 结束计时并返回耗时（毫秒）
	 */
	end(phase: string): number {
		const startTime = this.startTimes.get(phase)
		if (!startTime) {
			return 0
		}
		
		const duration = Date.now() - startTime
		this.durations.set(phase, duration)
		this.startTimes.delete(phase)
		return duration
	}


	/**
	 * 记录 LLM 请求统计
	 */
	recordLLMRequest(usage: LLMUsage, duration: number, isSuccess: boolean = true): void {
		this.llmStats.totalRequests++
		this.llmStats.totalDuration += duration
		this.llmStats.totalInputTokens += usage.inputTokens
		this.llmStats.totalOutputTokens += usage.outputTokens
		
		if (isSuccess) {
			this.llmStats.successfulRequests++
		} else {
			this.llmStats.failedRequests++
		}
	}

	/**
	 * 记录批次统计 - 通用方法，支持任意阶段
	 */
	recordBatch(phase: string, itemCount: number, duration: number): void {
		if (!this.batchStats.has(phase)) {
			this.batchStats.set(phase, {
				totalBatches: 0,
				totalItems: 0,
				totalDuration: 0
			})
		}
		
		const stats = this.batchStats.get(phase)!
		stats.totalBatches++
		stats.totalItems += itemCount
		stats.totalDuration += duration
	}

	/**
	 * 获取耗时
	 */
	getDuration(phase: string): number {
		return this.durations.get(phase) || 0
	}

	/**
	 * 获取所有耗时
	 */
	getAllDurations(): Record<string, number> {
		return Object.fromEntries(this.durations)
	}


	/**
	 * 获取 LLM 统计信息
	 */
	getLLMStats() {
		return {
			...this.llmStats,
			averageDuration: this.llmStats.totalRequests > 0 ?
				this.llmStats.totalDuration / this.llmStats.totalRequests : 0,
			successRate: this.llmStats.totalRequests > 0 ?
				(this.llmStats.successfulRequests / this.llmStats.totalRequests) * 100 : 0,
			totalTokens: this.llmStats.totalInputTokens + this.llmStats.totalOutputTokens
		}
	}

	/**
	 * 获取指定阶段的批次统计信息
	 */
	getBatchStats(phase: string) {
		const stats = this.batchStats.get(phase)
		if (!stats) {
			return {
				totalBatches: 0,
				totalItems: 0,
				averageItemsPerBatch: 0,
				averageBatchDuration: 0
			}
		}

		return {
			totalBatches: stats.totalBatches,
			totalItems: stats.totalItems,
			averageItemsPerBatch: stats.totalBatches > 0 ?
				Math.round(stats.totalItems / stats.totalBatches) : 0,
			averageBatchDuration: stats.totalBatches > 0 ?
				stats.totalDuration / stats.totalBatches : 0
		}
	}

	/**
	 * 检查指定阶段是否有批次统计
	 */
	hasBatchStats(phase: string): boolean {
		return this.batchStats.has(phase) && this.batchStats.get(phase)!.totalBatches > 0
	}

	/**
	 * 生成统计报告
	 */
	generateReport(): string[] {
		const logs: string[] = []
		const allDurations = this.getAllDurations()
		const llmStats = this.getLLMStats()

		logs.push('=== 知识图谱构建性能报告 ===')
		
		// 各阶段耗时
		if (Object.keys(allDurations).length > 0) {
			logs.push('各阶段耗时:')
			for (const [phase, duration] of Object.entries(allDurations)) {
				logs.push(`  ${phase}: ${ProgressTracer.formatDuration(duration)}`)
				
				// 如果该阶段有批次统计，则显示批次信息
				if (this.hasBatchStats(phase)) {
					const batchStats = this.getBatchStats(phase)
					logs.push(`    批次统计: ${batchStats.totalBatches}个批次, 平均${batchStats.averageItemsPerBatch}个项目/批次, 平均耗时${ProgressTracer.formatDuration(batchStats.averageBatchDuration)}`)
				}
			}
		}


		return logs
	}

	/**
	 * 格式化耗时为可读字符串
	 */
	static formatDuration(ms: number): string {
		if (ms < 1000) {
			return `${Math.round(ms)}ms`
		}
		if (ms < 60000) {
			const seconds = (ms / 1000).toFixed(1)
			return `${seconds}s`
		}
		const minutes = Math.floor(ms / 60000)
		const seconds = Math.floor((ms % 60000) / 1000)
		return `${minutes}m${seconds}s`
	}

	/**
	 * 重置所有统计
	 */
	reset(): void {
		this.startTimes.clear()
		this.durations.clear()
		this.batchStats.clear()
		this.llmStats = {
			totalRequests: 0,
			successfulRequests: 0,
			failedRequests: 0,
			totalDuration: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0
		}
	}
}