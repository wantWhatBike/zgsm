import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ANTI_HALLUCINATION_RULES, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const ARCHITECTURE_DOC_TEMPLATE = (workspace: string) => `# 代码架构文档生成 (v3.0)

## 角色定义
您是技术文档撰写专家，负责生成代码架构文档，帮助AI理解项目的目录结构、模块划分和依赖关系。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
${ANTI_HALLUCINATION_RULES}
- **基于事实绘图**：Mermaid 图中的每个节点必须对应真实存在的目录或文件。
- **依赖实证 (Evidence-Based Dependency)**：架构图中的每一条连线（A -> B）必须有代码级的引用证据（{{IMPORT_SYNTAX}}）。
- **物理映射**：架构图中的每个组件必须标注其对应的物理路径。

## 输入参数
- **文档信息**：
  - docId: "02"
  - docName: "代码架构"
  - docFilename: "02_代码架构.md"
  - relatedSources: 相关源目录列表
  - contextScope: 上下文范围
  - globalContext: 全局上下文
  - projectType: 项目类型
  - techStack: 技术栈
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：扫描目录结构与大纲
1. 使用 \`list_files\` 工具获取完整目录结构，重点关注核心源码目录。
2. 使用 \`list_code_definition_names\` 扫描核心模块入口文件，快速识别模块导出的核心类/接口，构建模块地图。

### 步骤2：构建依赖证据矩阵 (EBR)
1. **挑选核心节点**：基于 \`globalContext.entryPoints\` 和核心目录，确定架构图的关键节点。
2. **收集依赖证据**：
   - 对每个节点，使用 \`search_files\` 或 \`read_file\` 提取导入语句。
   - **证据要求**：\`Node A imports Node B (file: {{EXAMPLE_FILE_PATH}}, line: 10)\`。
   - 如果找不到引用证据，**严禁**在架构图中画线。

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}02_代码架构.md\`

## 输出格式

\`\`\`markdown
# 代码架构

<details>
<summary>相关源文件</summary>

- {{EXAMPLE_FILE_PATH}}
- ...

</details>

## 架构概述
[简述项目采用的架构模式（分层架构/DDD/微服务/插件化/模块化等）。必须引用 README 或入口文件。]
> 💡 来源: [README.md, {{EXAMPLE_FILE_PATH}}]

## 依赖证据矩阵 (Dependency Evidence)
**在绘制架构图前，先列出核心依赖证据：**

| 调用方 | 被调用方 | 证据类型 | 来源文件 |
|--------|----------|----------|----------|
| [Module A] | [Module B] | import | [path/to/file] |

## 目录结构

\`\`\`
project-root/
├── src/                      # 源代码根目录
│   ├── ...
\`\`\`
> 💡 来源: [list_files 输出]

## 核心架构图（图1）

> **注意**：节点名称必须包含文件路径，禁止使用抽象名称。

\`\`\`mermaid
graph TB
    subgraph 模块A[Module A]
        A[Component1<br/>(path/to/file)]
    end
    
    subgraph 模块B[Module B]
        B[Component2<br/>(path/to/file)]
    end
    
    A --> B
\`\`\`

> 💡 来源: [path/to/moduleA, path/to/moduleB]

## 核心交互流程（图2）

\`\`\`mermaid
sequenceDiagram
    participant Client
    participant A as path/to/fileA
    participant B as path/to/fileB

    Client->>A: Call
    A->>B: Call
\`\`\`

> 💡 来源: [path/to/fileA, path/to/fileB]

## 组件职责矩阵

| 组件 | 目录/文件 | 职责 | 关键依赖 |
|------|-----------|------|----------|
| [组件名] | [path] | [职责描述] | [依赖列表] |

> 💡 来源: [src/]

## 核心模块说明

### [模块名称] ([path])
**职责**：[描述]

| 文件 | 职责 | 依赖 |
|-----|-----|-----|
| [file] | [职责] | [依赖] |

来源: [path]

## 模块依赖关系

### 结构化依赖数据 (Machine Readable)

<module_dependency>
<module name="Module A" path="path/to/moduleA">
  <dependency>path/to/moduleB</dependency>
</module>
</module_dependency>

相关代码: src/

## 扩展性说明

### 如何新增功能
1. [步骤1]
2. [步骤2]

### 文件命名规范
- {{NAMING_CONVENTION}}

\`\`\`

${CODE_REFERENCE_RULES}

## 图表要求
- 必须至少包含两类图：架构结构图 + 核心流程图。
- 生成图前确认所有节点均来自真实目录/文件。
- 每个图表下方必须写明 \`相关代码: ...\`。

## 质量要求
1. **真实性**：目录结构必须与 \`list_files\` 结果完全一致。
2. **实证性**：架构图中的每一条连线，都必须能在“依赖证据矩阵”中找到对应的行。
3. **准确性**：Mermaid 图中的节点名称必须是真实的文件名或目录名。
4. **图表有效性**：如果某个层级在项目中不存在，禁止在图中画出该层。
`;
