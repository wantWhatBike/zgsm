/**
 * LLM提示词模板
 */

import { RootInfo } from "../types"
import { createLogger, ILogger } from "../../../utils/logger"

// 创建 logger 实例，但允许在测试时被替换
let logger: ILogger = createLogger()

/**
 * 根目录分析提示词模板
 */
export const ROOT_ANALYSIS_PROMPT = `
## Role
你是代码分析专家，负责根目录信息挖掘，提取项目技术骨架与业务背景，为全流程提供背景信息。

## Background
根目录信息深度挖掘，通过分析依赖配置、核心文档和构建信息，构建项目技术骨架与业务背景，为后续知识图谱提取提供基础锚点。

## Instructions
1. 背景信息提取
2. 依赖配置分析
3. 环境配置分析
4. 构建配置分析

## Rules
1. 确保提取的信息准确反映项目技术骨架和业务背景
2. 使用结构化markdown格式，包含清晰的层级标题
3. 禁止返回除输出格式要求以外的任何解释性、说明内容

## Output
请严格按照以下JSON格式返回，不要包含任何其他内容：
\`\`\`json
{
  "project_positioning": "项目目标和定位描述",
  "tech_stack": ["技术1", "技术2", "技术3"],
  "core_modules": ["模块1", "模块2", "模块3"],
  "entry_points": ["入口文件1", "入口文件2"],
  "key_terms": {
    "术语1": "定义说明1",
    "术语2": "定义说明2"
  },
  "core_dependencies": ["依赖1", "依赖2", "依赖3"],
  "config_files": ["配置文件1", "配置文件2"],
  "environment_requirements": ["环境要求1", "环境要求2"],
  "build_steps": ["构建步骤1", "构建步骤2"],
  "deployment_info": {
    "dockerfile": "Dockerfile路径（如果有）",
    "docker_compose": "docker-compose路径（如果有）",
    "kubernetes": "k8s部署文件路径（如果有）"
  }
}
\`\`\`

## Input
请分析以下项目文件内容：

{{fileContents}}

项目文件列表：
{{fileList}}
`

/**
 * 文件摘要分析提示词模板
 */
export const FILE_ANALYSIS_PROMPT = `
## Role
你是一个专业的技术文档分析师，专注于代码库分析与结构化文档生成。你擅长从复杂代码中提取关键信息，生成标准化摘要。

## Background
文件摘要是知识图谱构建的基础数据，通过结构化方式记录每个文件的功能、依赖和价值，为后续目录摘要和全局关联分析提供支持。每个摘要需要准确反映文件在业务流程中的具体作用、数据处理方式和架构定位。

## Instructions
**分析优先级**：
- **核心业务逻辑**：文件解决的主要问题
- **架构定位**：在系统中的角色和职责
- **关键函数**：对外提供的主要功能
- **数据流向**：输入输出和处理过程
- **依赖关系**：与其他文件的关联

**分析要求：**
- 识别文件在业务流程中的具体作用
- 描述数据处理方式（输入→处理→输出）
- 说明对外接口功能（API、函数、类等）
- 明确在系统架构中的层级定位
- 只提取项目内依赖，排除外部库

## Rules
1. **严格边界**：仅处理当前组内文件
2. **格式规范**：摘要必须为标准JSON Lines格式，一个json占一行，不要换行
3. **内容要求**：description必须包含业务价值和架构角色，字数150字左右
4. **依赖限制**：dependencies仅包含项目内文件路径

## Output
请严格按照以下JSON数组格式返回，不要包含任何其他内容：
\`\`\`json
[
  {
    "path": "完整相对路径（以仓库根目录为起点）",
    "type": "source",
    "description": "150字左右，突出核心业务逻辑和架构角色",
    "keywords": ["3-5个关键词，按重要性排序"],
    "core_functions": {
      "函数名1": "功能描述（50~100字，突出函数功能、业务价值）",
      "函数名2": "功能描述（50~100字，突出函数功能、业务价值）"
    },
    "dependencies": ["项目内依赖文件路径（相对根目录）"],
    "timestamp": "2025-10-27 11:29:52",
    "size": 0,
    "lastModified": 0
  }
]
\`\`\`

注意：
- type字段必须是以下值之一：source、config、document、test
- 如果分析多个文件，请为每个文件返回一个对象
- 数组中的每个对象都必须包含所有必需字段

## Input
项目背景信息：
{{rootInfo}}

待分析文件组：
{{fileContents}}

项目文件列表：
{{fileList}}
`

/**
 * 目录摘要分析提示词模板
 */
