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

	/**
	 * 解析依赖路径到项目相对路径（智能模糊匹配）
	 * 
	 * 处理场景：
	 * 1. 项目相对路径："src/utils/helper.ts" → 直接返回
	 * 2. 文件相对路径："../utils/helper.ts" (from "src/api/user.ts") → 解析为 "src/utils/helper.ts"
	 * 3. 模块/包/命名空间路径：支持各种语言的模块路径格式
	 *    - Go: "github.com/user/repo/pkg"
	 *    - Java: "com.example.project.service"
	 *    - Python: "src.utils.helper"
	 *    - C#: "MyProject.Services"
	 *    - Rust: "crate::module"
	 * 
	 * @param depPath - LLM返回的依赖路径
	 * @param fromFilePath - 依赖来源文件的项目相对路径
	 * @param allFilePaths - 项目中所有文件的路径列表（用于模糊匹配）
	 * @returns 解析后的项目相对路径，匹配失败返回 null
	 */
	static resolveDependencyPath(
		depPath: string,
		fromFilePath: string,
		allFilePaths: string[]
	): string | null {
		if (!depPath || !fromFilePath) return null

		// 标准化依赖路径
		const normalizedDepPath = PathUtils.normalizePathSeparators(depPath)

		// 策略1：直接匹配 - 如果依赖路径在文件列表中存在
		if (allFilePaths.includes(normalizedDepPath)) {
			return normalizedDepPath
		}

		// 策略2：相对路径解析 - 处理 ./xxx 或 ../xxx
		if (normalizedDepPath.startsWith('./') || normalizedDepPath.startsWith('../')) {
			try {
				// 获取来源文件所在目录
				const fromDir = path.dirname(fromFilePath)
				// 解析相对路径
				const resolvedPath = path.join(fromDir, normalizedDepPath)
				// 标准化为 Unix 风格
				const normalized = PathUtils.normalizePathSeparators(resolvedPath)
				
				// 检查解析后的路径是否存在
				if (allFilePaths.includes(normalized)) {
					return normalized
				}
			} catch (error) {
				// 路径解析失败，继续尝试其他策略
			}
		}

		// 策略3：模糊匹配 - 处理模块/包/命名空间路径
		// 提取依赖路径的最后一段作为匹配关键词
		const depSegments = normalizedDepPath.split(/[./\\:]/).filter(s => s.length > 0)
		if (depSegments.length === 0) return null

		// 尝试多种匹配策略
		const lastSegment = depSegments[depSegments.length - 1]
		const lastTwoSegments = depSegments.slice(-2).join('/')
		
		// 3.1 精确匹配最后两段（例如：utils/helper）
		const exactMatch = allFilePaths.find(filePath => {
			const fileSegments = filePath.split('/').filter(s => s.length > 0)
			const fileLastTwo = fileSegments.slice(-2).join('/')
			return fileLastTwo === lastTwoSegments
		})
		if (exactMatch) return exactMatch

		// 3.2 包含匹配最后一段（例如：helper）
		// 优先匹配完整路径段，避免部分匹配（如 "helper" 不应匹配 "helper_test"）
		const segmentMatches = allFilePaths.filter(filePath => {
			const fileSegments = filePath.split('/').filter(s => s.length > 0)
			// 检查文件路径的任意段是否与最后一段匹配（去除扩展名）
			return fileSegments.some(seg => {
				const segWithoutExt = seg.replace(/\.[^.]+$/, '')
				return segWithoutExt === lastSegment
			})
		})

		// 如果只有一个匹配，返回它
		if (segmentMatches.length === 1) {
			return segmentMatches[0]
		}

		// 如果有多个匹配，尝试选择最相似的
		if (segmentMatches.length > 1) {
			// 优先选择路径段数量相近的
			const depSegmentCount = depSegments.length
			const sortedMatches = segmentMatches.sort((a, b) => {
				const aSegments = a.split('/').length
				const bSegments = b.split('/').length
				const aDiff = Math.abs(aSegments - depSegmentCount)
				const bDiff = Math.abs(bSegments - depSegmentCount)
				return aDiff - bDiff
			})
			return sortedMatches[0]
		}

		// 3.3 包含匹配依赖路径的任意段（更宽松的匹配）
		// 将 Go/Java 的包路径转换为文件路径格式
		// 例如：github.com/user/repo/pkg → 匹配包含 user/repo/pkg 或 repo/pkg 的路径
		if (depSegments.length >= 2) {
			const pathPattern = depSegments.slice(-2).join('/')
			const containsMatch = allFilePaths.find(filePath => 
				filePath.includes(pathPattern)
			)
			if (containsMatch) return containsMatch
		}

		// 所有策略都失败，返回 null
		return null
	}
}

