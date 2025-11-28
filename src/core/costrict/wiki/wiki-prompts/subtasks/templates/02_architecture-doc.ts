import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ANTI_HALLUCINATION_RULES, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const ARCHITECTURE_DOC_TEMPLATE = (workspace: string) => `# 代码架构文档生成

## 角色定义
您是技术文档撰写专家，负责生成代码架构文档，帮助AI理解项目的目录结构、模块划分和依赖关系。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
${ANTI_HALLUCINATION_RULES}
- **基于事实绘图**：Mermaid 图中的每个节点必须对应真实存在的目录或文件。
- **依赖实证 (Evidence-Based Dependency)**：架构图中的每一条连线（A -> B）必须有代码级的引用证据（import/call）。
- **物理映射**：架构图中的每个组件必须标注其对应的物理路径。

## 输入参数
- **文档信息**：
  - docId: "02"
  - docName: "代码架构"
  - docFilename: "02_代码架构.md"
  - relatedSources: 相关源目录列表
  - contextScope: 上下文范围
  - globalContext: 全局上下文
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：扫描目录结构与大纲
1. 使用 \`list_files\` 工具获取完整目录结构，重点关注 src/, lib/, config/ 等核心目录。
2. 使用 \`list_code_definition_names\` 扫描核心模块入口文件（如 index.ts, mod.rs, main.go），快速识别模块导出的核心类/接口，构建模块地图。

### 步骤2：构建依赖证据矩阵 (EBR)
1. **挑选核心节点**：基于 \`globalContext.entryPoints\` 和核心目录，确定架构图的关键节点。
2. **收集依赖证据**：
   - 对每个节点，使用 \`search_files\` (regex: \`import .* from .*\`) 或 \`read_file\` 提取导入语句。
   - **记录证据**：\`Node A imports Node B (file: src/a.ts, line: 10)\`。
   - 如果找不到引用证据，**严禁**在架构图中画线。

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}02_代码架构.md\`

## 输出格式

\`\`\`markdown
# 代码架构

<details>
<summary>相关源文件</summary>

- src/
- src/api/
- src/service/
- src/model/
- ...

</details>

## 架构概述
[简述项目采用的架构模式（分层架构/DDD/微服务等）。必须引用 README 或入口文件。]
> 💡 来源: [README.md, cmd/main.ts]

## 依赖证据矩阵 (Dependency Evidence)
**在绘制架构图前，先列出核心依赖证据：**

| 调用方 | 被调用方 | 证据类型 | 来源文件 |
|--------|----------|----------|----------|
| API Layer | Service Layer | import | src/api/user.ts |
| Service Layer | Repository | injection | src/service/user.ts |

## 目录结构

\`\`\`
project-root/
├── src/                      # 源代码根目录
│   ├── api/                  # API接口层
│   ├── service/              # 业务逻辑层
│   └── ...
\`\`\`
> 💡 来源: [list_files 输出]

## 分层架构图（图1）

> **注意**：节点名称必须包含文件路径，禁止使用抽象名称。

\`\`\`mermaid
graph TB
    subgraph 接口层[API Layer]
        A[UserAPI<br/>(src/api/user.ts)]
        B[OrderAPI<br/>(src/api/order.ts)]
    end
    
    subgraph 业务层[Service Layer]
        C[UserService<br/>(src/service/userService.ts)]
        D[OrderService<br/>(src/service/orderService.ts)]
    end
    
    A --> C
    B --> D
\`\`\`

> 💡 来源: [src/api/, src/service/]

## 核心交互流程（图2）

\`\`\`mermaid
sequenceDiagram
    participant Client as Client
    participant API as src/api/user.ts
    participant Service as src/service/userService.ts
    participant Repo as src/repository/userRepo.ts

    Client->>API: 发起请求
    API->>Service: 调用 {handler}
    Service->>Repo: 访问数据
\`\`\`

> 💡 来源: [src/api/user.ts, src/service/userService.ts]

## 组件职责矩阵

| 组件 | 目录/文件 | 职责 | 关键依赖 |
|------|-----------|------|----------|
| API 接口 | src/api/ | 暴露 REST/gRPC 接口 | src/service/ |
| 业务服务 | src/service/ | 业务编排、事务 | src/repository/, src/model/ |

> 💡 来源: [src/, internal/]

## 核心模块说明

### API接口层 (src/api/)
**职责**：处理HTTP请求，参数校验，调用Service层

| 文件 | 职责 | 依赖 |
|-----|-----|-----|
| user.ts | 用户注册/登录/信息接口 | userService |
| order.ts | 订单CRUD接口 | orderService |
| index.ts | 路由注册 | express.Router |

来源: src/api/

### 业务逻辑层 (src/service/)
**职责**：实现核心业务逻辑，事务处理

| 文件 | 职责 | 依赖 |
|-----|-----|-----|
| userService.ts | 用户业务（注册、认证） | userRepo, crypto |
| orderService.ts | 订单业务（创建、支付） | orderRepo, userService |

来源: src/service/

### 数据访问层 (src/repository/)
**职责**：封装数据库操作，提供数据访问接口

| 文件 | 职责 | 依赖 |
|-----|-----|-----|
| userRepo.ts | 用户表CRUD | User model, db |
| orderRepo.ts | 订单表CRUD | Order model, db |

来源: src/repository/

## 模块依赖关系

### 依赖图

\`\`\`mermaid
graph LR
    subgraph External
        DB[(Database)]
        Cache[(Redis)]
    end
    
    API[api/] --> Service[service/]
    Service --> Repo[repository/]
    Service --> Cache
    Repo --> Model[model/]
    Repo --> DB
    
    API --> Middleware[middleware/]
    Service --> Utils[utils/]
\`\`\`

### 结构化依赖数据 (Machine Readable)

<module_dependency>
<module name="API Layer" path="src/api">
  <dependency>src/service</dependency>
  <dependency>src/middleware</dependency>
</module>
<module name="Service Layer" path="src/service">
  <dependency>src/repository</dependency>
  <dependency>src/model</dependency>
  <dependency>src/utils</dependency>
</module>
<module name="Repository Layer" path="src/repository">
  <dependency>src/model</dependency>
</module>
</module_dependency>

相关代码: src/

## 扩展性说明

### API接口扩展
1. 在 \`src/api/\` 下创建或修改接口文件
2. 在 \`src/api/index.ts\` 中注册路由
3. 对应创建 Service 层方法

### 新增业务模块
1. 在 \`src/service/\` 下创建 xxxService.ts
2. 在 \`src/repository/\` 下创建 xxxRepo.ts（如需数据库）
3. 在 \`src/model/\` 下创建数据模型（如需）

### 文件命名规范
- API文件：\`{resource}.ts\`（如 user.ts, order.ts）
- Service文件：\`{resource}Service.ts\`
- Repository文件：\`{resource}Repo.ts\`
- Model文件：\`{resource}.ts\`（首字母大写导出类名）


\`\`\`

${CODE_REFERENCE_RULES}

## 图表要求
- 必须至少包含两类图：分层架构图（结构）+ 交互/序列图（流程），若仓库存在额外依赖可再补模块依赖图
- 生成图前确认所有节点均来自真实目录/文件
- 每个图表下方必须写明 \`相关代码: ...\`

## 质量要求
1. **真实性**：目录结构必须与 \`list_files\` 结果完全一致。
2. **实证性**：架构图中的每一条连线，都必须能在“依赖证据矩阵”中找到对应的行。
3. **准确性**：Mermaid 图中的节点名称必须是真实的文件名或目录名。
4. **图表有效性**：如果某个层级（如 Repository 层）在项目中不存在，禁止在图中画出该层。
5. 文档长度控制在 200-400 行。
`;

