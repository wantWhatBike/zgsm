import * as path from "path"
import * as fs from "fs"
import * as fsPromises from "fs/promises"
import ignore from "ignore"
import { listFiles } from "../../services/glob/list-files"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { Task } from "../task/Task"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag, ToolUse } from "../../shared/tools"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { getReadablePath } from "../../utils/path"

// 默认忽略规则，用于防止项目没有ignore文件时包含不必要的文件
const DEFAULT_IGNORE = `
# 构建和依赖目录
node_modules/
dist/
build/
out/
target/
bin/
obj/
*.class
*.jar
*.war
*.ear
*.zip
*.tar
*.gz
*.rar
*.7z
*.dmg
*.exe
*.msi
*.deb
*.rpm
*.apk
*.ipa

# 二进制文件
*.bin
*.dat
*.db
*.sqlite
*.sqlite3
*.log
*.tmp
*.temp
*.bak
*.swp
*.swo
*.cache
*.pid

# 媒体文件
*.png
*.jpg
*.jpeg
*.gif
*.bmp
*.ico
*.svg
*.webp
*.tiff
*.tif
*.psd
*.ai
*.eps
*.pdf
*.doc
*.docx
*.xls
*.xlsx
*.ppt
*.pptx
*.odt
*.ods
*.odp
*.rtf
*.tex
*.pdf
*.mp3
*.mp4
*.avi
*.mov
*.wmv
*.flv
*.webm
*.mkv
*.m4v
*.3gp
*.wav
*.flac
*.ogg
*.aac
*.m4a
*.wma
*.opus

# 系统文件
.DS_Store
Thumbs.db
desktop.ini
*.lnk
*.url
*.website

# IDE和编辑器文件
.vscode/
.idea/
*.sublime-project
*.sublime-workspace
*.swp
*.swo

# 版本控制
.git/
.svn/
.hg/
.bzr/

# 临时文件
*.tmp
*.temp
*.temp.*
*.bak
*.bak.*
*.old
*.orig
*.rej

# 缓存目录
.cache/
.npm/
.yarn/
.pnpm/
.cargo/
.go/
.dart_tool/
.flutter/
.gradle/
.maven/
.target/
.build/

# 测试覆盖率
coverage/
.nyc_output/
.jest/
.c8/
.coverage/
*.lcov

# 特殊目录
.cospec/
.roo/
`

// 配置常量
const MAX_FILES_PER_BATCH = 1000 // 每批处理的最大文件数
const MAX_TOTAL_FILES = 100000 // 最大总文件数限制，防止OOM
const WRITE_BUFFER_SIZE = 64 * 1024 // 64KB 写入缓冲区
const OPERATION_TIMEOUT_MS = 60 * 1000 // 60秒超时
const FILE_LIST = "files.txt"

// 常见的包含点的目录
const DOT_DIRECTORIES = [
  '.git',
  '.github',
  '.vscode',
  '.idea',
  '.venv',
  ".cospec",
  ".roo",
  '.node_modules',
  '.npm',
  '.yarn',
  '.pnpm',
  '.cache',
  '.temp',
  '.tmp',
  '.log',
  '.bak',
  '.swp',
  '.swo',
  '.DS_Store',
  'Thumbs.db'
]

/**
 * 生成文件列表工具
 * 将 source_dir 下的所有文件路径输出到 target_dir 下，输出文件名为 file_list.txt
 * 路径为相对 source_dir 的相对路径，只输出文件，不输出目录
 * 跳过 .gitignore/.rooignore/.coignore 中定义的忽略模式
 * 
 * 注意：此工具专为知识图谱提取功能设计，不建议在其他场景使用
 */
