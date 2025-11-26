import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants";

export const ARCHITECTURE_DOC_TEMPLATE = (workspace: string) => `# 代码架构文档生成

## 角色定义
您是技术文档撰写专家，负责生成代码架构文档，帮助AI理解项目的目录结构、模块划分和依赖关系。

## 核心原则
- 文档优先服务AI（生成代码时知道代码该放哪、该依赖什么）
- 每个模块描述必须关联到具体目录/文件
- 禁止编造模块或依赖关系

## 输入参数
- **文档信息**：
  - docId: "02"
  - docName: "代码架构"
  - docFilename: "02_代码架构.md"
  - relatedSources: 相关源目录列表
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：扫描目录结构
使用 \`list_files\` 工具获取完整目录结构，重点关注：
- src/ 源代码目录
- lib/ 或 packages/ 库目录
- config/ 配置目录
- test/ 测试目录

### 步骤2：分析模块划分
读取各模块的入口文件和核心文件，理解：
- 模块职责
- 模块间依赖关系
- 导入导出关系

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}02_代码架构.md\`

## 输出格式（至少包含：目录树 + 分层架构图 + 交互序列图 + 组件职责表。所有图表下方必须列出实际目录/文件来源。）

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
[简述项目采用的架构模式（分层架构/DDD/微服务等），50字以内。必须引用 README 或入口文件。]
来源: README.md, cmd/main.ts

## 目录结构

\`\`\`
project-root/
├── src/                      # 源代码根目录
│   ├── api/                  # API接口层 - 处理HTTP请求
│   │   ├── user.ts          # 用户相关接口
│   │   ├── order.ts         # 订单相关接口
│   │   └── index.ts         # 路由注册入口
│   ├── service/              # 业务逻辑层 - 核心业务处理
│   │   ├── userService.ts   # 用户业务逻辑
│   │   ├── orderService.ts  # 订单业务逻辑
│   │   └── index.ts         # 服务导出
│   ├── model/                # 数据模型层 - 数据库实体
│   │   ├── user.ts          # 用户模型
│   │   ├── order.ts         # 订单模型
│   │   └── index.ts         # 模型导出
│   ├── repository/           # 数据访问层 - 数据库操作
│   │   ├── userRepo.ts      # 用户数据访问
│   │   └── orderRepo.ts     # 订单数据访问
│   ├── middleware/           # 中间件 - 请求预处理
│   │   ├── auth.ts          # 认证中间件
│   │   └── logger.ts        # 日志中间件
│   ├── utils/                # 工具函数
│   │   ├── crypto.ts        # 加密工具
│   │   └── validator.ts     # 验证工具
│   └── index.ts              # 应用入口
├── config/                   # 配置文件目录
├── test/                     # 测试文件目录
└── scripts/                  # 脚本目录
\`\`\`

## 分层架构图（图1）

\`\`\`mermaid
graph TB
    subgraph 接口层[API Layer]
        A[api/user.ts]
        B[api/order.ts]
    end
    
    subgraph 业务层[Service Layer]
        C[service/userService.ts]
        D[service/orderService.ts]
    end
    
    subgraph 数据层[Repository Layer]
        E[repository/userRepo.ts]
        F[repository/orderRepo.ts]
    end
    
    subgraph 模型层[Model Layer]
        G[model/user.ts]
        H[model/order.ts]
    end
    
    A --> C
    B --> D
    C --> E
    D --> F
    E --> G
    F --> H
\`\`\`

相关代码: src/api/, src/service/, src/repository/, src/model/

## 核心交互流程（图2）

\`\`\`mermaid
sequenceDiagram
    participant Client as Client
    participant API as API Layer
    participant Service as Service Layer
    participant Repo as Repository
    participant DB as Database

    Client->>API: 发起请求
    API->>Service: 调用 {handler}
    Service->>Repo: 访问数据
    Repo->>DB: 执行查询/写入
    DB-->>Repo: 返回结果
    Repo-->>Service: 数据对象
    Service-->>API: 响应 DTO
    API-->>Client: HTTP Response
\`\`\`

相关代码: src/api/{*}, src/service/{*}, src/repository/{*}

## 组件职责矩阵

| 组件 | 目录/文件 | 职责 | 关键依赖 |
|------|-----------|------|----------|
| API 接口 | src/api/ | 暴露 REST/gRPC 接口 | src/service/ |
| 业务服务 | src/service/ | 业务编排、事务 | src/repository/, src/model/ |
| 数据访问 | src/repository/ | 封装数据库访问 | database/manager.ts |
| 配置层 | config/ | 管理运行配置 | internal/config/** |
| 守护任务 | internal/daemon/ | 调度后台作业 | internal/job/** |

来源: src/, internal/

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

来源: 现有代码命名分析

## 相关文档
- [项目概览](./01_项目概览.md)
- [业务流程](./03_业务流程.md)
- [编码规范](./06_编码规范.md)
\`\`\`

${CODE_REFERENCE_RULES}

## 图表要求
- 必须至少包含两类图：分层架构图（结构）+ 交互/序列图（流程），若仓库存在额外依赖可再补模块依赖图
- 生成图前确认所有节点均来自真实目录/文件
- 每个图表下方必须写明 `相关代码: ...`

## 质量要求
1. 目录结构必须反映实际项目
2. 每个模块说明必须基于实际代码分析
3. 依赖关系必须从 import 语句中提取
4. 扩展性说明必须基于实际架构设计，引用具体示例
5. 图表引用的目录若不存在必须移除该图
6. 文档长度控制在 200-400 行
`;

