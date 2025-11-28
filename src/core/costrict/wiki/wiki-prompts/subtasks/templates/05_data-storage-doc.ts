import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ADVANCED_TOOL_STRATEGY } from "../../common/constants"

export const DATA_STORAGE_DOC_TEMPLATE = (workspace: string) => `# 数据与状态管理文档生成 (v3.0)

## 角色定义
您是技术文档撰写专家，负责生成数据存储与状态管理文档。根据项目类型，这可能涉及数据库设计、前端状态管理 (Store) 或文件系统结构。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
- **泛化支持**：
  - **Web**: 数据库表结构 (Schema), 缓存 (Redis), 消息队列 (MQ).
  - **Frontend**: 全局状态 (Redux/Vuex/Zustand), 本地存储 (LocalStorage).
  - **CLI/Lib**: 文件格式 (Config/Data Files), 内存数据结构.
- **证据强制**：表结构、State Interface 必须与代码完全一致。

## 输入参数
- **文档信息**：
  - docId: "05"
  - docName: "数据存储" (或 状态管理)
  - docFilename: "05_数据存储.md"
  - relatedSources: models/, entity/, store/, types/ 等
  - contextScope: 上下文范围
  - globalContext: 全局上下文
  - projectType: 项目类型
  - techStack: 技术栈
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：扫描定义
基于 \`contextScope\`，使用 \`list_code_definition_names\` 扫描模型/状态定义目录。

### 步骤2：提取结构证据 (EBR)
- **Web**: 提取 ORM Model / SQL DDL。
- **Frontend**: 提取 Store Definition / State Interface。
- **CLI/Lib**: 提取 Config Struct / Data Class。
- **证据要求**：必须获取完整的字段定义、类型注解。

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}05_数据存储.md\`

## 输出格式

\`\`\`markdown
# {{docName}}

<details>
<summary>相关源文件</summary>

- {{EXAMPLE_FILE_PATH}}
- ...

</details>

## 概述
本文档描述项目的数据结构、存储方案与状态管理机制。
> 💡 来源: [src/]

{{TYPE_SPECIFIC_INSTRUCTIONS}}

## 核心数据结构 / Schema

### 1. [模型/状态名称]

#### 结构定义证据 (Structure Evidence)

\`\`\`
// 摘自: {{EXAMPLE_FILE_PATH}}
{{CLASS_DEFINITION}}
// (必须展示真实存在的代码片段)
\`\`\`

#### 字段详情

| 字段 | 类型 | 约束/默认值 | 说明 |
|-----|------|------------|-----|
| [Field] | [Type] | [Constraint] | [Desc] |

> 💡 来源: [{{EXAMPLE_FILE_PATH}}]

---

### 2. [其他模型]
...

## 存储与持久化

### 配置与连接

\`\`\`
// 摘自: {{CONFIG_FILE}}
[Config Snippet]
\`\`\`

| 项目 | 值 | 说明 |
|-----|----|-----|
| 类型 | [Type] | DB/Cache/File |
| 位置 | [Path/URL] | 连接地址或文件路径 |

## 状态管理 (Frontend Only)

### Store 结构

| Store | 职责 | 对应的组件 |
|-------|-----|-----------|
| [StoreName] | [Desc] | [Components] |

### Action / Mutation

| Action | 说明 | 变更的数据 |
|--------|-----|-----------|
| [ActionName] | [Desc] | [StateField] |

\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. **证据优先**：必须先展示 Model/State 定义代码块，再列出字段表格。
2. **准确性**：字段类型和约束必须与代码证据完全一致。
3. **泛化适配**：
   - **Web**: 关注 Tables, Relations, Indexes.
   - **Frontend**: 关注 State Tree, Actions, Reducers.
   - **CLI**: 关注 File Formats (JSON/YAML), In-Memory Structs.
`;
