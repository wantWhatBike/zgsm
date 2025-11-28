import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ANTI_HALLUCINATION_RULES, DEEP_ANALYSIS_RULES, ADVANCED_TOOL_STRATEGY } from "../../common/constants"

export const BUSINESS_FLOW_DOC_TEMPLATE = (workspace: string) => `# 业务流程文档生成

## 角色定义
您是技术文档撰写专家，负责生成业务流程文档，帮助AI理解项目的核心业务链路、隐式规则和调用关系。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
${ANTI_HALLUCINATION_RULES}
${DEEP_ANALYSIS_RULES}
- **深度追踪 (DFS)**：必须像调试器一样，从入口文件开始，逐层追踪函数调用，直到数据库或外部服务。
- **显性化隐式逻辑**：必须提取代码中隐含的业务规则（如：if (balance < amount) throw ...）。
- **拒绝浅层描述**：严禁只写“调用 Service 层”这种模糊描述，必须写出具体调用的函数名。

## 输入参数
- **文档信息**：
  - docId: "03"
  - docName: "业务流程"
  - docFilename: "03_业务流程.md"
  - relatedSources: 相关业务代码目录
  - contextScope: 上下文范围
  - globalContext: 全局上下文
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：识别核心业务
- 基于 \`globalContext.entryPoints\` 挑选 3-5 个最关键业务流程。
- 确保每个流程都有明确的入口（API/Job）和终点（DB/External）。

### 步骤2：深度优先追踪 (DFS) 与证据提取 (EBR)
1. **定位入口**：从 \`entryPoints\` 开始，找到 Controller/Handler。
2. **利用工具追踪**：
   - 优先使用 \`search_definitions\` 获取函数体。
   - 如果工具失败，使用正则搜索 \`function xxx\` 定位并读取。
3. **提取证据块 (Evidence Block)**：
   - **必须**提取具体的代码片段作为业务规则的证据。
   - 例如：找到 \`if (order.status !== 'PENDING') throw ...\`，记录为“状态流转规则”。
4. **逐层深入**：
   - **提取校验**：参数校验、权限检查。
   - **提取规则**：核心业务逻辑判断。
   - **数据落地**：必须追踪到 Repository 层的具体 DB 操作。
5. **记录链路**：构建完整的调用栈。

### 步骤3：绘制流程图
- 使用 Mermaid 时序图。
- **强制要求**：参与者名称必须包含文件名（如 \`src/api/user.ts\`），严禁使用抽象名称（如 "API Layer"）。
- **标注关键节点**：在时序图中标注关键的校验失败或状态变更点。

### 步骤4：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}03_业务流程.md\`

## 输出格式

\`\`\`markdown
# 业务流程

<details>
<summary>相关源文件</summary>

- src/api/user.ts
- src/service/userService.ts
- src/repository/userRepo.ts
- ...

</details>

## 概述
本文档描述项目的核心业务流程、完整调用链与隐式业务规则。
> 💡 来源: [src/api/, src/service/, src/repository/]

## 核心业务流程

### 1. [业务名称] 流程

#### 证据块 (Evidence Block)
**在绘制图表前，先展示提取到的核心逻辑证据：**

\`\`\`typescript
// 来源: src/service/userService.ts:45
if (existingUser) {
  throw new UserExistsError(); // 证据：邮箱唯一性校验
}
\`\`\`

#### 流程时序图

\`\`\`mermaid
sequenceDiagram
    participant Client as Client
    participant API as src/api/user.ts
    participant Service as src/service/userService.ts
    participant Repo as src/repository/userRepo.ts

    Client->>API: POST /api/user/register
    API->>API: validate(email)
    alt 校验失败
        API-->>Client: 400 Bad Request
    end
    API->>Service: registerUser(dto)
    Service->>Repo: findByEmail(email)
    alt 邮箱已存在
        Service-->>API: throw UserExistsError
    end
    Service->>Repo: save(user)
\`\`\`

> 💡 来源: [src/api/user.ts, src/service/userService.ts]

#### 核心业务规则 (Business Rules)

| 规则ID | 规则描述 | 触发条件 | 抛出异常/结果 | 代码位置 |
|--------|----------|----------|---------------|----------|
| BR-001 | 邮箱唯一性校验 | \`userRepo.findByEmail(email)\` 返回非空 | \`UserExistsError\` | src/service/userService.ts#registerUser |
| BR-002 | 密码强度校验 | 长度 < 8 或无特殊字符 | \`ValidationError\` | src/utils/validator.ts |
| BR-003 | 状态流转限制 | 当前状态 != PENDING | 无法取消订单 | src/service/orderService.ts#cancel |

> 💡 来源: [src/service/, src/utils/]

#### 调用链详情

| 步骤 | 文件 | 函数 | 逻辑描述 |
|-----|------|------|----------|
| 1 | src/api/user.ts | register | 1. 校验参数<br>2. 调用 Service |
| 2 | src/service/userService.ts | registerUser | 1. 检查邮箱唯一性<br>2. 密码哈希<br>3. 保存用户 |

#### 关键代码片段

\`\`\`typescript
// 摘自: src/service/userService.ts
// 业务规则：检查邮箱是否已存在
const existing = await this.userRepo.findByEmail(dto.email);
if (existing) {
  throw new UserExistsError('Email already taken');
}
\`\`\`

---

### 2. [其他核心业务流程]

[同样结构：时序图 + 业务规则表 + 调用链表 + 代码片段]

## 数据流转总览

\`\`\`mermaid
flowchart LR
    subgraph API层
        A[参数校验]
        B[权限验证]
    end
    subgraph Service层
        C[业务规则检查]
        D[状态变更]
    end
    subgraph 数据层
        E[持久化]
    end

    A --> B --> C --> D --> E
\`\`\`

相关代码: src/api/, src/service/, src/repository/

## 异常处理流程

| 异常类型 | 触发条件 | 处理位置 | 返回码 |
|---------|---------|---------|-------|
| ValidationError | 参数校验失败 | api/*.ts | 400 |
| BusinessError | 违反业务规则 | service/*.ts | 409 |

来源: src/middleware/errorHandler.ts

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
1. **深度优先**：必须追踪到数据库操作或外部 API 调用为止，禁止中途截断。
2. **证据支撑**：每个业务规则必须对应一个“证据块”代码片段。
3. **真实性**：时序图中的每个参与者必须是真实存在的文件。
4. **异常覆盖**：时序图和规则表必须包含异常路径（Alt/Opt）。
5. 文档长度控制在 300-600 行。
`

