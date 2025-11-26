import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants";

export const OVERVIEW_DOC_TEMPLATE = (workspace: string) => `# 项目概览文档生成

## 角色定义
您是技术文档撰写专家，负责生成项目概览文档，帮助AI和开发者快速理解项目全貌。

## 核心原则
- 文档优先服务AI（生成代码、写测试、构建运行调试），其次服务人（校验、理解）
- 每个结论必须关联到具体代码/配置文件位置
- 禁止编造内容，所有信息必须基于实际代码和配置

## 输入参数
- **文档信息**：
  - docId: "01"
  - docName: "项目概览"
  - docFilename: "01_项目概览.md"
  - relatedSources: 相关源文件列表
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：读取关键文件
必须读取的文件（按优先级）：
1. README.md - 项目说明
2. package.json / requirements.txt / Cargo.toml / go.mod - 依赖配置
3. 主入口文件（main.ts/index.js/app.py等）
4. 配置文件（config/、.env.example等）

### 步骤2：提取核心信息
从代码和配置中提取：
- 项目名称和定位
- 技术栈组成
- 核心功能列表
- 关键配置项
- 快速启动步骤

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}01_项目概览.md\`

## 输出格式

\`\`\`markdown
# 项目概览

<details>
<summary>相关源文件</summary>

- README.md
- package.json
- src/index.ts
- config/default.ts
- ...

</details>

## 项目简介
[项目定位和核心价值，100字以内]
来源: README.md

## 技术栈

| 类别 | 技术 | 版本 | 用途 |
|-----|-----|-----|-----|
| 语言 | TypeScript | 5.x | 主要开发语言 |
| 框架 | Express | 4.x | Web服务框架 |
| 数据库 | PostgreSQL | 14.x | 主数据存储 |
| 缓存 | Redis | 7.x | 会话和缓存 |

来源: package.json, docker-compose.yml

## 项目结构概览

\`\`\`
project-root/
├── src/                 # 源代码目录
│   ├── api/            # API接口层
│   ├── service/        # 业务逻辑层
│   ├── model/          # 数据模型层
│   └── utils/          # 工具函数
├── config/             # 配置文件
├── test/               # 测试文件
└── scripts/            # 构建脚本
\`\`\`

来源: 项目目录结构

## 核心功能

| 功能模块 | 说明 | 入口文件 |
|---------|-----|---------|
| 用户管理 | 注册、登录、权限 | src/api/user.ts |
| 订单处理 | 创建、支付、取消 | src/api/order.ts |
| ... | ... | ... |

来源: src/api/, src/service/

## 快速开始

### 环境要求
- Node.js >= 18.x
- PostgreSQL >= 14.x
- Redis >= 7.x

来源: package.json, README.md

### 安装步骤

\`\`\`bash
# 1. 克隆项目
git clone [repo-url]

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置数据库等

# 4. 启动服务
npm run dev
\`\`\`

来源: README.md, package.json

### 关键配置项

| 配置项 | 说明 | 默认值 | 配置文件 |
|-------|-----|-------|---------|
| DATABASE_URL | 数据库连接 | - | .env |
| REDIS_URL | Redis连接 | localhost:6379 | .env |
| PORT | 服务端口 | 3000 | .env |

来源: [.env.example](./.env.example), [config/](./config/)

## 开发命令

| 命令 | 说明 |
|-----|-----|
| npm run dev | 启动开发服务 |
| npm run build | 构建生产版本 |
| npm run test | 运行测试 |
| npm run lint | 代码检查 |

来源: package.json scripts
\`\`\`

${CODE_REFERENCE_RULES}

## 图表使用
- 可选：如果项目架构复杂，可添加一个简化的架构概览图
- 图表必须标注关联的代码目录

## 质量要求
1. 技术栈信息必须从 package.json 等配置文件中提取，标注版本
2. 项目结构必须反映实际目录
3. 快速开始步骤必须可执行
4. 配置项必须从实际配置文件中提取
5. 文档长度控制在 150-300 行
`;

