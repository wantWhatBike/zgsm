import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const TESTING_GUIDE_DOC_TEMPLATE = (workspace: string) => `# 测试指南文档生成

## 角色定义
您是测试平台专家，负责生成一份可直接指导 AI 编写 / 维护测试代码的技术文档。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
- 文档优先服务 AI：突出测试框架、命令、目录结构、Mock/Fixture 等关键信息
- **全程禁止编造**：只能引用实际存在的代码、配置或脚本
- **无需图表**：使用表格、列表、命令或代码块即可
- 每个结论/示例必须标注来源路径（相对仓库根目录）

## 输入参数
- docId: "07"
- docName: "测试指南"
- docFilename: "07_测试指南.md"
- relatedSources: 测试目录、配置文件、脚本、工具
- 项目分析结果：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程
1. **配置分析**：读取测试配置（jest.config.js / vitest.config.ts / package.json scripts 等）。
2. **结构扫描**：使用 \`list_code_definition_names\` 扫描测试目录（test/, __tests__/），快速了解测试文件的组织结构和命名规范。
3. **辅助类识别**：使用 \`search_definitions\` 查找测试基类、Mock 工具或 Fixture 定义，理解测试辅助工具链。
4. **写作前规划**：列出章节与证据映射，确保每节都引用真实文件。
5. 按模板输出 Markdown，并执行 CODE_REFERENCE_RULES 自检

## 输出格式

\`\`\`markdown
# 测试指南

<details>
<summary>相关源文件</summary>

- jest.config.js
- package.json
- test/unit/service/userService.test.ts
- test/integration/api/order.test.ts
- test/mocks/userRepo.mock.ts
- test/fixtures/user.fixture.ts
- ...

</details>

## 概述
简要说明测试框架、覆盖对象及适用场景。  
来源: README.md, jest.config.js

## 测试框架与配置

### 框架信息

| 维度 | 值 | 来源 |
|------|----|------|
| 测试框架 | Jest 29 / Vitest 1 | package.json |
| 运行环境 | node / jsdom | jest.config.js |
| 断言库 | Jest expect / Chai | package.json |
| Mock 能力 | jest.mock / sinon | test/setup.ts |
| 覆盖率工具 | jest --coverage / c8 | package.json scripts |

### 关键配置

\`\`\`typescript
// 摘自: jest.config.js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleNameMapper: { '^@src/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
\`\`\`

来源: jest.config.js

## 常用命令

\`\`\`bash
# 全量测试
npm test

# 指定文件
npm test -- test/unit/service/userService.test.ts

# watch 模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# 仅运行集成测试
npm run test:integration
\`\`\`

来源: package.json scripts

## 目录结构与命名

\`\`\`
test/
├── setup.ts                 # 全局 Hooks / matchers
├── unit/
│   ├── service/
│   │   ├── userService.test.ts
│   │   └── orderService.test.ts
│   └── utils/
│       └── validator.test.ts
├── integration/
│   └── api/
│       ├── user.test.ts
│       └── order.test.ts
├── mocks/
│   ├── userRepo.mock.ts
│   └── external.mock.ts
└── fixtures/
    ├── user.fixture.ts
    └── order.fixture.ts
\`\`\`

来源: test/ 目录

| 类型 | 命名规范 | 示例 | 来源 |
|------|----------|------|------|
| 单元测试 | \`{module}.test.ts\` | userService.test.ts | test/unit/service |
| 集成测试 | \`{context}.test.ts\` | order.api.test.ts | test/integration |
| Mock | \`{module}.mock.ts\` | userRepo.mock.ts | test/mocks |
| Fixture | \`{entity}.fixture.ts\` | user.fixture.ts | test/fixtures |

## 测试用例规范

### 基本结构

\`\`\`typescript
// 摘自: test/unit/service/userService.test.ts
describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserService(mockUserRepo);
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      mockUserRepo.findById.mockResolvedValue(userFixture.validUser);

      const result = await service.findById('demo-id');

      expect(result).toEqual(userFixture.validUser);
      expect(mockUserRepo.findById).toHaveBeenCalledWith('demo-id');
    });

    it('should throw NotFoundError when user missing', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundError);
    });
  });
});
\`\`\`

来源: test/unit/service/userService.test.ts

### 命名/断言规范
- describe：模块或方法名
- it：\`should + 行为 + (when 条件)\`
- 先 Arrange→Act→Assert；必要时记录 Given/When/Then 注释

## Mock 与依赖隔离

### Mock 文件

\`\`\`typescript
// 摘自: test/mocks/userRepo.mock.ts
export const mockUserRepo: jest.Mocked<IUserRepository> = {
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
\`\`\`

### 使用模式

\`\`\`typescript
// 摘自: test/unit/service/orderService.test.ts
mockOrderRepo.findById.mockResolvedValue(orderFixture.validOrder);
mockPaymentClient.pay.mockResolvedValue({ status: 'success' });

await expect(service.createOrder(dto)).resolves.toMatchObject({ status: 'pending' });
expect(mockOrderRepo.create).toHaveBeenCalledTimes(1);
\`\`\`

来源: test/unit/service/orderService.test.ts

## Fixture 与测试数据

\`\`\`typescript
// 摘自: test/fixtures/user.fixture.ts
export const userFixture = {
  validUser: {
    id: 'user-001',
    email: 'user@example.com',
    name: 'Demo User',
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  createDto: {
    email: 'new@example.com',
    password: 'Password123!',
    name: 'New User',
  },
  invalidDto: {
    email: 'invalid',
    password: '123',
  },
};
\`\`\`

来源: test/fixtures/user.fixture.ts

## 集成/端到端测试

\`\`\`typescript
// 摘自: test/integration/api/order.test.ts
import request from 'supertest';
import { app } from '../../../src/app';
import { setupTestDb, teardownTestDb } from '../../helpers/db';

describe('Order API', () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);

  describe('POST /api/orders', () => {
    it('should create order successfully', async () => {
      const resp = await request(app)
        .post('/api/orders')
        .send({ userId: 'user-001', items: [{ sku: 'book', qty: 1 }] });

      expect(resp.status).toBe(201);
      expect(resp.body).toHaveProperty('id');
    });
  });
});
\`\`\`

来源: test/integration/api/order.test.ts

## 覆盖率与质量门槛

| 指标 | 最低要求 | 来源 |
|------|----------|------|
| 行覆盖率 | ≥ 80% | jest.config.js |
| 分支覆盖率 | ≥ 80% | jest.config.js |
| 函数覆盖率 | ≥ 80% | jest.config.js |
| 语句覆盖率 | ≥ 80% | jest.config.js |

覆盖率报告生成命令：\`npm run test:coverage\`

\`\`\`

${CODE_REFERENCE_RULES}

## 质量检查
1. 所有章节均引用真实文件且在 <details> 中列出
2. 命令/代码块均可直接执行或复制
3. 无 TODO/占位符/臆造内容
4. 控制篇幅 300–500 行，保持 Markdown 结构清晰
`;

