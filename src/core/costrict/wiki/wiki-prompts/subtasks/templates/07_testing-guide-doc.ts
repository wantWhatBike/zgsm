import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const TESTING_GUIDE_DOC_TEMPLATE = (workspace: string) => `# 测试指南文档生成 (v3.0)

## 角色定义
您是测试平台专家，负责生成一份可直接指导 AI 编写 / 维护测试代码的技术文档。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
- **文档优先服务 AI**：突出测试框架、命令、目录结构、Mock/Fixture 等关键信息。
- **全程禁止编造**：只能引用实际存在的代码、配置或脚本。
- **泛化支持**：
  - **Web**: 关注 Unit Test, Integration Test (API), E2E.
  - **Lib**: 关注 Unit Test, Benchmark.
  - **CLI**: 关注 Command Execution Test (Stdout/Stderr).

## 输入参数
- **文档信息**：
  - docId: "07"
  - docName: "测试指南"
  - docFilename: "07_测试指南.md"
  - relatedSources: 测试目录、配置文件、脚本、工具
  - contextScope: 上下文范围
  - globalContext: 全局上下文
  - projectType: 项目类型
  - techStack: 技术栈
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：配置分析
读取测试配置（如 \`jest.config.js\`, \`go.mod\`, \`pytest.ini\`, \`Cargo.toml\`）。

### 步骤2：提取真实用例证据 (EBR)
1. **扫描测试文件**：基于 \`contextScope\`，使用 \`list_files\` 找到典型的测试文件。
2. **读取测试代码**：
   - 使用 \`read_file\` 读取 1-2 个完整的测试文件。
   - **证据要求**：必须提取完整的测试定义代码块（如 \`describe/it\`, \`func TestXxx\`, \`#[test]\`），展示真实的测试写法。
3. **辅助类识别**：
   - 提取 Mock 工具、Fixture 或 Test Helper 的定义。

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}07_测试指南.md\`

## 输出格式

\`\`\`markdown
# 测试指南

<details>
<summary>相关源文件</summary>

- {{CONFIG_FILE}}
- {{TEST_FILE}}
- ...

</details>

## 概述
简要说明测试框架、覆盖对象及适用场景。
来源: README.md, {{CONFIG_FILE}}

## 测试框架与配置

### 框架信息

| 维度 | 值 | 来源 |
|------|----|------|
| 测试框架 | [Framework Name] | {{DEPENDENCY_FILE}} |
| 运行环境 | [Env] | {{CONFIG_FILE}} |
| 断言库 | [Assertion Lib] | {{DEPENDENCY_FILE}} |

### 关键配置

\`\`\`
// 摘自: {{CONFIG_FILE}}
[Config Snippet]
\`\`\`

## 常用命令

\`\`\`bash
# 运行所有测试
[Command]

# 运行单个测试
[Command]

# 生成覆盖率
[Command]
\`\`\`

来源: {{DEPENDENCY_FILE}} / Makefile

## 目录结构与命名

\`\`\`
test/
├── unit/
├── integration/
└── ...
\`\`\`

| 类型 | 命名规范 | 示例 | 来源 |
|------|----------|------|------|
| 单元测试 | [Pattern] | {{TEST_FILE}} | [Path] |
| 集成测试 | [Pattern] | [Example] | [Path] |

## 测试用例规范

### 基本结构

**真实用例证据 (Real Test Case Evidence)**

\`\`\`
// 摘自: {{TEST_FILE}}
{{TEST_SNIPPET}}
// (此处必须展示项目中真实存在的测试代码片段)
\`\`\`

### 编写规范
- **命名**：[Naming Convention]
- **结构**：Arrange-Act-Assert (AAA)

## Mock 与依赖隔离

### Mock 方式

\`\`\`
// 摘自: [Mock File Path]
[Mock Example]
\`\`\`

## 测试数据 / Fixture

\`\`\`
// 摘自: [Fixture File Path]
[Fixture Example]
\`\`\`

\`\`\`

${CODE_REFERENCE_RULES}

## 质量要求
1. **真实性**：所有测试用例示例必须直接摘自项目中的真实文件，禁止手写伪代码。
2. **配置实证**：必须展示真实的配置文件内容。
3. **语言适配**：
   - **Go**: 展示 \`func TestXxx(t *testing.T)\` 和 Table Driven Tests.
   - **Java**: 展示 JUnit \`@Test\` 和 Mockito.
   - **Python**: 展示 PyTest fixture 和 parametrize.
`;
