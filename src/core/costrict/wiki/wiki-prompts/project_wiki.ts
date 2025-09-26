import {
  WIKI_OUTPUT_DIR,
  RULES_OUTPUT_DIR,
  SUBTASK_FILENAMES,
  subtaskDir,
  deepAnalyzeThreshold
} from "./subtasks/constants"
export const PROJECT_WIKI_TEMPLATE = `---
description: "项目深度分析与知识文档生成"
---

# 🤖 项目深度分析与知识文档生成

## 🎯 核心目标

**您的角色**：资深架构师和技术文档撰写专家

**主要任务**：为AI Coding Agent构建项目技术文档和编码约束，提升AI编程精准性

**质量标准**：
- 🤖 **AI友好**：结构化markdown，清晰标题层级，标准化术语
- 🎯 **项目特异**：基于实际代码仓库，具体技术栈细节，避免通用建议
- 📊 **信息密度**：高价值技术信息优先，避免冗余重复
- 🔄 **一致性**：术语统一，格式风格一致，交叉引用准确

## 🚀 执行流程

### 第一步：项目规模检查
**目标**：快速判断项目是否达到深度分析阈值（${deepAnalyzeThreshold}个代码文件）

**执行策略**：
1. **优先使用环境信息**：直接分析 \`<environment_details>\` 中的文件列表，给出结论
2. **补充工具分析**：如环境信息不足以判断，使用 \`list_files\`工具扫描主要源码目录

**判断规则**：
- ✅ **计入文件**：主流编程语言源码文件（.ts/.js/.py/.go/.java/.cpp/.c/.cs/.rb/.php/.sh等）
- ❌ **排除内容**：配置目录(.git/.vscode/node_modules/dist/build/vendor等)、文档文件、测试资源
- ⚡ **效率要求**：最多3次工具调用，基于目录结构估算，无需精确计数

**标准输出格式**：
\`\`\`
项目规模评估：[达到/未达到]阈值 → 选择[深度模式/精简模式]
\`\`\`

### 第二步：模式选择与确认
**基于第一步结果，自动选择执行模式**：

**IF** 项目规模未达到阈值 **THEN**：
- 选择 🔍 **精简模式**

**IF** 项目规模达到阈值 **THEN**：
- 选择 📚 **深度模式**

**输出确认**：明确声明"已选择 [精简模式/深度模式]，开始执行分析"

### 第三步：执行对应分析流程
**严格按照所选模式的执行流程进行**，禁止混合执行或跳过步骤

## 📋 分析模式

### 🔍 精简模式（小型项目）
**适用条件**：有效代码文件数未达到${deepAnalyzeThreshold}个阈值的项目

**执行步骤**：
1. **快速代码扫描**：使用 list_files 和 read_file 工具浏览主要源码文件
2. **技术栈识别**：基于文件扩展名、配置文件、依赖文件确定技术栈
3. **架构分析**：分析目录结构和主要模块划分
4. **功能梳理**：识别核心业务功能和技术功能

**分析内容**：
- ✅ **项目技术栈概览**：编程语言、框架、主要依赖
- ✅ **架构特点**：目录结构、模块划分、设计模式
- ✅ **核心功能**：主要业务功能、技术功能模块
- ✅ **技术选型**：关键技术决策和选型理由
- ✅ **规模评估**：代码量、复杂度、维护性评估

**输出要求**：
- 📝 **格式**：结构化markdown报告，直接在对话中输出
- 🎯 **长度**：500-1000字，重点突出，避免冗余
- 📊 **结构**：使用标题、列表、表格等提升可读性

### 📚 深度模式（大型项目）
**适用条件**：有效代码文件数达到${deepAnalyzeThreshold}个阈值的项目

**执行原则**：
- 🔄 **严格顺序**：必须按1→2→3→4→5→6→7→8→9→10的顺序执行
- 📖 **任务驱动**：每个任务开始前，使用 read_file 工具读取对应的任务指令文件
- ✅ **完成确认**：每个任务完成后，明确声明"任务X已完成"再进行下一个
- 📁 **文件生成**：每个任务必须生成对应的输出文件到指定目录

**子任务清单**：

| 序号 | 任务名称 | 指令文件 | 分析目标 |
|------|----------|----------|----------|
| 1 | 📊 项目概览分析 | [${SUBTASK_FILENAMES.PROJECT_OVERVIEW_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.PROJECT_OVERVIEW_TASK_FILE}) | 生成项目整体概览文档 |
| 2 | 🏗️ 整体架构分析 | [${SUBTASK_FILENAMES.OVERALL_ARCHITECTURE_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.OVERALL_ARCHITECTURE_TASK_FILE}) | 分析项目架构设计和模式 |
| 3 | 🔗 服务依赖分析 | [${SUBTASK_FILENAMES.SERVICE_DEPENDENCIES_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.SERVICE_DEPENDENCIES_TASK_FILE}) | 梳理服务间依赖关系 |
| 4 | 📈 数据流分析 | [${SUBTASK_FILENAMES.DATA_FLOW_INTEGRATION_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.DATA_FLOW_INTEGRATION_TASK_FILE}) | 分析数据流转和集成方式 |
| 5 | 🔧 服务模块分析 | [${SUBTASK_FILENAMES.SERVICE_ANALYSIS_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.SERVICE_ANALYSIS_TASK_FILE}) | 深入分析各服务模块 |
| 6 | 🗄️ 数据库分析 | [${SUBTASK_FILENAMES.DATABASE_SCHEMA_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.DATABASE_SCHEMA_TASK_FILE}) | 分析数据库设计和模式 |
| 7 | 🌐 API分析 | [${SUBTASK_FILENAMES.API_INTERFACE_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.API_INTERFACE_TASK_FILE}) | 梳理API接口设计 |
| 8 | 🚀 部署分析 | [${SUBTASK_FILENAMES.DEPLOY_ANALYSIS_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.DEPLOY_ANALYSIS_TASK_FILE}) | 分析部署配置和策略 |
| 9 | 📋 索引文件生成 | [${SUBTASK_FILENAMES.INDEX_GENERATION_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.INDEX_GENERATION_TASK_FILE}) | 生成AI知识库索引 |
| 10 | 📜 项目规则生成 | [${SUBTASK_FILENAMES.PROJECT_RULES_TASK_FILE}](${subtaskDir}${SUBTASK_FILENAMES.PROJECT_RULES_TASK_FILE}) | 生成项目特有编码规则 |

## ⚠️ 执行约束

### 严格执行规则
1. **顺序约束**：精简模式按1→2→3→4执行，深度模式按1→2→3→4→5→6→7→8→9→10执行
2. **依赖检查**：每个任务开始前必须确认前置任务已完成
3. **实际分析**：一切基于实际项目代码，禁止虚构信息

### 错误处理机制
1. **指令文件缺失**：报告错误，停止执行
2. **质量检查失败**：要求重新生成，直到满足标准
3. **文件生成失败**：记录详细错误信息，尝试恢复
4. **目录创建失败**：自动创建必要的输出目录
5. **输出文档已存在**: 覆盖原有内容，确保最新

## 📁 输出结构（仅深度模式）

**技术文档** (${WIKI_OUTPUT_DIR})：
\`\`\`
├── index.md                           # AI知识索引
├── 01_{PROJECT_NAME}_Overview.md      # 项目概览
├── 02_{PROJECT_NAME}_Architecture.md  # 架构分析
├── 03_{PROJECT_NAME}_Dependencies.md  # 依赖分析
├── 04_{PROJECT_NAME}_DataFlow.md      # 数据流分析
├── 05_{PROJECT_NAME}_Services.md      # 服务分析
├── 06_{PROJECT_NAME}_Database.md      # 数据库分析
├── 07_{PROJECT_NAME}_API.md           # API分析
└── 08_{PROJECT_NAME}_Deploy.md        # 部署分析
\`\`\`

**编码规则** (${RULES_OUTPUT_DIR})：
\`\`\`
└── generated_rules.md                 # 项目特有编码约束规则
\`\`\`

---

**🎬 开始执行**：请首先进行项目规模检查，然后根据结果选择对应的执行模式开始执行。`
