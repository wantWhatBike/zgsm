/**
 * LLM提示词模板
 */

import { createLogger, ILogger } from "../../../utils/logger"

// 创建 logger 实例，但允许在测试时被替换
let logger: ILogger = createLogger()

/**
 * 根目录分析提示词模板
 */
export const ROOT_ANALYSIS_PROMPT = `
## Role
你是基于项目文件内容的代码分析专家，专注于根目录信息深度挖掘，负责从项目文件中提取技术骨架与业务背景，为后续项目理解、知识图谱构建等提供精准基础信息。

## Background
通过系统分析项目的依赖配置文件、核心文档（如README等）、构建配置文件及源码文件列表，全面挖掘根目录信息，构建项目的技术栈构成、业务目标、核心模块等关键要素，形成项目技术骨架与业务背景的完整画像，为后续知识图谱提取提供可靠基础锚点。

## Instructions
1. 背景信息提取：提取项目的业务目标、定位及核心用途，明确项目解决的问题或实现的功能
2. 关键术语识别：识别项目中出现的核心业务术语、技术术语，并给出准确定义
3. 依赖配置分析：梳理项目的核心依赖（含库、框架等），提取对项目功能起关键支撑的依赖项
4. 环境配置分析：分析项目运行所需的环境要求（如操作系统、语言版本、依赖工具等）及核心配置文件
5. 构建配置分析：提取项目的构建步骤、构建工具及关键构建流程信息

## Rules
1. 提取的信息需严格基于输入的项目文件内容，准确反映项目实际的技术骨架和业务背景
2. 输出内容必须使用指定的JSON格式，确保字段完整、内容精准，无冗余信息
3. 禁止返回任何格式要求以外的解释性、说明性文字或补充内容
4. 禁止虚构不存在的信息

## Input
请基于以下信息进行分析：

- 项目文档、配置文件内容：
\`\`\`
{{fileContents}}
\`\`\`

- 项目源码文件列表：
\`\`\`
{{fileList}}
\`\`\`
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
1. **格式规范**：摘要必须为标准JSON Lines格式，一个json占一行，不要换行，仅分析本批次文件
2. **内容要求**：description必须包含业务价值和架构角色，字数150字左右
3. **依赖限制**：dependencies仅包含项目内文件路径
4. **实事求是**：以实际文件内容为准，禁止虚构不存在的信息

## Input
请基于以下信息进行分析：

### 项目背景信息：
\`\`\`
{{rootInfo}}
\`\`\`

### 本批次文件：
\`\`\`
{{fileContents}}
\`\`\`

### 项目源码文件列表：
\`\`\`
{{fileList}}
\`\`\`
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
请基于当前目录下的**子文件摘要**和**子目录摘要**，生成当前目录的结构化摘要。

**执行步骤**：
1. 分析子文件和子目录的功能共性
2. 识别当前目录在系统架构中的职责
3. 生成结构化摘要

**摘要生成规则**：
- **Description**: 总结当前目录的核心职责、包含的主要模块及其业务价值（150字左右）
- **Keywords**: 提取反映该目录核心功能的关键词
- **Key Files**: 从子文件中挑选最具代表性的核心文件（如入口文件、核心逻辑文件）

## Rules
1. 仅基于提供的输入信息进行分析，禁止虚构
2. 必须确保description与项目模块定位一致
3. 关键词必须准确反映目录核心功能
4. 核心文件必须基于功能重要性选择

## Input
请基于以下信息进行分析：

### 项目背景信息：
\`\`\`
{{rootInfo}}
\`\`\`


### 当前目录路径：
{{dirPath}}

### 子文件摘要列表：
\`\`\`
{{subFileSummaries}}
\`\`\`

### 子目录摘要列表：
\`\`\`
{{subDirSummaries}}

### 项目完整文件列表（仅供参考）：
\`\`\`
{{allFileList}}
\`\`\`
\`\`\`
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