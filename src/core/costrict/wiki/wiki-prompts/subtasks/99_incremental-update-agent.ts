// 增量更新生成 Agent
import { WIKI_OUTPUT_FILE_PATHS } from "../common/constants"

export const INCREMENTAL_UPDATE_AGENT_TEMPLATE = (workspace: string) => `
# /kb-update

当使用此命令时，执行以下任务：

# 基于 Git 差异的知识库增量更新

## 目标

根据当前仓库最新的 git commit 与知识库生成时的 git commit 之间的差异，智能分析代码变更，按需更新已有知识库文档。

## 前置要求

知识库根目录必须包含 \`.kb-meta.json\` 文件，记录知识库生成时的元信息：

\`\`\`json
{
  "generated_at": "2025-01-15T10:30:00Z",
  "git_commit": "a1b2c3d4e5f6...",
  "git_branch": "main",
  "module_path": "src/user-service",
  "generator_version": "1.0.0",
  "repository_dependencies": [
    "依赖的仓库名称1",
    "依赖的仓库名称2"
  ]
}
\`\`\`

**如果不存在此文件，提示用户：需要先运行 \`/kb-init\` 完整生成知识库。**

## 任务指令

### 步骤1: 获取 Git 差异信息

#### 1.1 读取基准 Commit

\`\`\`bash
# 读取知识库元信息
cat ${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}.kb-meta.json
\`\`\`

**提取**：\`git_commit\` 字段作为基准版本

#### 1.2 获取当前 Commit

\`\`\`bash
# 获取当前 HEAD commit hash
git rev-parse HEAD
\`\`\`

#### 1.3 检查是否有变更

\`\`\`bash
# 比较两个 commit 是否相同
if [ "\$CURRENT_COMMIT" == "\$BASE_COMMIT" ]; then
    echo "知识库已是最新，无需更新"
    exit 0
fi
\`\`\`

#### 1.4 获取变更文件列表

\`\`\`bash
# 获取两个 commit 之间的差异文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT

# 输出示例：
# M    src/api/user.go              # 修改
# A    src/api/order.go             # 新增
# D    src/utils/deprecated.py      # 删除
# R    src/config/old.yaml src/config/new.yaml  # 重命名
\`\`\`

#### 1.5 分类变更文件

**按文件类型和目录分类**：

\`\`\`bash
# API 相关文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(api|handler|controller|router)"

# 数据库相关文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(model|schema|migration|entity)"

# 测试文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(_test\\.|test_|\\.spec\\.|\\.test\\.)"

# 配置文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(package\\.json|requirements\\.txt|go\\.mod|Cargo\\.toml|pom\\.xml|\\.env|config\\.)"

# 业务逻辑文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(service|logic|domain|business)"
\`\`\`

### 步骤2: 分析变更影响

根据变更文件类型，确定需要更新的知识库文档：

| 变更类型 | 影响的知识库文档 | 更新策略 |
|---------|----------------|---------|
| **package.json, requirements.txt, go.mod** | 仓库架构.md<br>仓库依赖.md<br>仓库概览.md | 自动更新依赖列表和版本 |
| **src/api/**, **handler/**, **controller/** | API索引.md<br>业务流程索引.md<br>业务流程详解.md | 增量扫描新增/修改的 API；更新流程索引和流程图 |
| **cron/**, **task/** | 业务流程索引.md | 新增定时任务流程概述 |
| **consumer/** | 业务流程索引.md | 新增消息消费流程概述 |
| **model/**, **schema/**, **migration/** | 数据结构.md<br>仓库架构.md | 更新数据库表结构和 ERD 图；更新仓库架构中的数据模型 |
| **service/**, **logic/**, **domain/** | 核心业务领域.md<br>业务流程索引.md<br>业务流程详解.md<br>仓库架构.md | 提示用户检查业务逻辑变更；更新流程索引、时序图和类图 |
| **drivers/**, **plugins/** | 代码编写指南.md | 检测新插件，更新插件开发指南 |
| ***_test.go**, **test_*.py** | 单元测试.md | 更新测试方法和示例 |
| **README.md**, **docs/** | 仓库概览.md | 同步项目描述和说明 |
| **Dockerfile**, **docker-compose.yml**, **k8s/** | 仓库架构.md<br>仓库概览.md | 更新部署架构和部署方式 |
| **middleware/**, **interceptor/** | 代码编写指南.md<br>仓库架构.md | 检查新的中间件模式；更新架构图 |
| **.go**, **.py**, **.ex** (代码文件) | 代码编写指南.md<br>外部接入指南.md<br>排障指南.md | 检查是否有新的代码模式；分析是否影响接口或排障工具 |
| **架构调整**（目录重组、模块拆分） | 仓库架构.md<br>仓库概览.md | 重新分析架构模式和模块组织 |
| **API 相关文件** (api, handler, controller) | API索引.md<br>业务流程索引.md<br>业务流程详解.md<br>外部接入指南.md | 增量扫描新增/修改的 API；更新流程索引和流程图；更新外部接入文档 |
| **日志相关文件** (log config, error handling) | 排障指南.md | 检查日志路径、格式、标签变更；更新排障工具说明 |

### 步骤3: 生成变更分析报告

**在执行任何更新前**，向用户展示变更分析：

\`\`\`markdown
# Git 差异分析报告

## 基准信息
- 知识库生成时间: 2025-01-10 15:30:00
- 基准 Commit: a1b2c3d (feat: add user authentication)
- 当前 Commit: f9e8d7c (feat: add order management)
- Commit 数量: 15 个提交

## 变更统计
- 新增文件: 8 个
- 修改文件: 12 个
- 删除文件: 2 个
- 重命名文件: 1 个

## 变更分类

### 1. 依赖变更 (影响: 仓库架构.md, 仓库依赖.md, 仓库概览.md)
**go.mod**:
- 新增: github.com/zeromicro/go-zero v1.6.0
- 更新: github.com/golang-jwt/jwt v4.5.0 -> v5.0.0
- 移除: github.com/dgrijalva/jwt-go

### 2. API 变更 (影响: API索引.md, 业务流程索引.md, 业务流程详解.md)
**新增 API 文件**:
- src/api/order.go (+150 行)
  - POST /api/orders (创建订单)
  - GET /api/orders/:id (查询订单)
  - PUT /api/orders/:id (更新订单)

**修改 API 文件**:
- src/api/user.go (~50 行变更)
  - 修改: GET /api/users/:id (添加权限检查)

**影响分析**:
- 需要在业务流程详解中添加"订单创建流程"时序图

### 3. 数据结构变更 (影响: 数据结构.md, 仓库架构.md)
**新增 Migration**:
- migrations/20250115_create_orders.sql
  - 新表: orders (id, user_id, amount, status, created_at)

**修改 Model**:
- src/model/user.go
  - 新增字段: last_login_at

**影响分析**:
- 需要更新数据库 ERD 图，添加 orders 表
- 需要在仓库架构中更新数据模型类图

### 4. 业务逻辑变更 (影响: 核心业务领域.md, 业务流程详解.md, 仓库架构.md)
**新增业务模块**:
- src/service/order_service.go (+200 行)
- src/logic/order_logic.go (+180 行)

**影响分析**:
- 建议: 需要人工确认是否添加"订单管理"业务领域
- 需要在业务流程详解中添加订单相关的核心流程
- 需要在仓库架构中更新类图，添加 OrderService 和 OrderLogic

### 5. 架构变更 (影响: 仓库架构.md, 仓库概览.md)
**新增中间件**:
- src/middleware/trace.go (+80 行)
  - 链路追踪中间件

**影响分析**:
- 需要更新仓库架构图，添加中间件层
- 需要更新服务架构图的请求处理流程

### 6. 测试变更 (影响: 单元测试.md)
**新增测试**:
- src/api/order_test.go (+120 行)
- src/service/order_service_test.go (+95 行)

### 7. 代码模式变更 (影响: 代码编写指南.md)
**检测到新模式**:
- src/middleware/trace.go (新增链路追踪模式)

### 8. 文档变更 (影响: 仓库概览.md)
**README.md**:
- 新增"订单管理模块"章节
- 更新部署文档

## 推荐更新计划

### 自动更新 (无需确认)
✓ 仓库架构.md - 更新依赖版本、添加中间件层、更新类图
✓ 仓库依赖.md - 添加新依赖关系和版本
✓ 数据结构.md - 添加 orders 表结构和 ERD 图
✓ API索引.md - 添加订单相关 API 到索引（含代码位置）
✓ 业务流程索引.md - 添加订单流程概述
✓ 单元测试.md - 添加订单测试示例
✓ 仓库概览.md - 同步依赖版本和模块信息（最后更新）

### 需要人工确认
⚠ 核心业务领域.md - 检测到新业务模块"订单管理"，是否添加业务领域文档？
⚠ 业务流程详解.md - 是否添加"订单创建流程"时序图？
⚠ 仓库架构.md - 检测到架构变更（新增中间件），是否需要重新分析架构模式？
⚠ 代码编写指南.md - 检测到新中间件模式，是否更新代码编写指南文档？

## 不更新的文档
- 核心业务领域.md (现有业务逻辑部分) - 保留用户自定义内容
- 业务流程详解.md (现有流程) - 保留已有流程描述
- 仓库架构.md (架构决策说明) - 保留用户添加的架构说明
- 代码编写指南.md (现有模式) - 保留已有代码模式文档

---

**是否继续执行自动更新？(y/n)**
\`\`\`

### 步骤4: 执行增量更新

**更新顺序原则**：按照文档依赖关系，从底层到上层更新

#### 4.1 更新仓库架构.md

**分析架构相关变更**：

\`\`\`bash
# 检测架构调整（目录重组、模块拆分）
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "^(R|D)" | head -20

# 检测新增中间件/拦截器
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "middleware|interceptor"

# 检测部署配置变更
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "Dockerfile|docker-compose|k8s/"
\`\`\`

**更新内容**：
- **依赖框架版本**: 更新技术栈版本信息
- **系统全景图**: 如果新增外部服务依赖，更新全景图
- **服务架构图**: 如果新增中间件或调整分层，更新架构图
- **核心类图**: 如果新增重要业务类，更新类图
- **架构决策**: 记录重大架构变更的原因

**保留内容**：
- 用户手动添加的架构说明
- 架构决策的文字描述

#### 4.2 更新仓库依赖.md

\`\`\`bash
# 提取新增和更新的依赖
git diff \$BASE_COMMIT..\$CURRENT_COMMIT package.json
git diff \$BASE_COMMIT..\$CURRENT_COMMIT go.mod
git diff \$BASE_COMMIT..\$CURRENT_COMMIT requirements.txt
\`\`\`

**生成 Mermaid 依赖图时**：
- 添加新增的依赖节点
- 更新版本号
- 保留用户手动添加的依赖说明

**同步更新 .kb-meta.json 中的仓库依赖**：
- 从更新后的 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}仓库依赖.md\` 中提取仓库依赖关系
- 更新 \`.kb-meta.json\` 中的 \`repository_dependencies\` 数组（字符串列表格式）
- 仅包含仓库名称列表

#### 4.3 更新数据结构.md

**分析 Migration 文件变更**：

\`\`\`bash
# 获取新增的 migration 文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "migration|migrate" | grep "^A"

# 获取修改的 Model/Schema 文件
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(model|schema)" | grep "^M"
\`\`\`

**更新内容**：
- 新增表结构
- 新增字段
- 索引变更
- 更新 Mermaid ERD 图

**示例 - 增量添加表到 ERD**：

\`\`\`mermaid
erDiagram
    %% 已有表 (保留)
    users ||--o{ posts : creates
    users {
        int id PK
        string username
        string email
    }

    %% 新增表
    users ||--o{ orders : places
    orders {
        int id PK
        int user_id FK
        decimal amount
        string status
        timestamp created_at
    }
\`\`\`

#### 4.4 更新核心业务领域.md

**⚠️ 仅适用于服务类型仓库**

**检测业务逻辑变更**：

\`\`\`bash
# 检测新增业务模块
git diff --name-status \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "service|logic|domain" | grep "^A"
\`\`\`

**更新策略**：
- 如果新增业务模块，提示用户是否需要添加业务领域描述
- 保留已有的业务描述和规则
- 仅更新业务能力列表

**人工确认项**：
- 新的业务模块是否需要文档化？
- 业务流程是否有重大变更？

#### 4.5 更新 API 索引

**⚠️ 仅适用于服务类型仓库**

**只扫描变更的 API 文件**：

\`\`\`bash
# 获取新增或修改的 API 文件
CHANGED_API_FILES=\$(git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(api|handler|controller)")

# 只分析这些文件
for file in \$CHANGED_API_FILES; do
    echo "分析: \$file"
    # 提取 API 定义
done
\`\`\`

**API索引更新策略**：
- 新增的 API: 添加到对应功能分类的表格中（方法、路径、功能说明、认证、**代码位置**、主要参数）
- 修改的 API: 更新功能说明、认证要求、代码位置（如果函数名变更）
- 删除的 API: 从索引中移除
- **代码位置格式**: \`文件路径:函数名\`（如：\`handlers/order.go:CreateOrder\`）

#### 4.6 更新业务流程索引.md

**⚠️ 仅适用于服务类型仓库**

**检测业务流程变更**：

\`\`\`bash
# 检测新增的 API 端点
git diff --name-only --diff-filter=A \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "api|handler|controller"

# 检测新增的定时任务
git diff --name-only --diff-filter=A \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "cron|task"

# 检测新增的消息消费者
git diff --name-only --diff-filter=A \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "consumer"
\`\`\`

**更新策略**：
- 自动识别新增的业务流程（新API、新任务、新消费者）
- 为新流程添加概述（3-5步核心步骤、异常分支、代码位置）
- 保留现有流程的概述

**更新内容**：
- **新增流程概述**: 为新识别的业务流程添加简要概述
- **更新流程步骤**: 如果现有流程的核心步骤发生变化，更新描述
- **代码位置引用**: 更新代码文件和行号

#### 4.7 更新业务流程详解.md

**⚠️ 仅适用于服务类型仓库**

**检测核心流程变更**：

\`\`\`bash
# 检测核心 API 文件变更（影响流程时序图）
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "api|handler|controller"

# 检测核心业务逻辑文件变更
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "service|logic"
\`\`\`

**更新策略**：
- **只更新已有的核心流程**，不自动添加新流程
- 如果核心流程的业务逻辑有变更，更新对应的时序图
- 保留已有的流程描述

**更新内容**：
- **更新时序图**: 如果核心流程的逻辑有变更，更新 Mermaid 序列图
- **代码位置引用**: 更新代码路径和行号
- **数据流转**: 如果数据结构变化，更新数据流转描述

**人工确认项**：
- 新增的 API 是否属于核心业务流程？如果是，是否需要在业务流程详解中添加深度分析？
- 业务流程详解中的核心流程是否需要调整（替换或新增）？

**注意**: 新流程的概述会自动添加到业务流程索引，但详细分析需要人工确认后才添加到业务流程详解。

#### 4.8 更新代码编写指南.md

**检测新的代码模式**：

\`\`\`bash
# 分析新增的代码文件
git diff --name-only --diff-filter=A \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "\\.(go|py|ex)\$"

# 检测新增的插件驱动相关文件
git diff --name-only --diff-filter=A \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "driver|plugin"
\`\`\`

**更新策略**：
- 如果检测到新的中间件、装饰器、Hook、插件等模式，添加到文档
- 保留已有的代码风格说明
- 使用 \`文件路径:行号\` 引用新代码，不嵌入大段代码

#### 4.9 更新单元测试.md

**分析测试文件变更**：

\`\`\`bash
# 获取新增或修改的测试文件
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(_test\\.|test_|\\.spec\\.)"
\`\`\`

**更新内容**：
- 新增的测试示例 (提取 1-2 个代表性测试)
- 测试覆盖率变化
- 新的测试工具或框架

#### 4.10 更新外部接入指南.md

**⚠️ 仅适用于服务类型仓库**

**检测 API 接口或认证/错误处理变更**：

\`\`\`bash
# 获取新增或修改的 API 定义文件
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(api|handler|controller|\\.proto)"

# 获取认证/授权/错误处理相关文件变更
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(auth|middleware|error|jwt)"
\`\`\`

**更新策略**：
- **新增接口**: 添加到接口概览表格中
- **接口变更**: 更新路径、方法、认证要求、功能说明
- **认证/错误处理变更**: 更新相关说明和示例
- **版本策略变更**: 更新版本化说明

**更新内容**：
- 更新对外服务接口概览
- 更新调用方式与示例
- 更新认证与授权机制
- 更新错误处理规范
- 更新版本管理策略

#### 4.11 更新排障指南.md

**检测日志配置、工具或代码变更**：

\`\`\`bash
# 获取日志配置文件或代码变更
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(log|config\\.yaml|tool|script|error)"

# 获取监控配置变更
git diff --name-only \$BASE_COMMIT..\$CURRENT_COMMIT | grep -E "(monitor|prometheus|grafana)"
\`\`\`

**更新策略**：
- **排障工具**: 识别新增/修改的排障脚本或工具
- **日志路径/标签**: 识别日志配置变更，更新路径或标签说明
- **监控/告警**: 更新 Dashboard 链接或告警规则
- **最佳实践**: 检查代码风格，更新最佳实践

**更新内容**：
- 更新排障工具箱列表
- 更新日志文件路径和关键日志标签
- 更新监控与告警信息
- 更新排障最佳实践和预防措施

#### 4.12 更新仓库概览.md

**⚠️ 重要**: 此步骤应在所有其他文档更新完成后执行

**只更新技术性字段**：

\`\`\`bash
# 获取最新依赖版本
grep "go " go.mod | head -1
npm list --depth=0
pip list
\`\`\`

**更新内容**：
- **技术栈版本号**: 同步系统架构中的版本信息
- **知识库文档索引**: 如果新增文档，添加到索引列表
- **模块功能介绍**: 如果新增模块，添加到表格
- **知识库版本**: 更新 Git Commit ID 和更新时间

**保留内容**：
- 项目简介 (用户可能手动编辑)
- 业务背景说明
- 手动添加的说明

### 步骤5: 更新元信息文件

**更新完成后，更新 \`.kb-meta.json\`**：

\`\`\`json
{
  "generated_at": "2025-01-10T15:30:00Z",
  "last_updated_at": "2025-01-15T10:30:00Z",
  "git_commit": "f9e8d7c4b3a2...",  // 更新为最新 commit
  "git_branch": "main",
  "module_path": "src/user-service",
  "generator_version": "1.0.0",
  "repository_dependencies": [
    "order-service",
    "payment-service",
    "notification-service"
  ],
  "update_history": [
    {
      "updated_at": "2025-01-15T10:30:00Z",
      "from_commit": "a1b2c3d4e5f6...",
      "to_commit": "f9e8d7c4b3a2...",
      "files_updated": [
        "仓库架构.md",
        "仓库依赖.md",
        "数据结构.md",
        "API索引.md",
        "业务流程索引.md",
        "业务流程详解.md",
        "代码编写指南.md",
        "单元测试.md",
        "仓库概览.md"
      ]
    }
  ]
}
\`\`\`

**repository_dependencies 更新规则**：
- 从更新后的 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}仓库依赖.md\` 中提取当前仓库依赖的所有其他 Git 仓库名称
- 排除数据库、缓存、消息队列等基础设施依赖
- 仅包含服务间依赖（HTTP、gRPC调用）和共享库依赖的仓库名称
- 使用简单的字符串列表格式
- 每次更新都完整重新生成此数组（不是增量）

### 步骤6: 生成更新报告

\`\`\`markdown
# 知识库更新完成

## 更新时间
2025-01-15 10:30:00

## Commit 范围
a1b2c3d..f9e8d7c (15 个提交)

## 已更新的文档

### ✓ 仓库架构.md
- 更新技术栈版本: go-zero v1.5.3 -> v1.6.0
- 新增中间件层: TraceMiddleware (链路追踪)
- 更新服务架构图: 添加中间件处理流程
- 更新核心类图: 添加 OrderService、OrderLogic 类

### ✓ 仓库依赖.md
- 新增依赖节点: go-zero v1.6.0、golang-jwt/jwt v5.0.0
- 移除废弃依赖: dgrijalva/jwt-go
- 更新依赖关系图

### ✓ 数据结构.md
- 新增表: orders (id, user_id, amount, status, created_at)
- users 表新增字段: last_login_at
- 更新 ERD 关系图: 添加 users-orders 关系

### ✓ API索引.md
- 新增订单管理接口索引 (3个接口，含代码位置)
- 更新用户接口: GET /api/users/:id (添加权限要求)

### ✓ 业务流程索引.md
- 新增订单流程概述（创建订单、查询订单、更新订单）

### ✓ 业务流程详解.md
- 新增流程: "订单创建流程" 时序图
- 更新流程图中的代码位置引用

### ✓ 单元测试.md
- 新增测试示例: order_test.go:25-45 (订单创建测试)
- 新增测试示例: order_service_test.go:30-60 (订单服务测试)

### ✓ 仓库概览.md
- 更新技术栈版本信息
- 新增模块: 订单管理模块
- 更新知识库版本: commit f9e8d7c (2025-01-15)

## 需要人工处理

### ⚠ 核心业务领域.md
**原因**: 检测到新的业务模块 "订单管理"
**建议**: 请人工补充以下内容:
- 订单管理业务能力说明（用户视角）
- 订单业务规则和约束
- 订单相关的用户角色和权限

### ⚠ 业务流程详解.md
**原因**: 已自动添加"订单创建流程"时序图，但需要人工确认
**建议**: 请检查并完善:
- 时序图是否准确反映业务流程
- 是否需要补充其他订单相关流程（支付、取消等）
- 流程中的决策分支是否完整

### ⚠ 仓库架构.md
**原因**: 检测到架构变更（新增中间件）
**建议**: 请人工确认:
- 中间件层的架构图是否准确
- 是否需要补充架构决策说明
- 是否有其他架构层面的重要变更

### ⚠ 代码编写指南.md
**原因**: 检测到新的中间件模式 (src/middleware/trace.go)
**建议**: 确认是否需要将链路追踪模式添加到代码编写指南文档

## 未更新的内容

以下内容保持不变 (保留用户自定义内容):
- 核心业务领域.md (已有业务逻辑部分)
- 业务流程详解.md (现有流程描述)
- 仓库架构.md (架构决策说明)
- 代码编写指南.md (已有代码模式)
- 所有手动添加的说明和注释

## 下次更新

下次运行 \`/kb-update\` 将基于当前 commit (f9e8d7c) 进行增量更新。
\`\`\`

## 更新策略总结

### 自动更新 (直接执行)
- ✓ 依赖版本和列表
- ✓ API 端点和参数
- ✓ 数据库表结构
- ✓ 测试示例代码
- ✓ 技术性配置

### 提示用户确认 (不自动修改)
- ⚠ 新的业务模块
- ⚠ 业务流程变更
- ⚠ 架构设计变更
- ⚠ 新的代码模式 (如果影响重大)

### 永不修改 (始终保留)
- 🔒 用户手动编辑的业务说明
- 🔒 标记为 \`<!-- 手动添加 -->\` 的内容
- 🔒 核心业务领域的文字描述
- 🔒 业务规则和流程文档

## 异常处理

### 1. 找不到 .kb-meta.json
\`\`\`
错误: 找不到知识库元信息文件

知识库目录中没有 .kb-meta.json 文件，无法进行增量更新。

建议:
1. 首次生成知识库请运行: /kb-init
2. 如果知识库是旧版本，请备份后重新运行 /kb-init
\`\`\`

### 2. Git 仓库不存在或不是 Git 项目
\`\`\`
错误: 当前目录不是 Git 仓库

/kb-update 依赖 Git 版本控制进行差异分析。

建议:
1. 初始化 Git 仓库: git init
2. 或者切换到 Git 项目目录
\`\`\`

### 3. 基准 Commit 不存在
\`\`\`
错误: 基准 Commit (a1b2c3d) 在当前仓库中不存在

可能原因:
- 知识库是从其他分支生成的
- 提交历史被重写 (rebase/reset)

建议:
1. 备份当前知识库
2. 运行 /kb-init 重新生成完整知识库
\`\`\`

### 4. 没有变更
\`\`\`
知识库已是最新状态

当前 Commit (a1b2c3d) 与知识库基准 Commit 相同，无需更新。

提示: 当你提交新代码后，再运行 /kb-update 进行增量更新。
\`\`\`

## 成功标准

- ✓ 基于 Git diff 精确识别变更
- ✓ 只更新受影响的知识库文档
- ✓ 保留用户手动添加的内容
- ✓ 生成清晰的变更报告
- ✓ 记录更新历史，可追溯
- ✓ 对业务相关变更提示人工确认
- ✓ 更新后知识库版本与代码版本一致

`

export default INCREMENTAL_UPDATE_AGENT_TEMPLATE
