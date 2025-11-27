# Wiki 提示词优化计划 (针对幻觉、业务逻辑、规范性优化)

## 1. 需求分析与痛点定位

根据用户反馈，当前 Wiki 生成体系存在以下核心痛点：

1.  **幻觉严重**：AI 倾向于编造不存在的文件路径、函数名或依赖关系，导致生成的文档误导后续代码生成。
2.  **业务逻辑理解浅/隐式知识缺失**：AI 仅停留在代码表层翻译，无法提取代码中隐含的业务规则（如状态流转、权限校验、特定算法），导致生成的代码缺乏“业务灵魂”。
3.  **规范遵循差**：生成的代码风格与旧代码不一致，未复用现有工具类，导致代码库割裂。
4.  **理解深度不足**：未能识别项目中的核心约束和架构意图。

## 2. 优化策略

针对上述痛点，制定以下优化策略：

### A. 反幻觉增强 (Anti-Hallucination ++)
*   **策略**：引入“验证-执行-检查”严格协议。
*   **实现**：
    *   在 `common/constants.ts` 中升级 `ANTI_HALLUCINATION_RULES`，强制要求在输出任何路径前进行 `list_files` 验证。
    *   引入“置信度标记”，对于无法确定的逻辑，强制标注“待人工核实”。
    *   在所有模板中增加“来源自检清单”，强制 AI 在输出文档前自我审查每一个链接的有效性。

### B. 深度业务逻辑提取 (Deep Logic Extraction)
*   **策略**：引入“调用链深度追踪 (DFS)”与“隐式约束显性化”。
*   **实现**：
    *   **03_business-flow-doc.ts (业务流程)**：
        *   指令升级：要求 AI 模拟调试器，从 API 入口逐层追踪到 DB，**显式提取**中间的校验逻辑（Validation）、状态变更（State Change）和异常处理（Error Handling）。
        *   新增“业务规则表”章节，专门记录代码中隐含的 `if-else` 业务规则。
    *   **01_project-basic-analyze-agent.ts (项目分析)**：
        *   增加“领域词汇提取”，识别项目中的核心业务术语（Ubiquitous Language）。

### C. 规范遵循与复用强制 (Strict Compliance & Reuse)
*   **策略**：建立“强制复用清单”与“正反例对比”。
*   **实现**：
    *   **06_coding-standard-doc.ts (编码规范)**：
        *   新增“强制复用工具链”章节，列出项目中必须使用的 Utils、Helpers、BaseClasses，禁止重复造轮子。
        *   新增“反模式（Anti-Patterns）”章节，根据项目历史代码或 Lint 规则，明确列出“禁止这样做”的示例。
    *   **02_architecture-doc.ts (架构)**：
        *   强制 Mermaid 图节点与真实文件绑定，禁止画抽象的概念图。

## 3. 修改文件清单

| 文件路径 | 优化方向 |
| :--- | :--- |
| `src/core/costrict/wiki/wiki-prompts/common/constants.ts` | 升级反幻觉规则，增加“来源自检”通用提示词。 |
| `src/core/costrict/wiki/wiki-prompts/subtasks/01_project-basic-analyze-agent.ts` | 增加业务领域词汇识别，强化对“隐式约定”的分析。 |
| `src/core/costrict/wiki/wiki-prompts/subtasks/templates/03_business-flow-doc.ts` | **重点优化**。引入 DFS 追踪指令，提取校验、状态流转等隐式逻辑。 |
| `src/core/costrict/wiki/wiki-prompts/subtasks/templates/06_coding-standard-doc.ts` | **重点优化**。增加强制复用列表、正反例对比、反模式提取。 |
| `src/core/costrict/wiki/wiki-prompts/subtasks/templates/02_architecture-doc.ts` | 强化图表真实性约束，要求标注每个节点的物理路径。 |
| `src/core/costrict/wiki/wiki-prompts/subtasks/templates/04_api-doc.ts` | 增加字段级约束提取（正则、范围、默认值）。 |

## 4. 执行计划

1.  **Step 1: 基础设施升级**
    *   修改 `common/constants.ts`，定义更严格的 `ANTI_HALLUCINATION_RULES` 和 `DEEP_ANALYSIS_RULES`。

2.  **Step 2: 核心模板重构 (业务与规范)**
    *   重写 `03_business-flow-doc.ts`，植入深度追踪指令。
    *   重写 `06_coding-standard-doc.ts`，植入复用强制和反模式提取指令。

3.  **Step 3: 辅助模板优化**
    *   优化 `01_project-basic-analyze-agent.ts`，提升分析深度。
    *   优化 `02_architecture-doc.ts` 和 `04_api-doc.ts`，消除幻觉，增加细节。

4.  **Step 4: 验证与交付**
    *   检查所有修改是否符合 TypeScript 语法。
    *   提交修改。

## 5. 预期效果

*   **准确性**：文档中引用的文件路径 100% 真实存在。
*   **深度**：业务流程文档不再是流水账，而是包含校验规则和核心逻辑的深度说明。
*   **规范性**：编码规范文档明确指出“用什么工具”和“禁止怎么写”，直接指导 AI 生成符合风格的代码。