export async function generateFilesListTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const sourceDir: string | undefined = block.params.source_dir
	const targetDir: string | undefined = block.params.target_dir

	// 验证参数
	if (!sourceDir) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("generate_files_list")
		pushToolResult(await cline.sayAndCreateMissingParamError("generate_files_list", "source_dir"))
		return
	}

	if (!targetDir) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("generate_files_list")
		pushToolResult(await cline.sayAndCreateMissingParamError("generate_files_list", "target_dir"))
		return
	}

	// 计算绝对路径
	const absoluteSourcePath = path.resolve(cline.cwd, sourceDir)
	const absoluteTargetPath = path.resolve(cline.cwd, targetDir)
	const isOutsideWorkspace = isPathOutsideWorkspace(absoluteSourcePath) || isPathOutsideWorkspace(absoluteTargetPath)

	// 使用通用的工具类型，但添加特殊标识
	const sharedMessageProps: ClineSayTool = {
		tool: "newFileCreated", // 使用现有工具类型，避免修改全局接口
		path: getReadablePath(cline.cwd, removeClosingTag("source_dir", sourceDir) || ""),
		content: `生成文件列表: ${getReadablePath(cline.cwd, removeClosingTag("target_dir", targetDir) || "")}`,
		isOutsideWorkspace,
	}

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" } satisfies ClineSayTool)
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		cline.consecutiveMistakeCount = 0

		// 创建超时Promise
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`操作超时 (${OPERATION_TIMEOUT_MS/1000}秒)，可能目录过大或包含过多文件`))
			}, OPERATION_TIMEOUT_MS)
		})

		// 创建主要操作Promise
		const operationPromise = (async () => {
			// 检查源目录是否存在
			try {
				const sourceStat = await fsPromises.stat(absoluteSourcePath)
				if (!sourceStat.isDirectory()) {
					throw new Error(`源路径不是一个目录: ${sourceDir}`)
				}
			} catch (error) {
				throw new Error(`无法访问源目录: ${sourceDir}. ${error instanceof Error ? error.message : String(error)}`)
			}

			// 创建目标目录（如果不存在）
			try {
				await fsPromises.mkdir(absoluteTargetPath, { recursive: true })
			} catch (error) {
				throw new Error(`无法创建目标目录: ${targetDir}. ${error instanceof Error ? error.message : String(error)}`)
			}

			// 创建输出文件路径
			const outputFile = path.join(absoluteTargetPath, FILE_LIST)

			// 使用流式写入，避免大文件占用过多内存
			const writeStream = fs.createWriteStream(outputFile, { 
				encoding: "utf8",
				highWaterMark: WRITE_BUFFER_SIZE
			})

			let totalFiles = 0
			let processedFiles = 0

			try {
				// 创建写入Promise
				const writePromise = new Promise<void>((resolve, reject) => {
					writeStream.on('finish', () => resolve())
					writeStream.on('error', reject)
				})

				// 分批处理文件，避免一次性加载过多文件到内存
				await processFilesInBatches(
					absoluteSourcePath,
					async (batch) => {
						for (const filePath of batch) {
							if (totalFiles >= MAX_TOTAL_FILES) {
								throw new Error(`文件数量超过限制 (${MAX_TOTAL_FILES})，停止处理`)
							}
							// 只写入文件路径，忽略目录
							const hasValidExtension = 
    							filePath.includes('.') &&  // 包含后缀分隔符
    							filePath.lastIndexOf('.') < filePath.length - 1 &&  // .后有字符（避免类似"file."的无效后缀）
    							!filePath.endsWith('/');  // 排除以/结尾的目录路径
							if (!hasValidExtension) {
								continue
							}
							// 过滤常见的包含点的目录
							const isDotDirectory = DOT_DIRECTORIES.some(dir =>
								filePath === dir
							)
							if (isDotDirectory) {
								continue
							}
						
							// 使用流式写入，每行一个文件路径
							writeStream.write(filePath + '\n')
							totalFiles++
							processedFiles++

							// 每处理1000个文件报告一次进度
							if (processedFiles % 1000 === 0) {
								const progressMessage = JSON.stringify({
									...sharedMessageProps,
									content: `已处理 ${processedFiles} 个文件...`
								} satisfies ClineSayTool)
								await cline.ask("tool", progressMessage, false).catch(() => {})
							}
						}
					}
				)

				// 结束写入流
				writeStream.end()
				
				// 等待写入完成
				await writePromise
			} catch (error) {
				// 确保流被关闭
				writeStream.destroy()
				throw error
			}

			// 准备结果消息
			const result = `已成功生成文件列表\n\n源目录: ${sourceDir}\n目标目录: ${targetDir}\n输出文件: ${OUTPUT_PATHS.FILE_LIST}\n文件数量: ${totalFiles}`
			return result
		})()

		// 使用Promise.race实现超时机制
		const result = await Promise.race([operationPromise, timeoutPromise])

		const completeMessage = JSON.stringify({ ...sharedMessageProps, content: result } satisfies ClineSayTool)
		const didApprove = await askApproval("tool", completeMessage)

		if (!didApprove) {
			return
		}

		pushToolResult(result)
	} catch (error) {
		await handleError("生成文件列表", error)
	}
}

