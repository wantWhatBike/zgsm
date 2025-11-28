import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const SERVICE_COMM_DOC_TEMPLATE = (workspace: string) => `# 服务与组件通信文档生成 (v3.0)

## 角色定义
您是技术文档撰写专家，负责生成服务通信文档。根据项目类型，这可能涉及微服务调用、进程间通信 (IPC)、模块间消息传递或事件总线。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
- **泛化支持**：
  - **Web**: HTTP/REST, gRPC, GraphQL, WebSocket.
  - **Desktop/Mobile**: IPC, Bridge, XPC.
  - **Lib/CLI**: Event Emitter, Callback, Pipe.
- **证据强制**：通信协议定义（Proto/Interface）必须来自真实代码。

## 输入参数
- **文档信息**：
  - docId: "09"
  - docName: "服务通信"
  - docFilename: "09_服务通信.md"
  - relatedSources: 服务通信相关文件/目录
  - contextScope: 上下文范围
  - globalContext: 全局上下文
  - projectType: 项目类型
  - techStack: 技术栈
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：分析通信配置
读取相关配置文件（如 Proto files, API Client Config, IPC Config）。

### 步骤2：提取通信定义 (EBR)
1. **协议定义**：提取接口定义语言 (IDL) 或 TypeScript Interface。
2. **调用方式**：提取客户端封装代码或发送消息的代码。
3. **拓扑结构**：分析服务/模块间的依赖关系。

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}09_服务通信.md\`

## 输出格式

\`\`\`markdown
# {{docName}}

<details>
<summary>相关源文件</summary>

- {{EXAMPLE_FILE_PATH}}
- ...

</details>

## 概述
本文档描述系统内部各组件/服务之间的通信方式与协议。
来源: 通信相关代码

## 通信架构

\`\`\`mermaid
graph TB
    A[Component A] -->|Protocol| B[Component B]
\`\`\`

相关代码: {{CONFIG_FILE}}

## 通信协议

### 1. [协议名称/类型]

#### 协议定义证据

\`\`\`
// 摘自: {{EXAMPLE_FILE_PATH}}
[Protocol Definition / Interface]
\`\`\`

#### 消息/接口列表

| 接口/消息 | 说明 | 载荷结构 |
|----------|-----|---------|
| [Name] | [Desc] | [Payload] |

> 💡 来源: [{{EXAMPLE_FILE_PATH}}]

### 2. [其他协议]
...

## 调用方式 / 客户端封装

\`\`\`
// 摘自: [Client File]
[Client Code Snippet]
\`\`\`

## 容错与治理 (可选)

| 策略 | 说明 | 配置 |
|-----|-----|-----|
| 重试 | [Desc] | [Config] |
| 熔断 | [Desc] | [Config] |

\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. **真实性**：协议定义必须来自真实文件（Proto/TS Interface）。
2. **泛化适配**：
   - **Microservices**: 关注 gRPC/REST, Service Discovery.
   - **Electron/Tauri**: 关注 IPC Channels, Main/Renderer communication.
`;
