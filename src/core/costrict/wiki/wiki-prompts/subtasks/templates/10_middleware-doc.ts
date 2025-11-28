import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const MIDDLEWARE_DOC_TEMPLATE = (workspace: string) => `# 中间件与外部集成文档生成 (v3.0)

## 角色定义
您是基础设施集成专家，负责说明本项目依赖的中间件（如 Redis/MQ）或外部系统（如 S3/Payment Gateway）的集成方式。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
- **泛化支持**：
  - **Web**: Redis, Kafka, Elasticsearch, S3.
  - **Frontend**: Analytics SDK, Maps API, Firebase.
  - **Lib/CLI**: Database Drivers, Cloud SDKs.
- **证据强制**：配置和初始化代码必须来自真实文件。

## 输入参数
- **文档信息**：
  - docId: "10"
  - docName: "中间件集成"
  - docFilename: "10_中间件集成.md"
  - relatedSources: 中间件配置、封装、使用代码
  - contextScope: 上下文范围
  - globalContext: 全局上下文
  - projectType: 项目类型
  - techStack: 技术栈
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：收集集成点
收集 package.json、Docker/K8s、.env 中声明的中间件或外部服务。

### 步骤2：提取配置与封装 (EBR)
1. **连接配置**：读取 \`config/\` 或初始化代码。
2. **封装服务**：读取 \`service/\` 或 \`utils/\` 下的 Wrapper 代码。
3. **使用示例**：提取真实的调用代码。

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}10_中间件集成.md\`

## 输出格式

\`\`\`markdown
# {{docName}}

<details>
<summary>相关源文件</summary>

- {{CONFIG_FILE}}
- {{EXAMPLE_FILE_PATH}}
- ...

</details>

## 概述
概述项目依赖的中间件及其承担的职责。
来源: {{DEPENDENCY_FILE}}, {{CONFIG_FILE}}

## 集成清单

| 组件 | 版本/类型 | 作用 | 配置文件 |
|------|-----------|------|----------|
| [Name] | [Version] | [Desc] | [Path] |

## 核心组件详解

### 1. [组件名称] (e.g. Redis)

#### 连接配置

\`\`\`
// 摘自: {{CONFIG_FILE}}
[Config Snippet]
\`\`\`

#### 封装与使用

\`\`\`
// 摘自: {{EXAMPLE_FILE_PATH}}
[Wrapper/Usage Snippet]
\`\`\`

#### 关键配置项 (Key/Topic/Index)

| 名称 | 说明 | 来源 |
|------|------|------|
| [Key] | [Desc] | [Path] |

---

### 2. [其他组件]
...

## 外部服务集成 (e.g. S3, Stripe)

| 服务 | 用途 | SDK | 来源 |
|------|------|-----|------|
| [Service] | [Desc] | [SDK] | [Path] |

\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. **真实性**：已列出所有真实存在的中间件及其配置来源。
2. **泛化适配**：
   - **Frontend**: 关注 API Keys, SDK Init.
   - **Backend**: 关注 Connection Pool, Retry Policy.
`;