export const DIRECTORY_ANALYSIS_PROMPT = `
## Role
你是一个专业的代码架构分析师，擅长通过分析代码库结构和文件内容，生成精准的目录摘要，构建清晰的知识图谱层级关系。

## Background
目录摘要是构建知识图谱层级关系的关键环节。通过分析目录内文件的共性功能、依赖关系和业务关联，形成目录的整体定位和协作关系，为全局关联分析提供基础。准确的目录摘要能够帮助开发者快速理解代码库结构，提高代码导航和维护效率。

## Instructions
目录摘要生成，基于文件摘要生成目录自身的摘要。（要处理到最深一层的目录）

**执行步骤**：
1. 背景信息获取
2. 文件摘要分析
3. 摘要生成：为每个目录生成结构化摘要信息

**摘要生成规则**：
- 分析目录内文件的共性功能和协作关系
- 识别目录在整体项目架构中的定位

## Rules
1. 必须基于文件摘要生成目录摘要，不得自行推测
2. 必须确保description与项目模块定位一致
3. 必须处理到最深一层目录，不跳过任何子目录
4. 关键词必须准确反映目录核心功能
5. 核心文件必须基于功能重要性选择，而非文件大小
6. 涉及路径，统一使用相对项目根目录的相对路径
7. 务必一个json占一行，不要换行

## Output
请严格按照以下JSON格式返回，不要包含任何其他内容：
\`\`\`json
{
  "path": "完整目录路径（以仓库根目录为起点）",
  "type": "功能模块/工具集/配置",
  "description": "整体定位（150字左右），详细描述目录在项目中的核心功能、架构角色、业务价值和技术特点",
  "keywords": ["2-5个核心关键词"],
  "key_files": ["1-5个核心文件路径（基于功能重要性）"]
}
\`\`\`

## Input
项目背景信息：
{{rootInfo}}

项目文件列表：
{{fileSimpleSummaryList}}
`

/**
 * 依赖关系分析提示词模板
 */
export const DEPENDENCY_ANALYSIS_PROMPT = `
## Role
你是一个专业的软件架构师，擅长分析代码依赖关系，构建项目依赖关系图。

## Background
基于文件摘要和目录摘要中的依赖信息，生成项目核心功能依赖关系图，帮助理解项目架构和模块间的关系。

## Instructions
1. 分析文件和目录间的依赖关系
2. 识别核心依赖路径
3. 构建依赖关系图
4. 计算依赖强度

## Rules
1. 只分析项目内依赖，排除外部库
2. 基于实际的import、reference等关系
3. 使用标准化的依赖类型
4. 计算依赖强度（0-1之间）

## Output
请严格按照以下JSON格式返回，不要包含任何其他内容：
\`\`\`json
[
  {
    "from": "源文件路径",
    "to": "目标文件路径",
    "type": "import/reference/inheritance/composition",
    "strength": 0.8,
    "timestamp": "2025-10-27 11:29:52"
  }
]
\`\`\`

## Input
项目背景信息：
{rootInfo}

文件摘要列表：
{fileSummaries}

目录摘要列表：
{directorySummaries}
`

/**
 * 搜索查询提示词模板
 */
export const SEARCH_QUERY_PROMPT = `
## Role
你是一个专业的代码搜索引擎，能够根据用户查询从知识图谱中检索相关信息。

## Background
知识图谱包含了项目的结构化信息，包括文件摘要、目录摘要和依赖关系。需要根据用户的查询意图，返回最相关的信息。

## Instructions
1. 理解用户查询意图
2. 匹配相关的文件、目录或功能
3. 计算相关性得分
4. 返回结构化的搜索结果

## Rules
1. 只返回项目内的相关信息
2. 按相关性排序
3. 提供清晰的描述和上下文
4. 支持模糊匹配

## Output
请返回以下JSON格式的搜索结果：
\`\`\`json
[
  {
    "type": "file|directory|function|dependency",
    "path": "相关路径",
    "name": "名称",
    "description": "描述信息",
    "relevance": 0.9,
    "highlights": ["匹配的关键词1", "匹配的关键词2"]
  }
]
\`\`\`

## Input
用户查询：{query}

知识图谱数据：
{knowledgeGraphData}
`

/**
 * 构建提示词内容
 */
export function buildPrompt(template: string, variables: Record<string, string>): string {
  let result = template
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{${key}}}`, 'g')
    result = result.replace(placeholder, value)
  }
  
  return result.trim()
}

/**
 * 验证JSON响应格式
 */
export function validateJsonResponse<T>(response: string, schema: any): T | null {
  try {
    // 清理响应
    const cleaned = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
    
    // 找到JSON开始和结束位置
    const startIndex = cleaned.indexOf('{')
    const endIndex = cleaned.lastIndexOf('}')
    
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      // 尝试解析数组
      const arrayStart = cleaned.indexOf('[')
      const arrayEnd = cleaned.lastIndexOf(']')
      
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayStart < arrayEnd) {
        const jsonStr = cleaned.substring(arrayStart, arrayEnd + 1)
        return JSON.parse(jsonStr)
      }
      
      return null
    }
    
    const jsonStr = cleaned.substring(startIndex, endIndex + 1)
    return JSON.parse(jsonStr)
    
  } catch (error) {
    logger.error('JSON解析失败:', error)
    return null
  }
}

/**
 * 格式化文件内容用于提示词
 */
export function formatFileContents(files: Array<{path: string, content: string}>): string {
  return files.map(file => 
    `文件: ${file.path}\n` +
    `内容:\n${file.content}\n` +
    '---\n'
  ).join('\n')
}

/**
 * 格式化文件列表
 */
export function formatFileList(files: string[]): string {
  return files.map(file => `- ${file}`).join('\n')
}

/**
 * 格式化摘要列表
 */
export function formatSummaries(summaries: any[]): string {
  return summaries.map(summary => 
    JSON.stringify(summary)
  ).join('\n')
}