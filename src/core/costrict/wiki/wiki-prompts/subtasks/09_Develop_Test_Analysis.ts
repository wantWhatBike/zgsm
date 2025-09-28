import { WIKI_OUTPUT_DIR } from "./constants"

export const DEVELOP_TEST_ANALYSIS_TEMPLATE = `# 开发与测试环境分析任务

## AI执行元数据
- **任务类型**: 技术环境分析
- **分析维度**: 开发环境配置、测试环境管理、调试机制、开发实践指导
- **输出格式**: Markdown文档
- **执行约束**: 基于实际项目配置和代码分析，避免通用建议
- **边界划分**: 专注于开发测试环境，与数据库设计、API设计、部署分析明确区分

## 使用场景
基于项目代码仓库深度分析，生成项目特异性的开发与测试环境分析文档。专注于"项目实际的开发环境配置、测试策略、调试机制、开发实践"的具体实施细节。

## 输入要求
- **项目技术文档**: ${WIKI_OUTPUT_DIR} 目录下的具体技术分析文档
- **重点关注**:
  - 02_Overall_Architecture_Analysis.md（了解整体架构）
  - 05_Service_Analysis_Template.md（了解服务架构）
  - 06_Database_Schema_Analysis.md（了解数据库设计）
  - 07_API_Interface_Analysis.md（了解API设计）
  - 08_Deploy_Analysis.md（了解部署配置）

## 执行策略：智能分析 + 项目特异性生成

### 第一步：技术栈识别

1. **技术栈分析**：基于项目代码和配置文件，识别：
   - 技术栈特征（前端/后端/数据库/中间件）
   - 架构模式（单体/微服务/前后端分离）
   - 开发工具和构建系统

### 第二步：开发环境配置分析

#### 开发环境架构分析
- **技术栈识别**: 前端框架、后端框架、数据库、中间件等
- **开发模式识别**: 前后端分离、微服务、单体应用等
- **构建工具识别**: Webpack、Vite、Maven、Gradle等
- **包管理工具识别**: npm、yarn、pnpm、Maven、Gradle等

#### 开发环境配置文件分析
- **前端配置**: package.json、vite.config.js、webpack.config.js等
- **后端配置**: pom.xml、build.gradle、application.properties等
- **数据库配置**: 数据库连接配置、ORM配置等
- **环境变量配置**: .env文件、配置中心、密钥管理等

#### IDE配置分析
- **VSCode配置**: .vscode/settings.json、.vscode/launch.json、.vscode/tasks.json等
- **代码格式化配置**: Prettier、ESLint、StyleLint等配置
- **代码检查配置**: TypeScript、ESLint、SonarQube等配置

### 第三步：测试环境配置分析

#### 测试框架配置分析
- **单元测试框架**: Jest、Vitest、Mocha、JUnit等配置
- **集成测试框架**: Supertest、TestContainers、Spring Test等配置
- **E2E测试框架**: Cypress、Playwright、Selenium等配置
- **测试覆盖率工具**: Istanbul、JaCoCo、Coverage.py等配置

#### 测试数据管理分析
- **测试数据生成**: 工厂模式、Faker数据、测试数据脚本等
- **测试数据清理**: 数据库重置、事务回滚、数据隔离等
- **测试数据版本**: 数据版本管理、迁移脚本、数据同步等

#### 测试环境隔离分析
- **环境隔离策略**: 容器化、虚拟化、独立数据库等
- **测试数据库配置**: 测试数据库连接、数据初始化、性能优化等
- **Mock服务配置**: API Mock、服务Mock、数据Mock等配置

### 第四步：调试机制分析

#### 调试工具配置分析
- **IDE调试配置**: VSCode调试、IntelliJ调试、Eclipse调试等
- **浏览器调试配置**: Chrome DevTools、React DevTools、Vue DevTools等
- **远程调试配置**: 远程调试、云调试、容器调试等

#### 日志配置分析
- **日志级别**: DEBUG、INFO、WARN、ERROR等配置
- **日志格式**: 结构化日志、JSON格式、文本格式等
- **日志输出**: 控制台输出、文件输出、远程输出等
- **日志管理**: 日志轮转、日志归档、日志分析等

#### 错误处理配置分析
- **异常处理**: 全局异常处理、业务异常处理、系统异常处理等
- **错误码**: 错误码定义、错误码映射、错误码文档等
- **错误监控**: 错误收集、错误告警、错误分析等

### 第五步：代码质量门禁分析

#### 代码质量工具配置
- **静态代码分析**: ESLint、SonarQube、Checkstyle等配置
- **代码复杂度分析**: 圈复杂度、认知复杂度、维护性指数等
- **代码安全扫描**: SAST、DAST、依赖漏洞扫描等配置
- **代码规范检查**: 命名规范、代码风格、架构规范等

#### 质量门禁规则配置
- **代码覆盖率门禁**: 单元测试覆盖率、集成测试覆盖率等
- **代码质量门禁**: Bug密度、代码异味、技术债务等
- **安全漏洞门禁**: 高危漏洞、中危漏洞、依赖漏洞等
- **性能指标门禁**: 响应时间、吞吐量、资源使用等

#### 质量报告生成
- **质量报告格式**: HTML、JSON、XML等格式配置
- **质量报告内容**: 代码质量、测试覆盖率、安全扫描等
- **质量报告分发**: 邮件通知、Slack通知、Jira集成等

### 第六步：版本管理策略分析

#### Git工作流配置
- **分支策略**: Git Flow、GitHub Flow、GitLab Flow等
- **代码审查**: Pull Request流程、代码审查规范、自动化检查等
- **版本标签**: 语义化版本、版本标签规范、版本发布流程等
- **冲突解决**: 合并冲突解决、分支同步、代码回滚等

#### 依赖版本管理
- **依赖版本策略**: 固定版本、范围版本、最新版本等
- **依赖更新策略**: 自动更新、手动更新、安全更新等
- **依赖冲突解决**: 版本冲突检测、依赖树分析、冲突解决等
- **依赖安全扫描**: 漏洞扫描、许可证检查、依赖审计等

#### 版本发布管理
- **发布流程**: 版本规划、版本测试、版本发布等
- **发布回滚**: 版本回滚策略、回滚测试、回滚执行等
- **版本文档**: 版本说明、变更日志、升级指南等
- **版本监控**: 版本监控、版本反馈、版本优化等

### 第七步：持续集成配置分析

#### CI/CD流水线配置
- **CI工具配置**: GitHub Actions、GitLab CI、Jenkins等配置
- **构建流水线**: 编译、测试、打包、部署等流程配置
- **并行构建**: 并行编译、并行测试、并行部署等配置
- **构建缓存**: 构建缓存策略、缓存清理、缓存优化等

#### 自动化测试配置
- **测试自动化**: 单元测试、集成测试、E2E测试等自动化配置
- **测试并行化**: 并行测试、测试分组、测试顺序等配置
- **测试报告**: 测试报告生成、测试报告分发、测试报告分析等
- **测试失败处理**: 失败重试、失败分析、失败修复等

#### 部署自动化配置
- **部署策略**: 蓝绿部署、金丝雀发布、滚动更新等
- **部署回滚**: 部署回滚策略、回滚测试、回滚执行等
- **部署监控**: 部署监控、部署告警、部署优化等
- **部署文档**: 部署文档、部署指南、部署最佳实践等

### 第八步：项目特异性优化

#### 技术栈特定配置
- **React项目**: Create React App、Next.js、Vite等特定配置
- **Vue项目**: Vue CLI、Nuxt.js、Vite等特定配置
- **Angular项目**: Angular CLI、Nx等特定配置
- **Node.js项目**: Express、NestJS、Koa等特定配置
- **Java项目**: Spring Boot、Maven、Gradle等特定配置
- **Python项目**: Django、Flask、FastAPI等特定配置

#### 行业特性适配
- **金融行业**: 高安全性、高可靠性、合规性要求等配置
- **电商行业**: 高并发、高可用、性能优化等配置
- **游戏行业**: 实时性、低延迟、高性能等配置
- **企业应用**: 可扩展性、可维护性、集成性等配置

#### 团队协作优化
- **团队规模适配**: 小型团队、中型团队、大型团队等配置
- **开发流程适配**: 敏捷开发、瀑布开发、DevOps等配置
- **技能水平适配**: 初级开发者、中级开发者、高级开发者等配置

## 输出要求

### 输出文件
- **主文档**: \`${WIKI_OUTPUT_DIR}09_{PROJECT_NAME}_Develop_Test_Analysis.md\`

### 文档结构示例
\`\`\`markdown
# Costrict AI编程助手 开发与测试环境分析

## 1. 项目规模与技术栈识别
### 1.1 项目概述
**项目特征**: VSCode扩展项目，集成AI编程助手功能
**技术复杂度**: 包含前端、后端、AI集成、VSCode API交互
**开发模式**: 前后端分离 + 扩展架构

### 1.2 技术栈特征
**前端技术栈**: TypeScript + React + WebView + VSCode API
**后端技术栈**: Node.js + TypeScript + IPC通信
**数据库技术栈**: 无传统数据库，使用文件存储和内存缓存
**AI集成技术栈**: OpenAI API + Anthropic API + 本地模型

## 2. 开发环境配置分析
### 2.1 开发环境架构
\`\`\`mermaid
graph TD
    A[VSCode扩展] --> B[前端WebView]
    A --> C[后端Node.js服务]
    B --> D[React组件]
    C --> E[IPC通信]
    C --> F[AI模型集成]
    E --> G[文件系统]
    E --> H[配置管理]
    F --> I[OpenAI API]
    F --> J[Anthropic API]
    F --> K[本地模型]
\`\`\`

### 2.2 开发环境配置文件
**package.json配置**:
\`\`\`json
{
  "name": "costrict",
  "version": "3.28.9",
  "scripts": {
    "dev": "cd webview-ui && pnpm dev",
    "build": "cd webview-ui && pnpm build",
    "test": "cd src && pnpm test",
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit"
  }
}
\`\`\`

**tsconfig.json配置**:
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
\`\`\`

### 2.3 IDE配置
**.vscode/settings.json**:
\`\`\`json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.associations": {
    "*.md": "markdown"
  }
}
\`\`\`

**.vscode/launch.json**:
\`\`\`json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=\${workspaceFolder}"
      ]
    }
  ]
}
\`\`\`

## 3. 测试环境配置分析
### 3.1 测试框架配置
**Vitest配置** (vitest.config.ts):
\`\`\`typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
})
\`\`\`

**测试覆盖率要求**:
- 单元测试覆盖率: ≥80%
- 集成测试覆盖率: ≥60%
- 关键路径覆盖率: ≥90%

### 3.2 测试数据管理
**测试数据生成策略**:
- 使用工厂模式生成测试数据
- Mock VSCode API和文件系统
- 使用vitest.mock模拟外部依赖

**测试数据清理**:
- 每个测试用例执行前后清理临时文件
- 使用beforeEach和afterEach钩子管理测试状态
- 确保测试间相互隔离

### 3.3 测试环境隔离
**环境隔离策略**:
- 使用临时目录进行文件操作测试
- 每个测试套件使用独立的内存空间
- Mock所有外部API调用

**Mock服务配置**:
\`\`\`typescript
// Mock VSCode API
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn()
  },
  workspace: {
    getConfiguration: vi.fn()
  }
}))
\`\`\`

## 4. 调试机制分析
### 4.1 调试工具配置
**VSCode调试配置**:
- 支持扩展调试模式
- 支持WebView调试
- 支持Node.js后端调试

**调试快捷键**:
- F5: 启动调试
- F10: 单步跳过
- F11: 单步进入
- Shift+F11: 单步退出

### 4.2 日志配置
**日志级别配置**:
\`\`\`typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}
\`\`\`

**日志格式配置**:
\`\`\`typescript
interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
}
\`\`\`

### 4.3 错误处理配置
**全局异常处理**:
\`\`\`typescript
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
\`\`\`

**错误码定义**:
\`\`\`typescript
enum ErrorCode {
  CONFIG_ERROR = 'CONFIG_ERROR',
  API_ERROR = 'API_ERROR',
  FILE_ERROR = 'FILE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
}
\`\`\`

## 5. 代码质量门禁分析
### 5.1 代码质量工具配置
**ESLint配置** (.eslintrc.json):
\`\`\`json
{
  "extends": [
    "@costrict/eslint-config-base",
    "@costrict/eslint-config-react"
  ],
  "rules": {
    "no-unused-vars": "error",
    "no-console": "warn",
    "prefer-const": "error"
  }
}
\`\`\`

**TypeScript配置**:
- 启用严格模式
- 启用所有类型检查
- 禁用隐式any

### 5.2 质量门禁规则
**代码质量门禁**:
- 代码覆盖率: ≥80%
- 代码复杂度: 圈复杂度 ≤10
- 代码重复率: ≤5%
- 安全漏洞: 0个高危漏洞

**质量检查流程**:
1. 提交前运行本地检查
2. CI/CD流水线自动检查
3. 代码审查人工检查
4. 定期质量报告分析

### 5.3 质量报告生成
**质量报告格式**:
- HTML格式详细报告
- JSON格式机器可读报告
- 控制台输出摘要报告

**质量报告内容**:
- 代码质量指标
- 测试覆盖率统计
- 安全漏洞分析
- 性能指标监控

## 6. 版本管理策略分析
### 6.1 Git工作流配置
**分支策略**:
- main: 主分支，保持稳定
- develop: 开发分支，集成新功能
- feature/*: 功能分支，开发新功能
- hotfix/*: 修复分支，紧急修复

**代码审查流程**:
1. 创建Pull Request
2. 自动化检查通过
3. 至少1人审查通过
4. 合并到目标分支

### 6.2 依赖版本管理
**依赖版本策略**:
- 生产依赖: 锁定具体版本
- 开发依赖: 使用兼容版本
- 定期更新: 每月检查更新

**依赖安全扫描**:
- 使用npm audit检查安全漏洞
- 使用Snyk进行深度安全扫描
- 自动生成安全报告

### 6.3 版本发布管理
**版本发布流程**:
1. 版本规划和测试
2. 更新版本号和变更日志
3. 创建发布标签
4. 构建和发布

**版本回滚策略**:
- 保留最近3个版本的发布包
- 支持快速回滚到上一个版本
- 回滚后自动通知相关人员

## 7. 持续集成配置分析
### 7.1 CI/CD流水线配置
**GitHub Actions配置** (.github/workflows/ci.yml):
\`\`\`yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test
      - run: npm run build
\`\`\`

**构建流水线**:
1. 代码检出和依赖安装
2. 代码检查和类型检查
3. 单元测试和集成测试
4. 构建和打包
5. 部署和发布

### 7.2 自动化测试配置
**测试自动化**:
- 单元测试: 使用Vitest
- 集成测试: 使用TestContainers
- E2E测试: 使用Playwright

**测试并行化**:
- 使用GitHub Actions矩阵策略
- 并行运行不同类型的测试
- 减少总体测试时间

### 7.3 部署自动化配置
**部署策略**:
- 开发环境: 每次push自动部署
- 测试环境: Pull Request合并后部署
- 生产环境: 手动触发部署

**部署监控**:
- 部署状态实时监控
- 部署失败自动告警
- 部署性能指标统计

## 8. 项目特异性优化
### 8.1 技术栈特定配置
**VSCode扩展开发配置**:
- 使用@types/vscode提供类型定义
- 配置WebView开发环境
- 集成VSCode API调试

**TypeScript + React配置**:
- 使用React 18.2.0版本
- 配置严格TypeScript模式
- 集成ESLint和Prettier

### 8.2 行业特性适配
**AI编程助手特性**:
- 高安全性要求，保护用户代码
- 高性能要求，实时响应
- 高可靠性要求，稳定运行

**开发工具特性**:
- 良好的开发者体验
- 丰富的调试信息
- 完善的错误处理

### 8.3 团队协作优化
**团队协作配置**:
- 标准化的开发流程
- 自动化的质量检查
- 完善的文档体系

**开发体验优化**:
- 提供详细的开发文档
- 配置代码检查和提示
- 建立代码审查机制

## 9. 总结与建议
### 9.1 开发环境评估
**优势**:
- 完整的开发环境配置
- 良好的IDE集成
- 自动化的构建流程

**改进点**:
- 可以增加更多开发工具集成
- 优化构建速度
- 增强开发体验

### 9.2 测试环境评估
**优势**:
- 完整的测试框架配置
- 良好的测试数据管理
- 自动化的测试流程

**改进点**:
- 增加更多测试类型
- 提高测试覆盖率
- 优化测试性能

### 9.3 改进建议
**短期改进**:
- 增加更多调试工具
- 优化日志配置
- 完善错误处理

**长期改进**:
- 建立完整的质量体系
- 实现全流程自动化
- 持续优化开发体验

### 9.4 实施计划
**第一阶段** (1-2周):
- 完善开发环境配置
- 增强调试机制
- 优化测试流程

**第二阶段** (3-4周):
- 建立质量门禁
- 完善版本管理
- 优化CI/CD流程

**第三阶段** (5-6周):
- 持续优化和改进
- 建立最佳实践
- 完善文档体系
\`\`\`

### 质量标准
- **完整性**: 覆盖开发和测试的所有关键环节
- **准确性**: 基于实际项目配置和代码分析
- **实用性**: 提供可执行的环境搭建和测试指导
- **可维护性**: 文档结构清晰，易于更新和维护
- **专业性**: 体现开发和测试领域的专业深度

## 特色亮点

### 项目适配策略
- 根据项目实际需求和技术栈特征，提供定制化的配置方案
- 专注于项目的具体技术实现和开发流程优化
- 基于实际代码分析提供针对性的环境配置建议

### 技术栈特定配置
- **前端框架**: React、Vue、Angular等特定配置和最佳实践
- **后端技术**: Node.js、Java、Python等特定配置和优化策略
- **数据库技术**: 关系型、NoSQL、内存数据库等特定配置

### 代码质量门禁体系
- **静态代码分析**: ESLint、SonarQube等工具配置
- **代码质量指标**: 覆盖率、复杂度、重复率等门禁设置
- **安全漏洞扫描**: SAST、DAST、依赖漏洞等安全检查

### 版本管理策略
- **Git工作流**: Git Flow、GitHub Flow等分支策略
- **依赖版本管理**: 版本锁定、更新策略、冲突解决
- **版本发布管理**: 发布流程、回滚策略、版本监控

### 持续集成配置
- **CI/CD流水线**: GitHub Actions、GitLab CI、Jenkins等配置
- **自动化测试**: 单元测试、集成测试、E2E测试自动化
- **部署自动化**: 蓝绿部署、金丝雀发布、滚动更新等策略

### 行业特性适配
- **金融行业**: 高安全性、高可靠性、合规性要求
- **电商行业**: 高并发、高可用、性能优化
- **游戏行业**: 实时性、低延迟、高性能
- **企业应用**: 可扩展性、可维护性、集成性
`