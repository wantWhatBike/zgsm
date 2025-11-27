/**
 * 路径工具类
 * 
 * 核心原则：在知识图谱系统中，所有路径统一使用 Unix 风格（"/"）分隔符
 * 这样可以：
 * 1. 避免 Windows 路径分隔符（"\"）与 LLM 返回路径不一致的问题
 * 2. 保证跨平台一致性
 * 3. 简化路径匹配和比较逻辑
 * 4. 与 Git、LLM 等工具的习惯保持一致
 */

import * as path from "path"

export class PathUtils {
	/**
	 * 将路径标准化为 Unix 风格（用于存储、比较、传递给 LLM）
	 * 
	 * 示例：
	 * - Windows: "test\\integration_test.go" → "test/integration_test.go"
	 * - Unix:    "test/integration_test.go"  → "test/integration_test.go"
	 * - Mixed:   "test\\src/file.ts"         → "test/src/file.ts"
	 * 
	 * @param filePath - 任意格式的路径
	 * @returns Unix 风格的路径
	 */
	static normalizePathSeparators(filePath: string): string {
		if (!filePath) return filePath
		return filePath.replace(/\\/g, "/")
	}

	/**
	 * 计算相对路径并标准化为 Unix 风格
	 * 
	 * 示例：
	 * - toRelativePath("G:\\project\\src\\file.ts", "G:\\project") → "src/file.ts"
	 * - toRelativePath("/home/user/project/src/file.ts", "/home/user/project") → "src/file.ts"
	 * 
	 * @param fullPath - 完整路径
	 * @param workspacePath - 工作区路径
	 * @returns 标准化的相对路径
	 */
	static toRelativePath(fullPath: string, workspacePath: string): string {
		const relativePath = path.relative(workspacePath, fullPath)
		return PathUtils.normalizePathSeparators(relativePath)
	}

	/**
	 * 批量标准化路径
	 * 
	 * @param paths - 路径数组
	 * @returns 标准化后的路径数组
	 */
	static normalizePathsArray(paths: string[]): string[] {
		return paths.map((p) => PathUtils.normalizePathSeparators(p))
	}

	/**
	 * 标准化对象中的路径键（用于迁移旧数据）
	 * 
	 * 示例：
	 * - { "test\\file.go": {...} } → { "test/file.go": {...} }
	 * 
	 * @param obj - 以路径为键的对象
	 * @returns 标准化后的对象
	 */
	static normalizePathKeys<T>(obj: Record<string, T>): Record<string, T> {
		const result: Record<string, T> = {}
		for (const [key, value] of Object.entries(obj)) {
			const normalizedKey = PathUtils.normalizePathSeparators(key)
			result[normalizedKey] = value
		}
		return result
	}

	/**
	 * 将标准化路径转换为系统路径（用于文件读写）
	 * 
	 * 注意：Node.js 的 fs 模块在 Windows 上也支持 Unix 风格路径，
	 * 所以通常不需要调用此方法。只在需要显示给用户或传递给系统 API 时使用。
	 * 
	 * @param normalizedPath - Unix 风格路径
	 * @returns 系统风格路径
	 */
	static toSystemPath(normalizedPath: string): string {
		if (!normalizedPath) return normalizedPath
		// Windows 会自动转换，Unix 系统保持不变
		return path.normalize(normalizedPath)
	}
}

