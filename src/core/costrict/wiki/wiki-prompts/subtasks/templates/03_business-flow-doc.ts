import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants"

export const BUSINESS_FLOW_DOC_TEMPLATE = (workspace: string) => `# 业务流程文档生成

## 角色定义
您是技术文档撰写专家，负责生成业务流程文档，帮助AI理解项目的核心业务链路和调用关系。

## 核心原则
- 文档优先服务AI（理解业务流程以生成符合业务逻辑的代码）
- **必须跨文件追踪完整调用链**，从入口到数据层
- **禁止捏造**：所有流程必须基于实际代码，标注每个步骤的代码来源
- 每个业务流程必须关联到具体代码文件/目录
- 每个流程需列出涉及的关键结构体/接口/设计模式，并注明来源

## 输入参数
- **文档信息**：
  - docId: "03"
  - docName: "业务流程"
  - docFilename: "03_业务流程.md"
  - relatedSources: 相关业务代码目录
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：识别核心业务
- 根据项目类型挑选 3-5 个最关键业务流程（用户、订单、支付、同步等）
- 每个流程都需要真实入口（API/Job/CLI）与终点（DB/外部服务）

### 步骤2：跨文件追踪
1. 从入口文件（API/middleware/job）开始
2. 依次追踪 service → repository → 外部依赖
3. 记录函数名、关键参数、返回值
4. 记录文件路径，能获取行号的附上行号

### 步骤3：绘制流程图
- 使用 Mermaid 时序图或流程图
- 参与者命名必须带文件路径（如 `api/user.ts`）

### 步骤4：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}03_业务流程.md\`

## 输出格式

\`\`\`markdown
# 业务流程

<details>
<summary>相关源文件</summary>

- src/api/user.ts
- src/api/order.ts
- src/service/userService.ts
- src/service/orderService.ts
- src/repository/userRepo.ts
- src/repository/orderRepo.ts
- ...

</details>

## 概述
本文档描述项目的核心业务流程、完整调用链与数据流转。
来源: src/api/, src/service/, src/repository/

## 核心业务流程

### 1. 用户注册流程

#### 流程时序图

\`\`\`mermaid
sequenceDiagram
    participant Client as Client
    participant API as api/user.ts
    participant Service as service/userService.ts
    participant Repo as repository/userRepo.ts
    participant DB as database/users

    Client->>API: POST /api/user/register
    API->>API: validatePayload()
    API->>Service: registerUser(dto)
    Service->>Repo: findByEmail(email)
    Repo->>DB: SELECT * FROM users
    DB-->>Repo: result
    Repo-->>Service: existing user | null
    Service->>Service: hashPassword()
    Service->>Repo: create(userData)
    Repo->>DB: INSERT
    DB-->>Repo: saved row
    Repo-->>Service: User entity
    Service-->>API: User DTO
    API-->>Client: 201 Created
\`\`\`

相关代码: src/api/user.ts, src/service/userService.ts, src/repository/userRepo.ts

#### 调用链详情

| 步骤 | 文件 | 函数 | 行号 | 描述 |
|-----|------|------|------|------|
| 1 | src/api/user.ts | register | L12-40 | 接收请求与校验 |
| 2 | src/service/userService.ts | registerUser | L25-70 | 业务编排 |
| 3 | src/service/userService.ts | hashPassword | L80-95 | 密码加密 |
| 4 | src/repository/userRepo.ts | findByEmail | L15-25 | 唯一性校验 |
| 5 | src/repository/userRepo.ts | create | L30-45 | 写入数据库 |

#### 关键结构体 / 接口 / 设计模式

| 名称 | 类型 | 文件 | 作用 | 设计模式 |
|------|------|------|------|----------|
| RegisterRequest | DTO | src/api/user.ts | 请求数据结构 | DTO |
| UserService | Service | src/service/userService.ts | 注册/认证逻辑 | 事务脚本 |
| UserRepository | Repository | src/repository/userRepo.ts | 数据访问 | Repository |
| ConflictError | Exception | src/utils/errors.ts | 冲突处理 | 异常模式 |

来源: 上述文件

#### 关键代码片段

\`\`\`typescript
// 摘自: src/api/user.ts
export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" })
  }
  const user = await userService.registerUser({ email, password, name })
  return res.status(201).json(user)
}
\`\`\`

---

### 2. 订单创建流程

[沿用同样结构：时序图 + 调用链表 + 结构体/接口 + 代码片段]

### 3. [其他核心业务流程]

[同样结构，至少 1-2 个流程]

## 数据流转总览

\`\`\`mermaid
flowchart LR
    subgraph API层
        A[参数校验]
        B[权限验证]
    end
    subgraph Service层
        C[业务编排]
        D[聚合/转换]
    end
    subgraph 数据层
        E[Repository]
        F[(Database/Cache)]
    end

    A --> B --> C --> D --> E --> F
\`\`\`

相关代码: src/api/, src/service/, src/repository/

## 异常处理流程

| 异常类型 | 触发条件 | 处理位置 | 返回码 |
|---------|---------|---------|-------|
| ValidationError | 参数校验失败 | api/*.ts | 400 |
| UnauthorizedError | Token 无效 | middleware/auth.ts | 401 |
| NotFoundError | 资源不存在 | service/*.ts | 404 |
| ConflictError | 数据冲突 | service/*.ts | 409 |

来源: src/middleware/errorHandler.ts, src/utils/errors.ts

## 设计模式速览

- **Middleware**：middleware/* 负责认证、日志等横切逻辑
- **Service / Repository**：service/* 编排业务，repository/* 封装数据访问
- **Command / Job**：internal/job/* + internal/daemon/*（如存在）
- 若仓库存在事件/消息模块，描述 Publisher/Subscriber 文件

来源: middleware/, service/, repository/, internal/job/

\`\`\`

${CODE_REFERENCE_RULES}

## 图表要求
- 每个业务流程必须包含时序图，并确保参与者为真实文件/目录
- 至少 3 个核心流程（如项目规模较小，可减少但需说明原因）
- 若追踪不到完整链路，必须说明缺失的文件/原因

## 质量要求
1. 禁止编造流程或代码
2. 每个流程必须包含：概述、时序图、调用链表、结构体/接口表、代码片段
3. 关键函数/结构必须标注文件路径（及可选行号）
4. 若需要的源文件不存在，移除该流程并记录原因
5. 文档长度控制在 300-600 行
`

