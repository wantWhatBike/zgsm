import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ANTI_HALLUCINATION_RULES, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const OVERVIEW_DOC_TEMPLATE = (workspace: string) => `# 项目概览文档生成 (v3.0)

## 角色定义
您是技术文档撰写专家，负责生成项目概览文档，帮助AI和开发者快速理解项目全貌。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
${ANTI_HALLUCINATION_RULES}
- **事实优先**：技术栈版本、配置项名称必须直接从配置文件（{{DEPENDENCY_FILE}}, {{CONFIG_FILE}}）中提取。
- **文档优先服务AI**（生成代码、写测试、构建运行调试），其次服务人（校验、理解）。

## 输入参数
- **文档信息**：
  - docId: "01"
  - docName: "项目概览"
  - docFilename: "01_项目概览.md"
  - relatedSources: 相关源文件列表
  - contextScope: 上下文范围
  - globalContext: 全局上下文
  - projectType: 项目类型
  - techStack: 技术栈
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：提取技术栈证据 (EBR)
1. **依赖分析**：
   - 读取 \`{{DEPENDENCY_FILE}}\` 等文件。
   - **证据要求**：必须提取核心依赖（框架、DB驱动）的版本号定义行。
2. **入口分析**：
   - 读取 \`globalContext.entryPoints\` 指定的文件。
   - **证据要求**：提取应用启动代码（如 \`{{FUNCTION_DEFINITION}}\` 或启动命令）。

### 步骤2：提取核心信息
1. **功能提取**：结合 README 和入口代码，总结核心功能。
2. **配置分析**：读取 \`{{CONFIG_FILE}}\` 或 \`config/\`，提取关键配置项。

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}01_项目概览.md\`

## 输出格式

\`\`\`markdown
# 项目概览

<details>
<summary>相关源文件</summary>

- README.md
- {{DEPENDENCY_FILE}}
- {{EXAMPLE_FILE_PATH}}
- {{CONFIG_FILE}}
- ...

</details>

## 项目简介
[项目定位和核心价值，100字以内]
> 💡 来源: [README.md]

## 技术栈

**依赖版本证据 (Dependency Evidence)**

\`\`\`
// 摘自: {{DEPENDENCY_FILE}}
[展示真实存在的依赖配置片段]
\`\`\`

| 类别 | 技术 | 版本 | 用途 | 来源文件 |
|-----|-----|-----|-----|----------|
| 语言 | {{techStack.language}} | [版本] | 主要开发语言 | {{DEPENDENCY_FILE}} |
| 框架 | {{techStack.framework}} | [版本] | 核心框架 | {{DEPENDENCY_FILE}} |
| ... | ... | ... | ... | ... |

> 💡 来源: [{{DEPENDENCY_FILE}}]

## 项目结构概览

\`\`\`
project-root/
├── src/                 # 源代码目录
│   ├── ...
├── {{CONFIG_FILE}}      # 配置文件
├── test/                # 测试文件
└── ...
\`\`\`

> 💡 来源: [list_files 输出]

## 核心功能

| 功能模块 | 说明 | 入口文件 |
|---------|-----|---------|
| [模块1] | [说明] | [path/to/entry] |
| [模块2] | [说明] | [path/to/entry] |

> 💡 来源: [src/]

## 快速开始

### 环境要求
- [语言运行时] >= [版本]
- [数据库] >= [版本]

> 💡 来源: [{{DEPENDENCY_FILE}}, README.md]

### 安装步骤

\`\`\`bash
# 1. 克隆项目
git clone [repo-url]

# 2. 安装依赖
{{EXAMPLE_COMMAND}}

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置数据库等

# 4. 启动服务
[启动命令]
\`\`\`

来源: README.md, {{DEPENDENCY_FILE}}

### 关键配置项

| 配置项 | 说明 | 默认值 | 配置文件 |
|-------|-----|-------|---------|
| [KEY] | [说明] | [Value] | {{CONFIG_FILE}} |

> 💡 来源: [{{CONFIG_FILE}}]

## 开发命令

| 命令 | 说明 |
|-----|-----|
| [command] | [说明] |

> 💡 来源: [{{DEPENDENCY_FILE}}]
\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. **证据优先**：必须先展示依赖配置文件片段，再列出技术栈表格。
2. **真实性**：技术栈版本必须精确匹配配置文件。
3. **准确性**：项目结构树必须基于 \`list_files\` 的真实输出。
4. **配置完整性**：配置项必须从真实文件提取。
`;
