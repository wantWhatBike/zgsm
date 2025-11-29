import { ILogger } from "../../utils/logger"

/**
 * 自动重建调度器
 * 职责：管理自动构建定时器的调度和取消
 * 
 * 设计原则：
 * 1. 职责单一：只负责定时器的调度，不关心构建逻辑
 * 2. 无状态：不存储配置，每次调度时传入
 * 3. 简单清晰：避免与 Manager 的职责混淆
 */
export class AutoRebuildScheduler {
	private timer: NodeJS.Timeout | null = null
	private nextRebuildTime: number | null = null

	constructor(private readonly logger?: ILogger) {}

	/**
	 * 调度下次自动构建
	 * @param intervalMinutes 构建间隔（分钟）
	 * @param callback 触发时的回调函数
	 */
	public schedule(intervalMinutes: number, callback: () => void | Promise<void>): void {
		// 取消现有定时器
		this.cancel()

		const intervalMs = intervalMinutes * 60 * 1000
		this.nextRebuildTime = Date.now() + intervalMs

		const nextBuildTime = new Date(this.nextRebuildTime).toLocaleString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})

		this.logger?.info(`[AutoRebuildScheduler] ⏰ 定时器已启动`)
		this.logger?.info(`[AutoRebuildScheduler] 间隔: ${intervalMinutes} 分钟`)
		this.logger?.info(`[AutoRebuildScheduler] 下次构建: ${nextBuildTime}`)

		this.timer = setTimeout(() => {
			this.executeCallback(callback)
		}, intervalMs)
	}

	/**
	 * 取消定时器
	 */
	public cancel(): void {
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null

			if (this.nextRebuildTime) {
				const cancelledTime = new Date(this.nextRebuildTime).toLocaleString("zh-CN", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
					hour12: false,
				})
				this.logger?.info(`[AutoRebuildScheduler] ⏰ 定时器已取消（原计划: ${cancelledTime}）`)
			}

			this.nextRebuildTime = null
		}
	}

	/**
	 * 检查定时器是否在运行
	 */
	public isActive(): boolean {
		return this.timer !== null
	}

	/**
	 * 获取下次构建时间
	 */
	public getNextRebuildTime(): number | null {
		return this.nextRebuildTime
	}

	/**
	 * 执行回调（内部方法）
	 */
	private async executeCallback(callback: () => void | Promise<void>): Promise<void> {
		const currentTime = new Date().toLocaleString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})

		this.logger?.info("[AutoRebuildScheduler] ================================================")
		this.logger?.info(`[AutoRebuildScheduler] ⏰ 定时器触发 (${currentTime})`)
		this.logger?.info("[AutoRebuildScheduler] ================================================")

		try {
			await callback()
		} catch (error) {
			this.logger?.error(
				`[AutoRebuildScheduler] 回调执行失败: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * 清理资源
	 */
	public dispose(): void {
		this.cancel()
	}
}

