import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants"

export const DATA_STORAGE_DOC_TEMPLATE = (workspace: string) => `# 数据存储文档生成

## 角色定义
您是技术文档撰写专家，负责生成数据存储文档，帮助 AI 理解数据库、缓存、消息队列等存储结构，以便正确读写数据。

## 核心原则
- 文档优先服务 AI：表结构、索引、字段类型必须与代码/DDL 完全一致
- 仅使用表格/代码块，禁止虚构
- 每个存储组件必须关联到具体文件（模型、迁移、配置）
- 若仓库不存在某存储（如 Redis/MQ），对应章节写“未检测到”并说明依据

## 输入参数
- **文档信息**：
  - docId: "05"
  - docName: "数据存储"
  - docFilename: "05_数据存储.md"
  - relatedSources: models/, entity/, migrations/, config/database.ts, config/redis.ts, config/mq.ts 等
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程
1. 扫描 ORM 模型 / schema / migrations，提取所有表定义、字段、索引、关系
2. 读取缓存配置与 Key 约定，列出命名规则、过期策略
3. 读取消息队列配置（Kafka/RabbitMQ 等），列出 topic/queue、消费者
4. 若存在对象存储/搜索（S3/ES），也需列出结构与索引
5. 输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}05_数据存储.md\`

## 输出格式

\`\`\`markdown
# 数据存储

<details>
<summary>相关源文件</summary>

- src/models/user.ts
- src/models/order.ts
- prisma/migrations/*
- src/config/database.ts
- src/config/redis.ts
- src/config/mq.ts
- ...

</details>

## 概述
概述项目采用的存储类型（关系型数据库/缓存/消息队列/对象存储），以及对应文件位置。
来源: src/models/, src/config/

## 数据库设计

### 数据库信息

| 项目 | 值 |
|-----|----|
| 类型 | PostgreSQL / MySQL / SQLite |
| ORM/Schema | Prisma / TypeORM / Sequelize |
| 连接配置 | config/database.ts |
| 迁移目录 | prisma/migrations/ |

来源: package.json, src/config/database.ts

### 表结构总览

| 表名 | 说明 | 模型/Schema 文件 | 迁移文件 |
|------|------|-----------------|----------|
| users | 用户表 | src/models/user.ts | prisma/migrations/20240101010101_create_users |
| orders | 订单表 | src/models/order.ts | prisma/migrations/20240102020202_create_orders |
| ... | ... | ... | ... |

来源: src/models/, prisma/migrations/

#### 示例：users 表

**DDL（截取）**

\`\`\`sql
-- 摘自: prisma/migrations/20240101010101_create_users/migration.sql
CREATE TABLE "users" (
  "id" UUID PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "password" VARCHAR(255) NOT NULL,
  "name" VARCHAR(100),
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL
);
CREATE INDEX "users_status_idx" ON "users" ("status");
\`\`\`

**字段定义**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 用户 ID |
| email | varchar(255) | UNIQUE, NOT NULL | 邮箱 |
| password | varchar(255) | NOT NULL | 密码哈希 |
| name | varchar(100) | NULL | 显示名称 |
| status | enum | DEFAULT 'active' | 状态 |
| created_at | timestamp | DEFAULT now() | 创建时间 |

**模型片段**

\`\`\`typescript
// 摘自: src/models/user.ts
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  email: string

  @Column()
  password: string

  @Column({ nullable: true })
  name?: string

  @Column({ type: "enum", enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus
}
\`\`\`

来源: prisma/migrations/**, src/models/user.ts

#### 关系/索引汇总

| 关系 | 类型 | 源表 → 目标表 | 外键 |
|------|------|---------------|------|
| users → orders | OneToMany | users.id → orders.user_id | FK users.id |
| orders → order_items | OneToMany | orders.id → order_items.order_id | FK orders.id |

来源: src/models/

## 缓存设计（Redis，如存在）

### 连接配置

\`\`\`typescript
// 摘自: src/config/redis.ts
export const redisConfig = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  db: Number(process.env.REDIS_DB ?? 0)
}
\`\`\`

### Key 设计

| Key 模式 | 说明 | TTL | 读写位置 |
|----------|------|-----|----------|
| user:{userId} | 用户详情缓存 | 3600s | src/service/cacheUser.ts |
| session:{token} | 会话缓存 | 86400s | src/service/sessionService.ts |

来源: src/service/cache*.ts, src/utils/cacheKeys.ts

## 消息队列（Kafka/RabbitMQ，如存在）

### Topic/Queue 配置

| 名称 | 类型 | 说明 | 生产者 | 消费者 | 配置文件 |
|------|------|------|--------|--------|----------|
| order.created | topic | 订单创建事件 | orderService | notificationWorker | src/config/mq.ts |
| email.send | queue | 邮件发送任务 | notificationService | emailWorker | src/config/mq.ts |

### 消息 Schema

\`\`\`typescript
// 摘自: src/types/events.ts
export interface OrderCreatedEvent {
  orderId: string
  userId: string
  totalAmount: number
  createdAt: string
}
\`\`\`

来源: src/types/events.ts, src/workers/**

## 对象存储 / 搜索（如存在）

| 组件 | 配置文件 | Bucket/Index | 说明 |
|------|----------|--------------|------|
| S3 | src/config/s3.ts | files-bucket | 存储用户上传文件 |
| Elasticsearch | src/config/es.ts | logs-* | 检索日志 |

来源: src/config/s3.ts, src/config/es.ts

## 数据迁移与维护

| 操作 | 命令 | 来源 |
|------|------|------|
| 运行迁移 | npm run db:migrate | package.json scripts |
| 回滚迁移 | npm run db:rollback | package.json scripts |
| 生成迁移 | npm run db:generate -- --name create_table | package.json scripts |

\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. 表结构、字段、索引、关系必须源自模型或迁移文件
2. 若文件中存在 DDL，需截取核心片段展示
3. 缓存/MQ/S3 等章节仅在真实存在时输出，否则标注“未检测到相关配置（来源: …）”
4. 所有来源引用仅使用文件/目录路径
5. 文档长度控制在 300-600 行
`

