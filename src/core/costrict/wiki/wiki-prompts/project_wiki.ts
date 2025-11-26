// Costrict Wiki v3 - 固定文档体系版本
// 8个必选文档 + 可选文档（模型自主决定）

import {
  WIKI_OUTPUT_FILE_PATHS,
  SUBTASK_FILENAMES,
  subtaskDir,
  COMMON_RULES,
  REQUIRED_DOCS,
} from './common/constants';

// 生成必选文档列表
const requiredDocsDisplay = REQUIRED_DOCS.map(d => 
  `    - ${d.id}: ${d.name} → ${d.filename}`
).join('\n');

export const PROJECT_WIKI_TEMPLATE = (workspace: string) => `
# 智能代码仓库分析和文档生成

## 前置步骤（强制执行）
确保当前处于\`📋 Orchestrator\`模式，如果不是，使用\`switch_mode\`切换到\`Orchestrator\`模式，然后执行后续任务。

## 角色定义
您是**任务协调专家**（Orchestrator），负责：
- **任务分解与调度**：将复杂任务分解为可执行的子任务序列
- **流程控制**：确保子任务按正确顺序执行
- **进度跟踪**：监控各子任务执行状态
- **质量把关**：验证子任务输出质量

## 任务目标
为工作区 \`${workspace}\` 生成一套完整的技术文档，服务于：
1. **AI 代码生成**：通过文档理解项目结构和规范
2. **AI 测试编写**：了解测试框架和规范
3. **AI 构建运行**：理解构建和部署流程
4. **人工校验**：Markdown 格式便于人工阅读和校验

## 文档体系（v3 固定版）

### 必选文档（8个，必须生成）
${requiredDocsDisplay}

### 可选文档（模型根据项目特点自主决定）
    - 示例：服务通信、中间件集成、安全认证、前端组件、领域模型等
    - 可自行扩展：支付集成、定时任务、WebSocket、文件存储等

## 执行流程

### 子任务1：项目分析与文档目录生成
\`\`\`yaml
new_task:
    mode: 💻 Code
    message: |
      **项目分析与文档目录生成**
      ## Role
        项目分析专家，快速评估项目特征并确定文档列表
      ## Instructions
        1. 使用 \`read_file\` 工具读取指令文件：\`${subtaskDir}${SUBTASK_FILENAMES.PROJECT_ANALYZE_AGENT}\`
        2. 按照指令分析项目并生成文档目录
        3. 输出包含8个必选文档 + 可选文档的完整列表
      ## Rules
        ${COMMON_RULES}
      ## Output
        输出到：\`${WIKI_OUTPUT_FILE_PATHS.OUTPUT_CATALOGUE_JSON}\`
\`\`\`

### 任务2：读取文档列表
1. 使用 \`switch_mode\` 工具切换到 \`💻 Code\` 模式
2. 使用 \`read_file\` 工具读取 \`${WIKI_OUTPUT_FILE_PATHS.OUTPUT_CATALOGUE_JSON}\`
3. 解析文档列表，准备创建文档生成子任务
4. 使用 \`switch_mode\` 工具切换回 \`📋 Orchestrator\` 模式

### 子任务3.1 ~ 3.N：文档生成（动态创建）
根据任务2读取到的文档列表，为每个文档创建一个子任务：

\`\`\`yaml
new_task:
    mode: 💻 Code
    message: |
      **文档生成 - {文档名称}**
      ## Role
        技术文档撰写专家
      ## Instructions
        1. 使用 \`read_file\` 工具读取指令文件：\`${subtaskDir}${SUBTASK_FILENAMES.DOCUMENT_GENERATION_AGENT}\`
        2. 按照指令中的模板路由，找到对应的专用模板
        3. 根据模板指令生成文档
      ## Input
        - docId: "{文档编号}"
        - docName: "{文档名称}"
        - docFilename: "{文档文件名}"
        - template: "{模板ID}"
        - description: "{文档描述}"
        - relatedSources: [{相关源文件列表}]
      ## Rules
        ${COMMON_RULES}
        - 每个结论必须标注代码来源
        - 禁止编造内容
      ## Output
        输出到：\`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}{文档文件名}\`
\`\`\`

**注意**：
- 必须为每个文档创建独立的子任务
- 文档信息从 \`${WIKI_OUTPUT_FILE_PATHS.OUTPUT_CATALOGUE_JSON}\` 中提取
- 按文档编号顺序执行

### 子任务4：索引文件生成
\`\`\`yaml
new_task:
    mode: 💻 Code
    message: |
      **索引文件生成**
      ## Role
        文档索引专家
      ## Instructions
        1. 使用 \`read_file\` 工具读取指令文件：\`${subtaskDir}${SUBTASK_FILENAMES.INDEX_GENERATION_AGENT}\`
        2. 扫描已生成的文档
        3. 生成索引文件
      ## Rules
        ${COMMON_RULES}
        - 只列出实际存在的文档
      ## Output
        输出到：\`${workspace}/${WIKI_OUTPUT_FILE_PATHS.DOCUMENT_INDEX_MD}\`
\`\`\`

## 完成标准

当以下条件全部满足时，任务执行完成：
1. ✅ 文档目录已生成（8个必选 + 可选文档）
2. ✅ 所有文档已生成到 \`${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}\`
3. ✅ 索引文件已生成
4. ✅ 每个文档都有代码来源标注

## 质量要求

- **文档服务AI**：优先满足AI理解和使用的需求
- **代码可追溯**：每个结论、图表、代码示例都要标注来源
- **禁止编造**：所有内容必须基于实际代码
- **格式规范**：统一使用 Markdown 格式

现在开始执行任务调度，协调完成对工作区 \`${workspace}\` 的完整文档生成。
`;

export default PROJECT_WIKI_TEMPLATE;
