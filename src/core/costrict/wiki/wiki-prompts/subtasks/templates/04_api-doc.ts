import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ANTI_HALLUCINATION_RULES, DEEP_ANALYSIS_RULES, ADVANCED_TOOL_STRATEGY } from "../../common/constants"

export const API_DOC_TEMPLATE = (workspace: string) => `# API 接口文档生成

## 角色定义
您是技术文档撰写专家，负责生成 API 接口文档，帮助 AI 快速查阅接口定义、参数、认证和错误码，从而正确调用或实现接口。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
${ANTI_HALLUCINATION_RULES}
${DEEP_ANALYSIS_RULES}
- **类型精确**：必须提取 Request/Response 的具体类型定义（TypeScript Interface / Go Struct），禁止仅列出字段名。
- **约束显性化**：必须提取字段级的校验规则（正则、范围、必填、默认值），这对于 AI 生成正确的调用代码至关重要。
- **实现映射**：每个接口必须精确指向实现它的函数（文件路径 + 函数名）。

## 输入参数
- **文档信息**：
  - docId: "04"
  - docName: "API接口文档"
  - docFilename: "04_API接口文档.md"
  - relatedSources: api/, routes/, controller/, middleware/, docs/swagger.yaml 等
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程
1. **扫描入口**：使用 \`list_code_definition_names\` 扫描 API 入口目录（如 src/api/, src/routes/），快速识别 Controller 类和 Handler 函数。
2. **提取定义**：
   - 对每个端点，使用 \`search_definitions\` 查找其 Request/Response 类型定义（Interface/Struct）。
   - 必须获取完整的类型定义代码块，包括注释（注释中常包含校验规则）。
3. **追踪实现**：
   - 如果接口定义与实现分离（如 Interface 在 api/，实现在 service/），使用 \`search_references\` 找到具体的实现函数。
4. **生成文档**：
   - 对每个端点提取：HTTP 方法、路径、认证方式、中间件、实现函数、请求/响应类型、错误码。
   - 若同时存在 REST 与 gRPC，需拆分模块分别列出。
5. 输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}04_API接口文档.md\`

## 输出格式

\`\`\`markdown
# API 接口文档

<details>
<summary>相关源文件</summary>

- src/api/user.ts
- src/routes/order.ts
- src/controller/paymentController.ts
- src/middleware/auth.ts
- docs/swagger.yaml
- api/codebase_syncer.proto
- ...

</details>

## 概述
本文档列出项目暴露的 REST/gRPC/WebSocket 等接口，涵盖请求结构、响应结构、认证要求和错误码。
> 💡 来源: [src/api/, docs/swagger.yaml]

## 基础信息

| 项目 | 值 |
|-----|----|
| Base URL | /api/v1 |
| 认证方式 | Bearer Token / API Key |
| 内容类型 | application/json |
| 全局中间件 | authMiddleware, errorHandler |

> 💡 来源: [src/routes/index.ts, src/middleware/auth.ts]

## 接口总览

| 模块 | 方法 | 路径 | 说明 | 认证 | 实现入口 |
|------|------|------|------|------|----------|
| 用户 | POST | /user/register | 用户注册 | 无 | src/api/user.ts#register |

> 💡 来源: [src/api/*]

---

## REST 接口

### 用户模块（src/api/user.ts）

#### POST /user/register — 用户注册

| 项目 | 说明 |
|-----|-----|
| 方法 | POST |
| 路径 | /user/register |
| 认证 | 无 |
| 中间件 | validatorMiddleware |
| 实现 | src/api/user.ts#register |

**请求类型定义**

\`\`\`typescript
// 摘自: src/types/api.ts
export interface RegisterRequest {
  /**
   * @pattern ^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$
   */
  email: string; // 必须
  
  /**
   * @minLength 8
   * @maxLength 32
   */
  password: string;
  
  name?: string;
}
\`\`\`
> 💡 来源: [src/types/api.ts]

**字段约束表 (Field Constraints)**

| 字段 | 类型 | 必填 | 约束条件 (Regex/Range) | 默认值 | 说明 |
|-----|------|-----|------------------------|-------|-----|
| email | string | 是 | Email 格式 | - | 用户邮箱 |
| password | string | 是 | len: [8, 32] | - | 密码 |
| name | string | 否 | - | "Guest" | 昵称 |

> 💡 来源: [src/types/api.ts, src/utils/validator.ts]

**响应类型定义**

\`\`\`typescript
// 摘自: src/types/api.ts
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}
\`\`\`
> 💡 来源: [src/types/api.ts]

**错误码**

| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | INVALID_PARAMS | 参数校验失败 |

> 💡 来源: [src/api/user.ts, src/utils/errors.ts]

#### POST /user/login — 用户登录

[同样结构：请求表 + 类型 + 响应 + 错误]

#### GET /user/profile — 获取用户信息

| Header | 值 | 说明 |
|--------|----|------|
| Authorization | Bearer {token} | 访问令牌 |

来源: src/api/user.ts, src/middleware/auth.ts

### 订单模块（src/api/order.ts）

[同上结构，需列出请求/响应类型、认证、中间件、实现入口]

---

## gRPC 接口（如存在）

| 服务 | RPC 方法 | 请求消息 | 响应消息 | 实现文件 |
|------|----------|----------|----------|----------|
| CodebaseSyncer | Sync | SyncRequest | SyncResponse | api/codebase_syncer.proto, internal/service/sync_service.go |

来源: api/*.proto, internal/service/*

---

## 通用错误码

| 状态码 | 错误码 | 说明 | 抛出位置 |
|--------|--------|------|----------|
| 400 | INVALID_PARAMS | 参数错误 | src/middleware/validator.ts |
| 401 | UNAUTHORIZED | 未认证 | src/middleware/auth.ts |
| 403 | FORBIDDEN | 权限不足 | src/middleware/auth.ts |
| 404 | NOT_FOUND | 资源不存在 | src/utils/errors.ts |
| 500 | INTERNAL_ERROR | 服务器错误 | src/middleware/errorHandler.ts |

## 类型定义速览

\`\`\`typescript
// 摘自: src/types/api.ts
export interface ErrorResponse {
  code: string
  message: string
  details?: Record<string, unknown>
}
\`\`\`

来源: src/types/api.ts

\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. **类型完整性**：必须展示完整的 Request/Response 类型定义代码块，不能只用表格。
2. **实现精准定位**：实现入口必须精确到函数名（如 \`#register\`）。
3. **真实性**：禁止输出不存在的接口；若检测到 swagger/proto 中定义但源码缺失，需标注“实现缺失”。
4. **协议分离**：若项目包含多协议，必须分节描述（REST/gRPC/WebSocket 等）。
5. 文档长度控制在 300-600 行。
`

