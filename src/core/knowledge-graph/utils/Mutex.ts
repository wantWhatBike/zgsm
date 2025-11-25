/**
 * 互斥锁实现（带超时保护）
 * 用于确保关键操作的原子性，防止竞态条件
 */
export class Mutex {
	private locked = false
	private waitingQueue: Array<{ resolve: () => void; timeout: NodeJS.Timeout }> = []
	private readonly DEFAULT_TIMEOUT = 30000 // 30秒超时

	/**
	 * 获取锁
	 * @param timeout 超时时间（毫秒），默认30秒
	 */
	async lock(timeout: number = this.DEFAULT_TIMEOUT): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (!this.locked) {
				this.locked = true
				resolve()
			} else {
				// 设置超时保护
				const timeoutId = setTimeout(() => {
					const index = this.waitingQueue.findIndex(item => item.timeout === timeoutId)
					if (index !== -1) {
						this.waitingQueue.splice(index, 1)
						reject(new Error('Mutex lock timeout after ' + timeout + 'ms'))
					}
				}, timeout)
				
				this.waitingQueue.push({ resolve, timeout: timeoutId })
			}
		})
	}

	/**
	 * 释放锁
	 */
	unlock(): void {
		if (this.waitingQueue.length > 0) {
			const next = this.waitingQueue.shift()!
			clearTimeout(next.timeout) // 清除超时定时器
			next.resolve()
		} else {
			this.locked = false
		}
	}

	/**
	 * 使用锁执行函数（推荐方式）
	 * @param fn 需要执行的函数
	 * @param timeout 超时时间（毫秒）
	 */
	async withLock<T>(fn: () => Promise<T>, timeout?: number): Promise<T> {
		await this.lock(timeout)
		try {
			return await fn()
		} finally {
			this.unlock()
		}
	}

	/**
	 * 检查锁是否被占用
	 */
	isLocked(): boolean {
		return this.locked
	}

	/**
	 * 获取等待队列长度
	 */
	getQueueLength(): number {
		return this.waitingQueue.length
	}
}

