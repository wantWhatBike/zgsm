import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants";

export const SERVICE_COMM_DOC_TEMPLATE = (workspace: string) => `# 服务通信文档生成

## 角色定义
您是技术文档撰写专家，负责生成服务通信文档，帮助AI理解微服务之间的调用方式、协议和配置。

## 核心原则
- 文档优先服务AI（理解服务调用方式以生成正确的调用/集成代码）
- **可使用服务调用图**展示服务关系和依赖
- 所有配置与示例必须来自实际代码或配置文件
- 禁止编造服务、接口或网络拓扑

## 输入参数
- **文档信息**：
  - docId: "09"
  - docName: "服务通信"
  - docFilename: "09_服务通信.md"
  - relatedSources: 服务通信相关文件/目录
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：分析服务配置
读取以下文件以掌握服务注册与调用信息：
- gRPC proto 定义
- HTTP/REST 客户端或 SDK
- 服务注册/发现配置（Consul、Eureka、Nacos 等）
- API Gateway / 反向代理配置
- docker-compose / k8s manifest 中的服务段落

### 步骤2：提取服务定义与调用方式
从代码中梳理：
- 服务列表（名称、地址、端口、协议）
- 对外暴露的接口（gRPC 方法、REST 路径、消息 Topic）
- 客户端调用方式、认证/鉴权要求
- 熔断、重试、降级策略

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}09_服务通信.md\`

## 输出格式

\`\`\`markdown
# 服务通信

<details>
<summary>相关源文件</summary>

- src/proto/user.proto
- src/client/userClient.ts
- src/config/service.ts
- docker-compose.yml
- ...

</details>

## 概述
本文档描述微服务之间的通信方式、协议定义和调用规范。
来源: 服务配置与通信相关代码

## 服务架构

\`\`\`mermaid
graph TB
    Gateway[API Gateway] --> UserSvc[User Service]
    Gateway --> OrderSvc[Order Service]
    Gateway --> ProductSvc[Product Service]

    OrderSvc --> UserSvc
    OrderSvc --> ProductSvc
    OrderSvc --> PaymentSvc[Payment Service]

    UserSvc --> NotifySvc[Notification Service]
\`\`\`

相关代码: src/config/service.ts, docker-compose.yml

## 服务列表

| 服务名 | 地址 | 协议 | 说明 |
|-------|------|------|-----|
| user-service | user-svc:50051 | gRPC | 用户服务 |
| order-service | order-svc:50052 | gRPC | 订单服务 |
| product-service | product-svc:8080 | REST | 商品服务 |
| payment-service | payment-svc:8081 | REST | 支付服务 |

来源: src/config/service.ts, docker-compose.yml

---

## gRPC 服务

### Proto 定义

\`\`\`protobuf
// 摘自: src/proto/user.proto
syntax = "proto3";

package user;

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc UpdateUser(UpdateUserRequest) returns (User);
}

message User {
  string id = 1;
  string email = 2;
  string name = 3;
  string status = 4;
}
\`\`\`

来源: src/proto/user.proto

### gRPC 客户端使用

\`\`\`typescript
// 摘自: src/client/userClient.ts
import { UserServiceClient } from '../proto/user_grpc_pb';
import { GetUserRequest, User } from '../proto/user_pb';
import * as grpc from '@grpc/grpc-js';

class UserClient {
  private client: UserServiceClient;

  constructor() {
    const address = process.env.USER_SERVICE_URL || 'localhost:50051';
    this.client = new UserServiceClient(address, grpc.credentials.createInsecure());
  }

  async getUser(id: string): Promise<User.AsObject> {
    return new Promise((resolve, reject) => {
      const request = new GetUserRequest();
      request.setId(id);

      this.client.getUser(request, (err, response) => {
        if (err) return reject(err);
        resolve(response.toObject());
      });
    });
  }
}

export const userClient = new UserClient();
\`\`\`

来源: src/client/userClient.ts

---

## REST 服务调用

### HTTP Client 封装

\`\`\`typescript
// 摘自: src/client/productClient.ts
import { httpClient } from '../utils/http';

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:8080';

export const productClient = {
  async getProduct(id: string): Promise<Product> {
    const response = await httpClient.get(\`\${PRODUCT_SERVICE_URL}/api/products/\${id}\`);
    return response.data;
  },

  async listProducts(params: ListParams): Promise<ProductList> {
    const response = await httpClient.get(\`\${PRODUCT_SERVICE_URL}/api/products\`, { params });
    return response.data;
  },

  async checkStock(productId: string, quantity: number): Promise<boolean> {
    const response = await httpClient.post(\`\${PRODUCT_SERVICE_URL}/api/products/\${productId}/check-stock\`, {
      quantity,
    });
    return response.data.available;
  },
};
\`\`\`

来源: src/client/productClient.ts

---

## 服务发现

### 配置

\`\`\`typescript
// 摘自: src/config/service.ts
export const serviceConfig = {
  registry: {
    type: 'consul', // or nacos / eureka
    host: process.env.CONSUL_HOST || 'localhost',
    port: parseInt(process.env.CONSUL_PORT || '8500'),
  },
  services: {
    'user-service': {
      protocol: 'grpc',
      healthCheck: '/health',
    },
    'product-service': {
      protocol: 'http',
      healthCheck: '/api/health',
    },
  },
};
\`\`\`

来源: src/config/service.ts

---

## 熔断与降级

### 配置

\`\`\`typescript
// 摘自: src/config/circuitBreaker.ts
import CircuitBreaker from 'opossum';

const defaultOptions = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

export function createCircuitBreaker<T>(fn: (...args: any[]) => Promise<T>, options = defaultOptions) {
  const breaker = new CircuitBreaker(fn, options);
  breaker.on('open', () => logger.warn('Circuit breaker opened'));
  breaker.on('halfOpen', () => logger.info('Circuit breaker half-opened'));
  return breaker;
}
\`\`\`

来源: src/config/circuitBreaker.ts

### 使用示例

\`\`\`typescript
// 摘自: src/service/orderService.ts
import { createCircuitBreaker } from '../config/circuitBreaker';
import { userClient } from '../client/userClient';

const getUserBreaker = createCircuitBreaker((id: string) => userClient.getUser(id));

async function getOrderWithUser(orderId: string) {
  const order = await orderRepo.findById(orderId);
  const user = await getUserBreaker.fire(order.userId).catch(() => ({ id: order.userId, name: 'Unknown' }));
  return { ...order, user };
}
\`\`\`

来源: src/service/orderService.ts

---

## 调用规范

### 超时与重试

| 服务类型 | 超时时间 | 重试次数 |
|---------|---------|---------|
| gRPC | 5s | 2 |
| REST | 10s | 3 |
| 内部同步 | 30s | 1 |

来源: src/config/service.ts

### 错误处理

\`\`\`typescript
// 摘自: src/client/base.ts
async function callService<T>(fn: () => Promise<T>, serviceName: string): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (error.code === 'UNAVAILABLE') {
      logger.error(\`Service \${serviceName} unavailable\`);
      throw new ServiceUnavailableError(serviceName);
    }
    if (error.code === 'DEADLINE_EXCEEDED') {
      logger.error(\`Service \${serviceName} timeout\`);
      throw new TimeoutError(serviceName);
    }
    throw error;
  }
}
\`\`\`

来源: src/client/base.ts

## 相关文档
- [代码架构](./02_代码架构.md)
- [API接口文档](./04_API接口文档.md)
\`\`\`

${CODE_REFERENCE_RULES}

## 图表要求
- 必须包含服务架构图展示服务间调用关系
- 图中的服务必须与实际配置一致

## 质量要求
1. Proto 定义、客户端代码、配置示例必须来自实际文件
2. 服务信息需与部署/注册配置保持一致
3. 调用规范需覆盖认证、超时、重试或熔断策略
4. 文档长度控制在 250-400 行
`;