/**
 * 分批处理文件，避免一次性加载过多文件到内存
 * @param sourcePath 源路径
 * @param processBatch 处理一批文件的回调函数
 */
async function processFilesInBatches(
	sourcePath: string,
	processBatch: (batch: string[]) => Promise<void>
): Promise<void> {
	// 使用 listFiles 获取所有文件和目录
	const [allPaths] = await listFiles(sourcePath, true, Number.MAX_SAFE_INTEGER)

	// 创建忽略规则实例，复用现有机制
	const ignoreInstance = await createIgnoreInstance(sourcePath)

	const batch: string[] = []

	for (const fullPath of allPaths) {
		// 跳过目录（以/结尾的路径）
		if (fullPath.endsWith(path.sep)) {
			continue
		}

		// 计算相对路径
		const relativePath = path.relative(sourcePath, fullPath).replace(/\\/g, '/')
		
		// 检查是否应该忽略此文件
		if (ignoreInstance.ignores(relativePath)) {
			continue
		}

		batch.push(relativePath)

		// 当批次达到指定大小时处理
		if (batch.length >= MAX_FILES_PER_BATCH) {
			await processBatch([...batch]) // 传递副本
			batch.length = 0 // 清空批次
		}
	}

	// 处理最后一批文件
	if (batch.length > 0) {
		await processBatch(batch)
	}
}

/**
 * 创建忽略规则实例，支持 sourcePath 及其下一层子目录中的 ignore 文件
 * @param sourcePath 源路径
 */
export async function createIgnoreInstance(sourcePath: string): Promise<ReturnType<typeof ignore>> {
	const ignoreInstance = ignore()
	const ignoreFiles = ['.gitignore', '.rooignore', '.coignore']
	
	// 首先加载 sourcePath 目录下的 ignore 文件
	for (const ignoreFile of ignoreFiles) {
		const ignoreFilePath = path.join(sourcePath, ignoreFile)
		try {
			await fsPromises.access(ignoreFilePath)
			const content = await fsPromises.readFile(ignoreFilePath, 'utf8')
			ignoreInstance.add(content)
		} catch {
			// 文件不存在，忽略
		}
	}
	
	// 加载 sourcePath 下一层子目录中的 ignore 文件
	// TODO 增加相对路径，比如 .venv 的.gitignore 的内容是 '*'，不处理会忽略所有文件
	try {
		const entries = await fsPromises.readdir(sourcePath, { withFileTypes: true })
		
		for (const entry of entries) {
			// 只处理目录
			if (!entry.isDirectory()) {
				continue
			}
			const subDirPath = path.join(sourcePath, entry.name)
				
			// 检查该子目录中的 ignore 文件
			for (const ignoreFile of ignoreFiles) {
				const ignoreFilePath = path.join(subDirPath, ignoreFile)
				try {
					await fsPromises.access(ignoreFilePath)
					const content = await fsPromises.readFile(ignoreFilePath, 'utf8')
					// 切分内容，跳过#开头的注释
					const lines = content.split('\n').filter(line => {
						const trimmed = line.trim()
						return trimmed && !trimmed.startsWith('#')
					})
					// 处理子目录的ignore规则：确保只影响该子目录
					const processedLines = lines.map(line => {
						const trimmed = line.trim()
						// 保持特殊规则不变：以!开头的否定规则
						if (trimmed.startsWith('!')) {
							return trimmed
						}
						// 对于其他所有规则，都加上子目录前缀，确保只影响该子目录
						return entry.name + '/' + trimmed
					})
					ignoreInstance.add(processedLines.join('\n'))
				} catch {
					// 文件不存在，忽略
				}
			}
		}
	} catch {
		// 无法读取目录内容，忽略
	}
	// 自定义ignore规则，常见的非代码格式、二进制、图片、视频、构建目录、临时文件等等，防止项目没有ignore文件
	ignoreInstance.add(DEFAULT_IGNORE)
	// 添加忽略文件本身
	ignoreFiles.forEach(file => ignoreInstance.add(file))
	
	return ignoreInstance
}