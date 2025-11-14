/**
 * 根目录分析器 - 分析项目根目录信息
 */

import * as fs from "fs/promises"
import * as path from "path"
import { createHash } from "crypto"
import { LLMClient } from "../llm/LLMClient"
import { ROOT_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { RootInfo, LLMResponse, KnowledgeGraphError } from "../types"
import { KEY_CONFIG_FILES, KEY_DOCUMENT_FILES, BUILD_FILES, DEPLOYMENT_FILES, ERROR_CODES } from "../constants"
import { FileFilter } from "../tools/FileFilter"
import { FileListService } from "../tools/FileListService"
import { createLogger, ILogger } from "../../../utils/logger"

export class RootAnalyzer {
  private llmClient: LLMClient
  private workspacePath: string
  private logger: ILogger

  constructor(llmClient: LLMClient, workspacePath: string) {
    this.llmClient = llmClient
    this.workspacePath = workspacePath
    this.logger = createLogger()
  }

  /**
   * 分析项目根目录
   */
  async analyzeRoot(): Promise<RootInfo> {
    try {
      // 1. 收集关键文件
      const keyFiles = await this.collectKeyFiles()
      
      // 2. 读取文件内容
      const fileContents = await this.readKeyFiles(keyFiles)
      
      // 3. 获取项目文件列表
      const fileList = await this.getProjectFileList()
      
      // 4. 构建提示词
      const prompt = buildPrompt(ROOT_ANALYSIS_PROMPT, {
        fileContents: formatFileContents(fileContents),
        fileList: formatFileList(fileList.slice(0, 50)) // 限制文件列表长度
      })

      // 5. 发送LLM请求
      const response = await this.llmClient.sendStructuredRequest<RootInfo>(
        prompt,
        this.getRootInfoSchema()
      )

      if (!response.success || !response.data) {
        throw new KnowledgeGraphError(
          `根目录分析失败: ${response.error || '未知错误'}`,
          ERROR_CODES.INVALID_RESPONSE,
          false,
          false
        )
      }

      // 6. 验证和清理数据
      return this.validateAndCleanRootInfo(response.data)

    } catch (error) {
      if (error instanceof KnowledgeGraphError) {
        throw error
      }
      
      throw new KnowledgeGraphError(
        `根目录分析错误: ${error instanceof Error ? error.message : String(error)}`,
        ERROR_CODES.NETWORK_ERROR,
        true,
        true
      )
    }
  }

  /**
   * 收集关键文件
   */
  private async collectKeyFiles(): Promise<string[]> {
    const keyFiles: string[] = []
    
    // 检查配置文件
    for (const configFile of KEY_CONFIG_FILES) {
      const configPath = path.join(this.workspacePath, configFile)
      try {
        await fs.access(configPath)
        keyFiles.push(configFile)
      } catch {
        // 文件不存在，跳过
      }
    }
    
    // 检查文档文件
    for (const docFile of KEY_DOCUMENT_FILES) {
      if (docFile.endsWith('/')) {
        // 目录，检查是否存在
        const docPath = path.join(this.workspacePath, docFile)
        try {
          const stat = await fs.stat(docPath)
          if (stat.isDirectory()) {
            keyFiles.push(docFile)
          }
        } catch {
          // 目录不存在，跳过
        }
      } else {
        // 文件
        const docPath = path.join(this.workspacePath, docFile)
        try {
          await fs.access(docPath)
          keyFiles.push(docFile)
        } catch {
          // 文件不存在，跳过
        }
      }
    }
    
    // 检查构建文件
    for (const buildFile of BUILD_FILES) {
      const buildPath = path.join(this.workspacePath, buildFile)
      try {
        await fs.access(buildPath)
        keyFiles.push(buildFile)
      } catch {
        // 文件不存在，跳过
      }
    }
    
    // 检查部署文件
    for (const deployFile of DEPLOYMENT_FILES) {
      if (deployFile.endsWith('/')) {
        // 目录，检查是否存在
        const deployPath = path.join(this.workspacePath, deployFile)
        try {
          const stat = await fs.stat(deployPath)
          if (stat.isDirectory()) {
            keyFiles.push(deployFile)
          }
        } catch {
          // 目录不存在，跳过
        }
      } else {
        // 文件
        const deployPath = path.join(this.workspacePath, deployFile)
        try {
          await fs.access(deployPath)
          keyFiles.push(deployFile)
        } catch {
          // 文件不存在，跳过
        }
      }
    }
    
    // 检查README文件
    const readmeFiles = ['README.md', 'README.rst', 'README.txt', 'README']
    for (const readmeFile of readmeFiles) {
      const readmePath = path.join(this.workspacePath, readmeFile)
      try {
        await fs.access(readmePath)
        keyFiles.push(readmeFile)
        break // 只添加第一个找到的README
      } catch {
        // 文件不存在，继续尝试下一个
      }
    }
    
    return keyFiles
  }

  /**
   * 读取关键文件内容
   */
  private async readKeyFiles(filePaths: string[]): Promise<Array<{path: string, content: string}>> {
    const contents: Array<{path: string, content: string}> = []
    
    for (const filePath of filePaths) {
      try {
        const fullPath = path.join(this.workspacePath, filePath)
        const stat = await fs.stat(fullPath)
        
        if (stat.isFile() && stat.size < 1024 * 1024) { // 只读取小于1MB的文件
          const content = await fs.readFile(fullPath, 'utf-8')
          contents.push({
            path: filePath,
            content: this.truncateContent(content, 5000) // 限制内容长度
          })
        }
      } catch (error) {
        this.logger.warn(`[RootAnalyzer] 读取文件失败: ${filePath}`, error)
        // 继续处理其他文件
      }
    }
    
    return contents
  }

  /**
   * 获取项目文件列表
   */
  private async getProjectFileList(): Promise<string[]> {
    try {
      // 创建文件列表服务
      const fileListService = new FileListService()
      
      // 获取文件列表
      const files = await fileListService.getProjectFiles(this.workspacePath)
      
      // 过滤文件
      const filteredFiles = files.filter((file: string) => {
        const relativePath = path.relative(this.workspacePath, file)
        const fileFilter = new FileFilter()
        return fileFilter.shouldAnalyzeFile(relativePath)
      })
      
      return filteredFiles.map((file: string) => path.relative(this.workspacePath, file))
    } catch (error) {
      this.logger.warn('[RootAnalyzer] 获取文件列表失败:', error)
      return []
    }
  }

  /**
   * 截断内容
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content
    }
    
    return content.substring(0, maxLength) + '\n...（内容已截断）'
  }

  /**
   * 获取根信息模式
   */
  private getRootInfoSchema(): any {
    return {
      type: "object",
      properties: {
        project_positioning: { type: "string" },
        tech_stack: { 
          type: "array", 
          items: { type: "string" },
          maxItems: 10
        },
        core_modules: { 
          type: "array", 
          items: { type: "string" },
          maxItems: 10
        },
        entry_points: { 
          type: "array", 
          items: { type: "string" },
          maxItems: 5
        },
        key_terms: { 
          type: "object",
          additionalProperties: { type: "string" }
        },
        core_dependencies: { 
          type: "array", 
          items: { type: "string" },
          maxItems: 10
        },
        config_files: { 
          type: "array", 
          items: { type: "string" }
        },
        environment_requirements: { 
          type: "array", 
          items: { type: "string" }
        },
        build_steps: { 
          type: "array", 
          items: { type: "string" }
        },
        deployment_info: {
          type: "object",
          properties: {
            dockerfile: { type: "string" },
            docker_compose: { type: "string" },
            kubernetes: { type: "string" }
          }
        }
      },
      required: [
        "project_positioning", "tech_stack", "core_modules", 
        "entry_points", "key_terms", "core_dependencies"
      ]
    }
  }

  /**
   * 验证和清理根信息
   */
  private validateAndCleanRootInfo(rootInfo: RootInfo): RootInfo {
    // 确保所有必需字段都存在
    const cleaned: RootInfo = {
      project_positioning: rootInfo.project_positioning || "未指定项目定位",
      tech_stack: Array.isArray(rootInfo.tech_stack) ? rootInfo.tech_stack.slice(0, 10) : [],
      core_modules: Array.isArray(rootInfo.core_modules) ? rootInfo.core_modules.slice(0, 10) : [],
      entry_points: Array.isArray(rootInfo.entry_points) ? rootInfo.entry_points.slice(0, 5) : [],
      key_terms: typeof rootInfo.key_terms === 'object' ? rootInfo.key_terms : {},
      core_dependencies: Array.isArray(rootInfo.core_dependencies) ? rootInfo.core_dependencies.slice(0, 10) : [],
      config_files: Array.isArray(rootInfo.config_files) ? rootInfo.config_files : [],
      environment_requirements: Array.isArray(rootInfo.environment_requirements) ? rootInfo.environment_requirements : [],
      build_steps: Array.isArray(rootInfo.build_steps) ? rootInfo.build_steps : [],
      deployment_info: {
        dockerfile: rootInfo.deployment_info?.dockerfile,
        docker_compose: rootInfo.deployment_info?.docker_compose,
        kubernetes: rootInfo.deployment_info?.kubernetes
      }
    }
    
    return cleaned
  }

  /**
   * 获取缓存键
   */
  getCacheKey(): string {
    const content = `root_analysis:${this.workspacePath}:${Date.now()}`
    return createHash('sha256').update(content).digest('hex')
  }
}