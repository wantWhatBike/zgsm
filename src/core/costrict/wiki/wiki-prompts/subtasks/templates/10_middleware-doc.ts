import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants";

export const MIDDLEWARE_DOC_TEMPLATE = (workspace: string) => `# 中间件集成文档生成

## 角色定义
您是基础设施集成专家，负责说明本项目依赖的 Redis / MQ / 搜索 / 缓存等中间件的真实配置、封装与使用方式，确保 AI 能安全、准确地复用。

## 核心原则
- 以真实配置和代码示例为主，**无需图表**
- 禁止编造端口、凭证、Topic、Key；所有信息必须来自仓库
- 每个结论/示例标注来源路径，支持多路径
- 重点描述“如何接入 / 如何调用 / 失败重试 / 命名规范”

## 输入参数
- docId: "10"
- docName: "中间件集成"
- docFilename: "10_中间件集成.md"
- relatedSources: 中间件配置、封装、使用代码
- 项目分析结果：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程
1. 收集 package.json、Docker/K8s、.env 中声明的中间件
2. 读取 \`src/config/\`、\`src/service/\`、\`src/utils/\`、\`test/\` 下的相关文件
3. 归纳每类中间件的连接配置、封装服务、使用示例、命名规范、容错策略
4. 输出 Markdown 并执行 CODE_REFERENCE_RULES 自检

## 输出格式

\`\`\`markdown
# 中间件集成

<details>
<summary>相关源文件</summary>

- src/config/redis.ts
- src/service/cacheService.ts
- src/config/kafka.ts
- src/service/messageQueue.ts
- src/config/es.ts
- docker-compose.yml
- ...

</details>

## 概述
概述项目依赖的中间件及其承担的职责（缓存、事件总线、搜索等）。  
来源: package.json, docker-compose.yml

## 中间件清单

| 类型 | 版本/镜像 | 作用 | 配置文件 | 部署位置 |
|------|-----------|------|----------|----------|
| Redis | redis:7-alpine | 分布式缓存、会话 | src/config/redis.ts | docker-compose.yml |
| Kafka | confluentinc/cp-kafka:7 | 事件总线 | src/config/kafka.ts | k8s/middleware/kafka.yaml |
| Elasticsearch | 8.11 | 搜索 / 日志 | src/config/es.ts | docker-compose.yml |

来源: package.json, k8s/**, docker-compose.yml

---

## Redis

### 连接配置

\`\`\`typescript
// 摘自: src/config/redis.ts
import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD,
  db: Number(process.env.REDIS_DB || 0),
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

export const redis = new Redis(redisConfig);
\`\`\`

来源: src/config/redis.ts

### 缓存封装

\`\`\`typescript
// 摘自: src/service/cacheService.ts
export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const payload = JSON.stringify(value);
    await (ttl ? redis.set(key, payload, 'EX', ttl) : redis.set(key, payload));
  },
  async del(key: string): Promise<void> {
    await redis.del(key);
  },
};
\`\`\`

来源: src/service/cacheService.ts

### Key 设计

| 模式 | 含义 | TTL | 来源 |
|------|------|-----|------|
| \`user:{id}\` | 用户详情 | 3600s | src/utils/cacheKeys.ts |
| \`session:{token}\` | 会话状态 | 86400s | src/utils/cacheKeys.ts |
| \`lock:{resource}\` | 分布式锁 | 30s | src/utils/cacheKeys.ts |

### 使用示例

\`\`\`typescript
// 摘自: src/service/userService.ts
const cacheKey = CACHE_KEYS.user(userId);
const cached = await cacheService.get<User>(cacheKey);
if (cached) return cached;

const entity = await userRepo.findById(userId);
await cacheService.set(cacheKey, entity, CACHE_TTL.USER);
\`\`\`

来源: src/service/userService.ts

---

## 消息队列 / 流处理（Kafka）

### 连接配置

\`\`\`typescript
// 摘自: src/config/kafka.ts
import { Kafka, logLevel } from 'kafkajs';

export const kafka = new Kafka({
  clientId: 'costrict-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  ssl: process.env.KAFKA_USE_SSL === 'true',
  logLevel: logLevel.ERROR,
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: 'costrict-group' });
\`\`\`

来源: src/config/kafka.ts

### Topic 与负载

| Topic | 生产者 | 消费者 | 说明 | 来源 |
|-------|--------|--------|------|------|
| order.created | order-service | notification-service | 订单创建事件 | src/events/topics.ts |
| order.paid | payment-service | inventory-service | 支付完成事件 | src/events/topics.ts |
| user.registered | auth-service | notification-service | 注册欢迎通知 | src/events/topics.ts |

### 生产者封装

\`\`\`typescript
// 摘自: src/service/messageQueue.ts
export async function publishOrderCreated(payload: OrderEvent) {
  await producer.send({
    topic: TOPICS.ORDER_CREATED,
    messages: [{ key: payload.orderId, value: JSON.stringify(payload) }],
  });
}
\`\`\`

来源: src/service/messageQueue.ts

### 消费者示例

\`\`\`typescript
// 摘自: src/workers/orderWorker.ts
await consumer.subscribe({ topic: TOPICS.ORDER_PAID });
await consumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value?.toString() ?? '{}');
    await processOrderPaid(event);
  },
});
\`\`\`

来源: src/workers/orderWorker.ts

### 容错策略
- 使用 \`retry.initialRetryTime=100ms\` + \`retries=8\`（来源: src/config/kafka.ts）
- 消费失败写入 \`logs/error.log\` 并记录消息偏移量（来源: src/workers/orderWorker.ts）

---

## 搜索 / 分析（Elasticsearch）

### 连接配置

\`\`\`typescript
// 摘自: src/config/es.ts
import { Client } from '@elastic/elasticsearch';

export const esClient = new Client({
  node: process.env.ES_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ES_USERNAME || 'elastic',
    password: process.env.ES_PASSWORD || '',
  },
});
\`\`\`

来源: src/config/es.ts

### 索引与映射

| 索引 | 目的 | 映射文件 | 来源 |
|------|------|----------|------|
| products | 商品搜索 | src/es/mappings/products.json | src/es/mappings/products.json |
| orders | 订单过滤 | src/es/mappings/orders.json | src/es/mappings/orders.json |

### 查询封装

\`\`\`typescript
// 摘自: src/service/searchService.ts
export async function searchProducts(keyword: string) {
  const result = await esClient.search({
    index: 'products',
    body: {
      query: {
        multi_match: {
          query: keyword,
          fields: ['name^2', 'description'],
        },
      },
    },
  });
  return result.hits.hits.map((hit) => hit._source);
}
\`\`\`

来源: src/service/searchService.ts

---

## 规范与最佳实践

| 主题 | 要求 | 来源 |
|------|------|------|
| 配置管理 | 所有连接信息从 \`.env\` 读取，禁止硬编码 | src/config/* |
| Key/Topic 命名 | 统一在 \`src/utils/cacheKeys.ts\`、\`src/events/topics.ts\` 定义 | 各文件 |
| 重试与熔断 | 使用 \`retryStrategy\` (Redis) 与 Kafka 内建重试 | src/config/redis.ts, src/config/kafka.ts |
| 本地开发 | docker-compose 提供 Redis/Kafka/ES，按需启动 | docker-compose.yml |

\`\`\`

${CODE_REFERENCE_RULES}

## 质量检查
1. 已列出所有真实存在的中间件及其配置来源
2. 每个示例代码均附带来源路径
3. 无臆造端口、账号、Topic
4. 文档长度控制在 300–450 行，Markdown 结构清晰
`;

