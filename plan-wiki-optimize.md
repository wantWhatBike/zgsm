# Wiki 提示词体系优化计划

## 1. 现状分析与问题诊断

通过对 `src/core/costrict/wiki/wiki-prompts` 目录下代码的分析，发现现有提示词体系存在以下主要问题：

1.  **工具利用率低（核心痛点）**：
    *   **问题**：目前主要依赖 `read_file` 和 `list_files`。对于大型项目，仅靠阅读文件内容效率低下且容易遗漏。
    *   **影响**：在生成“业务流程”或“API文档”时，AI 难以跨文件追踪复杂的调用链（特别是接口与实现分离的情况），导致文档内容浅显，缺乏深度。
    *   **改进**：必须引入 `search_definitions` (查定义)、`search_references` (查引用/调用链)、`list_code_definition_names` (代码大纲) 等高级工具。

3.  **CoT (Chain of Thought) 引导不够具体**：
    *   **问题**：虽然有“执行流程”，但对于复杂的分析任务（如“深度追踪调用链”），缺乏具体的思维链引导。
    *   **改进**：细化“思考-执行-验证”的循环，强制 Agent 在输出前先在思维链中验证信息的准确性。

4.  **上下文管理策略缺失**：
    *   **问题**：缺乏对大文件的处理策略，容易撑爆上下文。
    *   **改进**：指导 Agent 优先使用 `list_code_definition_names` 了解大纲，再按需读取细节。

## 2. 优化目标

1.  **深度性**：通过高级工具追踪，生成包含完整调用链、隐式业务规则的深度文档。
2.  **准确性**：利用 `search_definitions` 获取精准的类型定义和函数签名，消除幻觉。
4.  **全面性**：覆盖更多代码细节，不遗漏关键逻辑。

## 3. 执行计划

### 阶段一：基础设施与公共规则优化
*   **目标**：建立新的工具使用规范和数据格式标准。
*   **文件**：`src/core/costrict/wiki/wiki-prompts/common/constants.ts`
*   **内容**：
    *   新增 `ADVANCED_TOOL_STRATEGY`：定义何时使用 `search_definitions` vs `read_file`。
    *   更新 `ANTI_HALLUCINATION_RULES`：加入对工具使用的约束。

### 阶段二：核心 Agent 逻辑优化
*   **目标**：提升项目分析的智能度和文档生成的执行力。
*   **文件**：
    *   `subtasks/01_project-basic-analyze-agent.ts`：引入 `list_code_definition_names` 进行更智能的项目概览分析，识别核心类/接口。
    *   `subtasks/02_document-generate-agent.ts`：作为调度器，增加对高级工具的调度逻辑，强化 CoT，指导子任务如何组合使用工具。

### 阶段三：核心模板深度优化 (重中之重)
*   **目标**：解决业务流程断链、API 定义不清、架构图不准的问题。
*   **文件**：
    *   `subtasks/templates/03_business-flow-doc.ts`：
        *   **策略**：强制使用 `search_references` 追踪调用链。
        *   **输出**：增加 `<business_rule>` 结构化块。
    *   `subtasks/templates/02_architecture-doc.ts`：
        *   **策略**：利用 `list_code_definition_names` 构建模块地图。
        *   **输出**：增加 `<module_dependency>` 结构化块。
    *   `subtasks/templates/04_api-doc.ts`：
        *   **策略**：使用 `search_definitions` 精准提取 Request/Response 类型定义。
        *   **输出**：增加 `<api_schema>` (OpenAPI 风格) 结构化块。

### 阶段四：其他模板与通用优化
*   **目标**：全面提升所有文档质量，保持风格统一。
*   **文件**：
    *   `subtasks/templates/05_data-storage-doc.ts`：增强对 ORM 关联关系的解析，输出 `<db_schema>`。
    *   `subtasks/templates/01_overview-doc.ts`：增加项目元数据块。
    *   `subtasks/templates/06_coding-standard-doc.ts`：提取更精准的代码模式。
    *   `subtasks/templates/07_testing-guide-doc.ts`：提取测试工具链配置。
    *   `subtasks/templates/08_build-deploy-doc.ts`：提取构建部署脚本逻辑。
    *   `subtasks/templates/00_default-doc.ts`：通用模板升级。

### 阶段五：索引与收尾
*   **目标**：生成更智能的索引，便于 AI 检索。
*   **文件**：`subtasks/03_index-generation-agent.ts`
*   **内容**：索引文件中包含各文档的结构化元数据摘要。

## 4. 验证标准
*   Prompt 中是否包含了对 `search_definitions`、`search_references` 等工具的明确调用指令？
*   CoT 是否引导了“先查定义，再查引用，最后阅读实现”的逻辑？