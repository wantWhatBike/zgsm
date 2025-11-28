import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ANTI_HALLUCINATION_RULES, DEEP_ANALYSIS_RULES, ADVANCED_TOOL_STRATEGY } from "../../common/constants"

export const BUSINESS_FLOW_DOC_TEMPLATE = (workspace: string) => `# 业务流程文档生成 (v3.0)

## 角色定义
您是技术文档撰写专家，负责生成业务流程文档，帮助AI理解项目的核心业务链路、算法逻辑、隐式规则和调用关系。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
${ANTI_HALLUCINATION_RULES}
${DEEP_ANALYSIS_RULES}
- **深度追踪 (DFS)**：必须像调试器一样，从入口文件开始，逐层追踪函数调用，直到数据落地或外部调用。
- **显性化隐式逻辑**：必须提取代码中隐含的业务规则（如：\`if (balance < amount) throw ...\`）。
- **泛化支持**：不仅支持 Web 业务流程，也支持 CLI 命令执行流程、库函数调用流程、算法执行流程。

## 输入参数
- **文档信息**：
  - docId: "03"
  - docName: "业务流程"
  - docFilename: "03_业务流程.md"
  - relatedSources: 相关业务代码目录
  - contextScope: 上下文范围
  - globalContext: 全局上下文
  - projectType: 项目类型
  - techStack: 技术栈
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：识别核心流程
- 基于 \`globalContext.entryPoints\` 挑选 3-5 个最关键的流程。
  - **Web**: 核心 API 请求处理 (e.g., 下单, 登录)。
  - **CLI**: 核心命令执行 (e.g., build, deploy)。
  - **Lib**: 核心功能调用 (e.g., 解析, 转换)。
  - **Frontend**: 关键用户交互 (e.g., 结账流程)。

### 步骤2：深度优先追踪 (DFS) 与证据提取 (EBR)
1. **定位入口**：从 \`entryPoints\` 开始。
2. **利用工具追踪**：
   - 优先使用 \`search_definitions\` 获取函数体。
   - 如果工具失败，使用正则搜索 \`{{FUNCTION_DEFINITION}}\` 定位并读取。
3. **提取证据块 (Evidence Block)**：
   - **必须**提取具体的代码片段作为业务规则的证据。
4. **逐层深入**：
   - **提取校验**：参数校验、权限检查。
   - **提取规则**：核心业务逻辑判断。
   - **数据落地**：追踪到 DB/File/Network 操作。

### 步骤3：绘制流程图
- 使用 Mermaid 时序图或流程图。
- **强制要求**：参与者名称必须包含文件名（如 \`{{EXAMPLE_FILE_PATH}}\`），严禁使用抽象名称。

### 步骤4：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}03_业务流程.md\`

## 输出格式

\`\`\`markdown
# 业务流程

<details>
<summary>相关源文件</summary>

- {{EXAMPLE_FILE_PATH}}
- ...

</details>

## 概述
本文档描述项目的核心业务流程、完整调用链与隐式业务规则。
> 💡 来源: [src/]

## 核心流程详解

### 1. [流程名称]

#### 证据块 (Evidence Block)
**在绘制图表前，先展示提取到的核心逻辑证据：**

\`\`\`
// 来源: {{EXAMPLE_FILE_PATH}}:45
{{EXAMPLE_CODE_SNIPPET}}
// 证据：核心校验逻辑
\`\`\`

#### 流程时序图

\`\`\`mermaid
sequenceDiagram
    participant Client
    participant A as {{EXAMPLE_FILE_PATH}}
    participant B as path/to/service
    participant C as path/to/repo

    Client->>A: Entry
    A->>A: Validate
    A->>B: Call Logic
    B->>C: Save Data
\`\`\`

> 💡 来源: [{{EXAMPLE_FILE_PATH}}, path/to/service]

#### 核心业务规则 (Business Rules)

| 规则ID | 规则描述 | 触发条件 | 结果/异常 | 代码位置 |
|--------|----------|----------|-----------|----------|
| BR-001 | [规则名] | [条件] | [结果] | [path:line] |

> 💡 来源: [path/to/file]

#### 调用链详情

| 步骤 | 文件 | 函数 | 逻辑描述 |
|-----|------|------|----------|
| 1 | {{EXAMPLE_FILE_PATH}} | [func] | [desc] |
| 2 | path/to/service | [func] | [desc] |

---

### 2. [其他核心流程]
...

## 数据流转总览 (可选)

\`\`\`mermaid
flowchart LR
    Input --> Process --> Output
\`\`\`

相关代码: src/

## 异常处理流程

| 异常类型 | 触发条件 | 处理位置 |
|---------|---------|---------|
| [ErrorType] | [Condition] | [Handler] |

来源: [path/to/error_handler]

\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. **深度优先**：必须追踪到底层操作（DB/IO/Network）为止。
2. **证据支撑**：每个业务规则必须对应一个“证据块”代码片段。
3. **真实性**：时序图中的每个参与者必须是真实存在的文件。
4. **泛化适配**：根据项目类型调整描述术语（如 CLI 项目不应出现 HTTP 状态码）。
`;
