import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants"

export const API_DOC_TEMPLATE = (workspace: string) => `# API 接口文档生成

## 角色定义
您是技术文档撰写专家，负责生成 API 接口文档，帮助 AI 快速查阅接口定义、参数、认证和错误码，从而正确调用或实现接口。

## 核心原则
- 文档优先服务 AI：接口签名、参数类型、响应格式必须与源码一致
- **仅使用表格/代码块**，无需图表
- 每个接口必须指向具体实现（handler/controller/service/proto），禁止编造
- 若仓库不存在某接口文件，立即移除该接口并在文档中说明

## 输入参数
- **文档信息**：
  - docId: "04"
  - docName: "API接口文档"
  - docFilename: "04_API接口文档.md"
  - relatedSources: api/, routes/, controller/, middleware/, docs/swagger.yaml 等
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程
1. 扫描 API 入口（如 src/api/, src/routes/, internal/server/**）及 swagger/proto 定义
2. 对每个端点提取：HTTP 方法、路径、认证方式、中间件、实现函数、请求/响应类型、错误码
3. 若同时存在 REST 与 gRPC，需拆分模块分别列出
4. 生成文档并输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}04_API接口文档.md\`

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
来源: src/api/, docs/swagger.yaml

## 基础信息

| 项目 | 值 |
|-----|----|
| Base URL | /api/v1 |
| 认证方式 | Bearer Token / API Key |
| 内容类型 | application/json |
| 全局中间件 | authMiddleware, errorHandler |

来源: src/routes/index.ts, src/middleware/auth.ts

## 接口总览

| 模块 | 方法 | 路径 | 说明 | 认证 | 实现入口 |
|------|------|------|------|------|----------|
| 用户 | POST | /user/register | 用户注册 | 无 | src/api/user.ts#register |
| 用户 | POST | /user/login | 用户登录 | 无 | src/api/user.ts#login |
| 用户 | GET | /user/profile | 获取用户信息 | Bearer | src/api/user.ts#getProfile |
| 订单 | POST | /order | 创建订单 | Bearer | src/api/order.ts#createOrder |
| 订单 | GET | /order/:id | 获取订单 | Bearer | src/api/order.ts#getOrder |

来源: src/api/*

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
| 实现 | src/api/user.ts#register → src/service/userService.ts#registerUser |

**请求参数**

| 名称 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| email | body | string | 是 | 用户邮箱 |
| password | body | string | 是 | 密码（>=8 位） |
| name | body | string | 否 | 显示名称 |

\`\`\`typescript
// 摘自: src/types/api.ts
export interface RegisterRequest {
  email: string
  password: string
  name?: string
}
\`\`\`

**响应**

\`\`\`typescript
// 摘自: src/types/api.ts
export interface UserResponse {
  id: string
  email: string
  name: string
  createdAt: string
}
\`\`\`

**错误码**

| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | INVALID_PARAMS | 参数校验失败 |
| 409 | EMAIL_EXISTS | 邮箱已存在 |

来源: src/api/user.ts, src/types/api.ts, src/utils/errors.ts

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
1. 每个接口必须包含：方法、路径、认证、中间件、实现入口、请求/响应/错误码
2. 所有参数/类型必须从代码或 swagger/proto 中提取
3. 禁止输出不存在的接口；若检测到 swagger/proto 中定义但源码缺失，需标注“实现缺失”
4. 若项目包含多协议，必须分节描述（REST/gRPC/WebSocket 等）
5. 文档长度控制在 300-600 行
`

