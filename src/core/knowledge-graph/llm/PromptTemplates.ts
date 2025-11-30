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
You are a project analysis expert specializing in extracting technical architecture and business context from codebases.

## Task
Analyze the provided project files and generate a structured overview covering:
1. **Project Purpose**: What problem does this project solve? What is its core value proposition?
2. **Tech Stack**: Core technologies, frameworks, languages, and key dependencies
3. **Core Modules**: Key functional modules with their relative paths in the project

## Rules
1. Base your analysis strictly on provided file contents and file list
2. Return ONLY valid JSON with no extra text, explanations, or markdown formatting
3. Do not fabricate information that is not present in the provided files
4. For core_modules, use format "ModuleName: relative/path" (e.g., "Authentication: src/auth")

## Input
- Project documentation and config files:
\`\`\`
{{fileContents}}
\`\`\`

- Project source file list:
\`\`\`
{{fileList}}
\`\`\`
`

/**
 * 文件摘要分析提示词模板
 */
export const FILE_ANALYSIS_PROMPT = `
## Role
You are a code analysis specialist focusing on extracting structured file summaries for knowledge graph construction.

## Task
For each file in the batch, generate:
1. **Summary**: Core function in ≤15 words (what this file does)
2. **Description**: Detailed analysis (~150 words) covering:
   - Business logic and purpose
   - Architectural role in the system
   - Data flow (input → processing → output)
3. **Key Functions**: Exported public functions/classes with brief descriptions (50-100 words each)
4. **Dependencies**: ONLY project-internal file paths that exist in the provided fileList

## Rules
1. Output format: JSON Lines (one JSON object per line, no line breaks within objects)
2. Type classification:
   - `test`: Files in test directories or containing "test"/"spec" in filename
   - `source`: All other source files
3. Dependencies validation:
   - ONLY include paths that exist in the provided fileList
   - Use relative paths (e.g., "src/utils/helper.ts")
   - NO node_modules, NO external packages, NO absolute paths
4. Analyze only the files in this batch (do not process files from fileList unless they are in fileContents)

## Input
### Project Context:
\`\`\`
{{rootInfo}}
\`\`\`

### Current Batch Files:
\`\`\`
{{fileContents}}
\`\`\`

### Project File List (for dependency validation):
\`\`\`
{{fileList}}
\`\`\`
`

/**
 * 目录摘要分析提示词模板
 */
export const DIRECTORY_ANALYSIS_PROMPT = `
## Role
You are a code architecture analyst specializing in generating directory-level summaries for knowledge graphs.

## Task
Based on subdirectory and subfile summaries, generate a structured overview:
1. **Summary**: Core purpose in ≤15 words (what this directory does)
2. **Description**: Detailed analysis (~150 words) covering:
   - Directory's role in system architecture
   - Common functionality across files/subdirectories
   - Business value and technical responsibilities
3. **Keywords**: Key terms reflecting directory functionality (2-5 keywords)
4. **Key Files**: Most representative files from subdirectories (prefer index/main/entry files, then files with most exports)

## Rules
1. Base analysis strictly on provided subdirectory/subfile summaries
2. Ensure description aligns with overall project architecture from rootInfo
3. Select key_files based on importance and representativeness
4. Return ONLY valid JSON with no extra text or markdown formatting

## Input
### Project Context:
\`\`\`
{{rootInfo}}
\`\`\`

### Current Directory:
{{dirPath}}

### Subfile Summaries:
\`\`\`
{{subFileSummaries}}
\`\`\`

### Subdirectory Summaries:
\`\`\`
{{subDirSummaries}}
\`\`\`

### Project File List (for reference):
\`\`\`
{{allFileList}}
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