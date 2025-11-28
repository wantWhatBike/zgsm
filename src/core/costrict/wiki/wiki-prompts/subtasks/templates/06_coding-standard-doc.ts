import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ANTI_HALLUCINATION_RULES, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const CODING_STANDARD_DOC_TEMPLATE = (workspace: string) => `# 编码规范文档生成

## 角色定义
您是技术文档撰写专家，负责生成编码规范文档，帮助AI生成符合项目风格的代码。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
${ANTI_HALLUCINATION_RULES}
- **文档优先服务AI**（生成符合项目规范的代码）
- **无需图表**，以规则列表和代码示例为主
- **强制复用**：必须识别项目中已有的工具类、基类，禁止重复造轮子
- **正反对比**：必须提供 Correct vs Incorrect 代码对比

## 输入参数
- **文档信息**
  - docId: "06"
  - docName: "编码规范"
  - docFilename: "06_编码规范.md"
  - relatedSources: 配置和典型代码文件
  - contextScope: 上下文范围
  - globalContext: 全局上下文
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：分析代码规范配置
读取规范相关文件（.eslintrc, tsconfig.json 等）。

### 步骤2：提取真实代码证据 (EBR)
1. **命名规范分析**：基于 \`contextScope\`，使用 \`list_code_definition_names\` 扫描核心目录。
2. **复用组件识别**：
   - 扫描 \`utils/\`, \`common/\` 等目录。
   - 使用 \`search_definitions\` 提取核心工具函数（如 \`httpClient\`, \`logger\`）的签名。
   - **证据要求**：必须获取函数签名和注释，作为“强制复用”的证据。
3. **代码模式提取**：
   - 使用 \`read_file\` 读取典型的 Service/Controller 文件。
   - **提取片段**：截取一段“完美符合规范”的代码（包含导入、类定义、方法、错误处理）作为正例。

### 步骤3：生成文件
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}06_编码规范.md\`
- **强制**：所有示例代码必须标注 \`// 摘自: src/path/to/real/file.ts\`。

## 输出格式

\`\`\`markdown
# 编码规范

<details>
<summary>相关源文件</summary>

- .eslintrc.js
- .prettierrc
- tsconfig.json
- src/utils/example.ts
- src/service/userService.ts
- ...

</details>

## 概述
本文档描述项目的编码规范和最佳实践，AI生成代码时必须遵循这些规范
来源: 项目配置和代码分析

## 代码格式要求

### ESLint 配置

\`\`\`javascript
// 摘自: .eslintrc.js
module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    'no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    // ...
  },
};
\`\`\`

来源: .eslintrc.js

### Prettier 配置

\`\`\`json
// 摘自: .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
\`\`\`

来源: .prettierrc

### TypeScript 配置

\`\`\`json
// 摘自: tsconfig.json (关键配置)
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true
  }
}
\`\`\`

来源: tsconfig.json

---

## 命名规范

### 文件命名

| 类型 | 规范 | 示例 | 来源 |
|-----|-----|-----|-----|
| 组件文件 | PascalCase | UserProfile.tsx | src/components/ |
| 工具函数 | camelCase | formatDate.ts | src/utils/ |
| 服务文件 | camelCase + Service | userService.ts | src/service/ |
| 类型文件 | camelCase | types.ts, api.d.ts | src/types/ |
| 常量文件 | camelCase | constants.ts | src/config/ |

来源: 项目目录结构分析

### 变量命名

| 类型 | 规范 | 示例 |
|-----|-----|-----|
| 变量/函数 | camelCase | getUserById, userName |
| 常量 | UPPER_SNAKE_CASE | MAX_RETRY_COUNT |
| 接口 | PascalCase | UserService, IUserRepository |
| 枚举 | PascalCase | UserStatus |
| 枚举值 | UPPER_SNAKE_CASE | UserStatus.ACTIVE |
| 私有成员 | 下划线前缀 | _privateMethod |


### 示例

**真实代码证据 (Real Code Evidence)**

\`\`\`typescript
// 摘自: src/service/userService.ts
// (此处必须展示项目中真实存在的代码片段，包含变量命名、类结构等)
export class UserService {
  private readonly MAX_RETRIES = 3; // 常量命名证据
  
  async getUser(id: string): Promise<User> { // 方法命名证据
    // ...
  }
}
\`\`\`

来源: src/service/userService.ts

---

## 代码组织规范

### 文件结构

\`\`\`typescript
// 标准文件结构示例 - 摘自: src/service/orderService.ts

// 1. 导入语句
import { Injectable } from '@nestjs/common';  // 框架导入
import { Repository } from 'typeorm';          // 第三方库
import { Order } from '../models/order';        // 内部模块
import { OrderDto } from './dto/order.dto';     // 相对路径

// 2. 常量定义
const DEFAULT_PAGE_SIZE = 20;

// 3. 类型/接口定义
interface CreateOrderParams {
  // ...
}

// 4. 主要导出
export class OrderService {
  // 4.1 私有成员
  private readonly repo: Repository<Order>;

  // 4.2 构造函数
  constructor(repo: Repository<Order>) {
    this.repo = repo;
  }

  // 4.3 公共方法
  async create(params: CreateOrderParams): Promise<Order> {
    // ...
  }

  // 4.4 私有方法
  private validateOrder(order: Order): boolean {
    // ...
  }
}
\`\`\`

来源: src/service/orderService.ts

### 导入顺序

1. Node.js 内置模块
2. 框架模块（NestJS、Express等）
3. 第三方库
4. 内部模块（绝对路径）
5. 相对路径模块

来源: .eslintrc.js import/order 规则

---

## 错误处理规范

### 自定义错误类

\`\`\`typescript
// 摘自: src/utils/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', \`\${resource} not found\`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}
\`\`\`

来源: src/utils/errors.ts

### 错误处理模式

\`\`\`typescript
// 正确的错误处理- 摘自: src/service/userService.ts
async function getUser(id: string): Promise<User> {
  const user = await userRepo.findById(id);
  if (!user) {
    throw new NotFoundError('User');  // 使用自定义错误类
  }
  return user;
}

// API 层错误处理 - 摘自: src/api/user.ts
async function getUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.getUser(req.params.id);
    res.json(user);
  } catch (error) {
    next(error);  // 传递给错误中间件
  }
}
\`\`\`

来源: src/service/userService.ts, src/api/user.ts

---

## 强制复用工具链 (Mandatory Reuse)

> ⚠️ **警告**：AI 生成代码时，必须优先使用以下工具，禁止重复造轮子。

### 核心工具库

| 功能 | 强制使用模块 | 路径 | 禁止使用 |
|-----|-----|-----|-----|
| HTTP 请求 | \`httpClient\` | src/utils/http.ts | \`axios\`, \`fetch\` |
| 日志记录 | \`logger\` | src/utils/logger.ts | \`console.log\` |
| 缓存操作 | \`cacheService\` | src/service/cache.ts | \`redis.get/set\` |
| 错误处理 | \`AppError\` | src/utils/errors.ts | \`new Error()\` |
| 验证器 | \`validators\` | src/utils/validators.ts | 手写正则 |
| 时间处理 | \`dateUtil\` | src/utils/date.ts | \`moment\`, \`new Date()\` |

来源: src/utils/, src/service/

### 示例：正确 vs 错误

**❌ 错误示例 (禁止)**
\`\`\`typescript
// 直接使用 axios
import axios from 'axios';
const res = await axios.get('/api/user');

// 直接抛出 Error
if (!user) throw new Error('User not found');

// 使用 console.log
console.log('User created');
\`\`\`

**✅ 正确示例 (强制)**
\`\`\`typescript
// 使用封装的 httpClient
import { httpClient } from '@/utils/http';
const res = await httpClient.get('/api/user');

// 使用自定义错误
import { NotFoundError } from '@/utils/errors';
if (!user) throw new NotFoundError('User');

// 使用 logger
import { logger } from '@/utils/logger';
logger.info('User created');
\`\`\`

---

## 注释规范

### 函数注释

\`\`\`typescript
// 摘自: src/service/orderService.ts
/**
 * 创建订单
 * @param userId - 用户ID
 * @param items - 订单项列表
 * @returns 创建的订单
 * @throws {ValidationError} 订单项为空时
 * @throws {NotFoundError} 用户不存在时
 */
async function createOrder(userId: string, items: OrderItem[]): Promise<Order> {
  // ...
}
\`\`\`

来源: src/service/orderService.ts

### 代码注释

- 复杂逻辑必须添加注释说明
- TODO 注释格式：\`// TODO: 描述\`
- FIXME 注释格式：\`// FIXME: 描述\`

---

## 反模式 (Anti-Patterns)

> ⚠️ **警告**：以下模式在本项目中被明确禁止。

| 反模式 | 说明 | 替代方案 |
|-------|-----|---------|
| **Any 类型** | 禁止使用 \`any\` | 定义明确的 Interface 或使用 \`unknown\` |
| **魔法数字** | 禁止硬编码数字 | 使用 \`constants.ts\` 中的常量 |
| **回调地狱** | 禁止嵌套回调 | 使用 \`async/await\` |
| **巨型函数** | 函数超过 50 行 | 拆分为小函数 |
| **重复代码** | 相似代码超过 3 行 | 提取为公共函数 |
| **硬编码配置** | 禁止硬编码 URL/密码 | 使用 \`config/\` 或 \`process.env\` |

来源: .eslintrc.js

\`\`\`

${CODE_REFERENCE_RULES}

## 特殊要求
- **无需图表**：以规则表格和代码示例为主
- 所有规范必须从实际配置和代码中提取
- 必须提供正确和错误的代码示例
- 必须列出项目中应该复用的模块

## 质量要求
1. **真实性**：所有“正确示例”必须直接摘自项目中的真实文件，禁止手写伪代码。
2. **复用强制**：必须列出项目中实际存在的工具函数及其签名。
3. 规范必须和 ESLint/Prettier 配置一致。
4. 文档长度控制在 300-500 行。
`;
