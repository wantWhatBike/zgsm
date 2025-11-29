import { ILogger } from "../../utils/logger"

/**
 * 自动重建调度器（完全独立运行）
 * 
 * 设计原则：
 * 1. 自主循环：启动后持续运行，不依赖外部调用
 * 2. 尝试执行：到时间就尝试执行，抢不到锁就跳过（非阻塞）
 * 3. 完全解耦：业务逻辑不需要管理定时器
 * 4. KISS：逻辑简单清晰
 */
export class AutoRebuildScheduler {
	private timer: NodeJS.Timeout | null = null
	private enabled: boolean = false
	private intervalMinutes: number = 5
	private nextScheduledTime: number | null = null

	constructor(
		private readonly logger: ILogger,
		private readonly tryExecute: () => Promise<boolean> // 返回是否成功执行
	) {}

	/**
	 * 启动定时器（持续运行）
	 * @param intervalMinutes 构建间隔（分钟）
	 */
	public start(intervalMinutes: number): void {
		this.enabled = true
		this.intervalMinutes = intervalMinutes
		this.scheduleNext()
		this.logger.info(`[AutoRebuildScheduler] ✅ 已启动（间隔: ${intervalMinutes}分钟）`)
	}

	/**
	 * 停止定时器
	 */
	public stop(): void {
		this.enabled = false
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
			this.logger.info(`[AutoRebuildScheduler] ⏹️ 已停止`)
		}
		this.nextScheduledTime = null
	}

	/**
	 * 更新间隔（运行中动态调整）
	 * @param intervalMinutes 新的构建间隔（分钟）
	 */
	public updateInterval(intervalMinutes: number): void {
		if (this.enabled && this.intervalMinutes !== intervalMinutes) {
			this.intervalMinutes = intervalMinutes
			// 重新调度（使用新间隔）
			this.scheduleNext()
			this.logger.info(`[AutoRebuildScheduler] 🔄 间隔已更新: ${intervalMinutes}分钟`)
		}
	}

	/**
	 * 检查定时器是否在运行
	 */
	public isActive(): boolean {
		return this.enabled
	}

	/**
	 * 获取下次执行时间
	 */
	public getNextScheduledTime(): number | null {
		return this.nextScheduledTime
	}

	/**
	 * 调度下一次执行（内部方法）
	 */
	private scheduleNext(): void {
		// 清除现有定时器
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}

		if (!this.enabled) {
			return
		}

		const intervalMs = this.intervalMinutes * 60 * 1000
		this.nextScheduledTime = Date.now() + intervalMs

		const nextTime = new Date(this.nextScheduledTime).toLocaleString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})

		this.logger.info(`[AutoRebuildScheduler] ⏰ 下次执行时间: ${nextTime}`)

		this.timer = setTimeout(() => {
			this.execute()
		}, intervalMs)
	}

	/**
	 * 执行自动构建（内部方法）
	 */
	private async execute(): Promise<void> {
		const currentTime = new Date().toLocaleString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})

		this.logger.info("================================================")
		this.logger.info(`[AutoRebuildScheduler] ⏰ 定时器触发 (${currentTime})`)
		this.logger.info("================================================")

		try {
			// ✅ 尝试执行（非阻塞）
			const success = await this.tryExecute()

			if (success) {
				this.logger.info(`[AutoRebuildScheduler] ✅ 执行成功`)
			} else {
				this.logger.warn(`[AutoRebuildScheduler] ⚠️ 执行被跳过（可能有其他操作正在进行）`)
			}
		} catch (error) {
			this.logger.error(
				`[AutoRebuildScheduler] ❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`
			)
		} finally {
			// ✅ 无论成功或失败，都继续下一轮
			this.scheduleNext()
		}
	}

	/**
	 * 清理资源
	 */
	public dispose(): void {
		this.stop()
	}
}
