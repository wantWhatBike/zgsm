/**
 * 根目录分析器 - 分析项目根目录信息
 */

import * as fs from "fs/promises"
import * as path from "path"
import { createHash } from "crypto"
import { LLMClient } from "../llm/LLMClient"
import { ROOT_ANALYSIS_PROMPT, buildPrompt, formatFileContents, formatFileList } from "../llm/PromptTemplates"
import { RootInfo, KnowledgeGraphError, KnowledgeGraphConfig, FileInfo } from "../types"
import { ERROR_CODES, KEY_FILE_PATTERNS } from "../constants"
import { FileFilter } from "../tools/FileUtils"
import { FileService } from "../tools/FileService"
import { createLogger, ILogger } from "../../../utils/logger"

export class RootAnalyzer {
  private llmClient: LLMClient
  private workspacePath: string
  private  maxKeyFiles: number
  private logger: ILogger
  private config: KnowledgeGraphConfig

  constructor(llmClient: LLMClient, 
    workspacePath: string, 
    config: KnowledgeGraphConfig,
    maxKeyFiles: number = 10
    ) {
    this.llmClient = llmClient
    this.workspacePath = workspacePath
    this.logger = createLogger()
    this.config = config
    this.maxKeyFiles = maxKeyFiles
  }

  /**
   * 分析项目根目录
   */
  async analyzeRoot(files: FileInfo[]): Promise<RootInfo> {
    
    try {
      this.logger.info('[RootAnalyzer] 开始根目录分析')
      
      // 1. 收集关键文件
      const keyFiles = await this.collectKeyFiles()
      this.logger.info(`[RootAnalyzer] 收集到关键文件数量: ${keyFiles.length}`)
      this.logger.info(`[RootAnalyzer] 关键文件列表: ${keyFiles.join(', ')}`)
      
      // 2. 读取文件内容
      const fileContents = await this.readKeyFiles(keyFiles)
      this.logger.info(`[RootAnalyzer] 成功读取文件数量: ${fileContents.length}`)
      
      // 3. 获取项目we列表
      const fileList = files.map(f=>f.path)
      this.logger.info(`[RootAnalyzer] 项目文件列表数量: ${fileList.length}`)
      
      // 4. 验证输入内容
      const formattedFileContents = formatFileContents(fileContents)
      const formattedFileList = formatFileList(fileList)
      
      this.logger.info(`[RootAnalyzer] 格式化文件内容长度: ${formattedFileContents.length}`)
      this.logger.info(`[RootAnalyzer] 格式化文件列表长度: ${formattedFileList.length}`)
      
      // 确保有足够的内容进行分析
      if (formattedFileContents.trim().length === 0 && formattedFileList.trim().length === 0) {
        throw new KnowledgeGraphError(
          "没有找到可分析的项目文件，请检查工作空间是否包含有效的项目文件",
          ERROR_CODES.FILE_READ_ERROR,
          false,
          false
        )
      }
      
      // 4. 构建提示词
      const prompt = buildPrompt(ROOT_ANALYSIS_PROMPT, {
        fileContents: formattedFileContents,
        fileList: formattedFileList
      })
      
      this.logger.info(`[RootAnalyzer] 提示词长度: ${prompt.length}`)
      
      // 验证提示词不为空
      if (prompt.trim().length === 0) {
        throw new KnowledgeGraphError(
          "构建的提示词为空，无法进行根目录分析",
          ERROR_CODES.INVALID_RESPONSE,
          false,
          false
        )
      }

      // 5. 发送LLM请求
      this.logger.info('[RootAnalyzer] 即将发送LLM请求，准备调用sendStructuredRequest')
      const response = await this.llmClient.sendStructuredRequest<RootInfo>(
        prompt,
        this.getRootInfoSchema(),
        {
          systemPrompt: '你是代码分析专家，专门分析项目结构和技术栈。请严格按照JSON格式返回分析结果。'
        }
      )
      this.logger.info('[RootAnalyzer] LLM请求已发送，等待响应')

      if (!response.success || !response.data) {
        throw new KnowledgeGraphError(
          `根目录分析失败: ${response.data || '未知错误'}`,
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
   * 按优先级收集关键文件（文档 > 依赖配置 > 项目配置 > 构建部署）
   * @returns 关键文件绝对路径数组（数量 ≤ maxKeyFiles）
   */
  private async collectKeyFiles(): Promise<string[]> {
    const workspace = this.workspacePath;
    if (!workspace) {
      this.logger.warn('工作目录路径为空，无法收集文件');
      return [];
    }


    // 2. 大小写不敏感的模式匹配函数
    const isMatch = (filename: string, patterns: string[]): boolean => {
      const lowerFilename = filename.toLowerCase();
      return patterns.some(pattern => {
        const lowerPattern = pattern.toLowerCase();
        // 前缀匹配（如dockerfile*）
        if (lowerPattern.endsWith('*')) {
          const prefix = lowerPattern.slice(0, -1);
          return lowerFilename.startsWith(prefix);
        }
        // 后缀匹配（如*.csproj）
        if (lowerPattern.startsWith('*.')) {
          const suffix = lowerPattern.slice(1);
          return lowerFilename.endsWith(suffix);
        }
        // 精确匹配（如package.json）
        return lowerFilename === lowerPattern;
      });
    };

    // 3. 收集指定目录中符合模式的文件（返回绝对路径）
    const collectFilesInDir = async (dir: string, patterns: string[]): Promise<string[]> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries
          .filter(entry => entry.isFile() && isMatch(entry.name, patterns))
          .map(entry => path.resolve(dir, entry.name)); // 确保绝对路径
      } catch (error) {
        this.logger.warn(`无法读取目录 ${dir}，已跳过`, error as Error);
        return [];
      }
    };

    // 4. 按优先级收集文件（去重+数量控制）
    const collectedPaths = new Set<string>(); // 用于去重
    const result: string[] = [];

    for (const patterns of KEY_FILE_PATTERNS) {
      // 先收集根目录文件（根目录优先级高于子目录）
      const rootFiles = await collectFilesInDir(workspace, patterns);
      for (const file of rootFiles) {
        if (!collectedPaths.has(file)) {
          collectedPaths.add(file);
          result.push(file);
          if (result.length >= this.maxKeyFiles) {
            return result; // 达到最大数量，直接返回
          }
        }
      }

      // 再收集一级子目录文件
      const subDirs = (await fs.readdir(workspace, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => path.resolve(workspace, entry.name));

      for (const subDir of subDirs) {
        const subFiles = await collectFilesInDir(subDir, patterns);
        for (const file of subFiles) {
          if (!collectedPaths.has(file)) {
            collectedPaths.add(file);
            result.push(file);
            if (result.length >= this.maxKeyFiles) {
              return result; // 达到最大数量，直接返回
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * 读取关键文件内容
   */
  private async readKeyFiles(filePaths: string[]): Promise<Array<{path: string, content: string}>> {
    const contents: Array<{path: string, content: string}> = []
    
    for (const filePath of filePaths) {
      try {
        const stat = await fs.stat(filePath)
        
        if (stat.isFile() && stat.size < this.config.fileSizeLimit) { 
          const content = await fs.readFile(filePath, 'utf-8')
          contents.push({
            path: filePath,
            content: this.truncateContent(content, this.config.fileLinesLimit) // 限制内容长度
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
   * 截断内容
   */
  private truncateContent(content: string, maxLines: number): string {
    let lines = content.split("\n")
    if (lines.length <= maxLines) {
      return content
    }
    return lines.slice(0, maxLines).join("\n") + "\n...(内容已被截断)"    
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
      project_positioning: rootInfo.project_positioning || "",
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