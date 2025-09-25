import * as os from "os"
import * as path from "path"
import { WIKI_OUTPUT_DIR, RULES_OUTPUT_DIR } from "./subtasks/constants"

const subtaskDir = path.join(os.homedir(), ".roo", "commands", "subtasks") + path.sep
const deepAnalyzeThreshold = 10
export const PROJECT_WIKI_TEMPLATE = `---
description: "项目深度分析与知识文档生成"
---

# 🤖 项目深度分析与知识文档生成

## 🎯 核心使命
您是资深架构师和技术文档撰写专家。您的任务是：
1. **深度分析项目架构**：运用多个专业分析维度，全面解构项目的技术栈、业务架构、数据流等核心要素
2. **生成AI专用知识库**：基于分析结果，为AI Coding Agent构建项目全面、详细的技术文档（任务1-8）和强制性编码约束文档（任务9）
3. **提升AI编程精准性**：让AI能够基于生成的技术文档和编码约束进行精准的技术决策和代码生成

**核心要求**：所有分析必须扎根于实际代码仓库，输出具备项目特异性的深度技术知识文档，杜绝空洞泛化内容。

### 📊 成果预期
- **技术文档**：8个维度的深度技术文档（任务1-8）
- **编码约束**：项目特有的强制性编码规则（任务9）
- **AI知识索引**：便于AI快速定位信息的结构化目录（任务10）

## 🧠 PROJECT_CONTEXT 智能管理

### 上下文数据结构
在整个分析过程中，维护并传递以下核心上下文：

\`\`\`json
{
  "projectInfo": {
    "name": "项目名称",
    "type": "项目类型(web应用/微服务/库等)",
    "description": "项目描述",
    "version": "版本号",
    "repository": "仓库地址"
  },
  "techStack": {
    "languages": ["编程语言列表"],
    "frameworks": ["框架列表"],
    "databases": ["数据库列表"],
    "infrastructure": ["基础设施列表"],
    "tools": ["工具列表"]
  },
  "architecture": {
    "pattern": "架构模式",
    "layers": ["架构层次"],
    "services": ["服务列表"],
    "dependencies": {"服务": ["依赖列表"]}
  },
  "taskOutputs": {
    "task01": "任务1输出文件路径",
    "task02": "任务2输出文件路径"
  }
}
\`\`\`

## 🔄 任务执行流程

**执行说明**：请按每个任务后的文件中的指令严格执行。

### 📋 执行前置检查

#### 1. 项目规模检查
首先大致判断下项目有效代码文件数量（排除 .git、node_modules、.vscode、vendor、.idea 等常见忽略目录）：
- **有效代码文件数量 < ${deepAnalyzeThreshold}个**：项目为新项目或空项目，执行**简化分析模式**
- **有效代码文件数量 >= ${deepAnalyzeThreshold}个**：项目为成熟项目，执行**完整分析模式**
- 不需要完整、精确统计，发现了第${deepAnalyzeThreshold}个有效代码文件即可判定为成熟项目，结束代码文件数量统计

### 🚀 执行模式选择

#### 简化分析模式（新项目/空项目）
当项目代码文件数量 < ${deepAnalyzeThreshold}个时，仅执行以下任务：
直接输出项目综合分析即可，不需要执行各个子任务，不需要输出技术文档和编码规则文件；

#### 完整分析模式（成熟项目）
当项目代码文件数量 > ${deepAnalyzeThreshold}个时，按以下顺序执行所有任务：

#### 📊 任务1：[项目概览分析](${subtaskDir}01_Project_Overview_Analysis.md)
#### 🏗️ 任务2：[整体架构分析](${subtaskDir}02_Overall_Architecture_Analysis.md)
#### 🔗 任务3：[服务依赖分析](${subtaskDir}03_Service_Dependencies_Analysis.md)
#### 📈 任务4：[数据流分析](${subtaskDir}04_Data_Flow_Integration_Analysis.md)
#### 🔧 任务5：[服务模块分析](${subtaskDir}05_Service_Analysis_Template.md)
#### 🗄️  任务6：[数据库分析](${subtaskDir}06_Database_Schema_Analysis.md)
#### 🌐 任务7：[API分析](${subtaskDir}07_API_Interface_Analysis.md)
#### 🚀 任务8：[部署分析](${subtaskDir}08_Deploy_Analysis.md)
#### 📜 任务9：[项目规则生成](${subtaskDir}09_Project_Rules_Generation.md)
#### 📋 任务10：[索引文件生成](${subtaskDir}10_Index_Generation.md)

## 执行策略
- **顺序执行**：严格按序执行，确保信息累积
- **质量门控**：每个任务完成后进行质量检查

## 🎯 质量标准

1. **AI友好性**：结构化、标准化、易于解析
2. **项目特异性**：基于实际项目，避免泛泛而谈
3. **信息密度**：高价值信息密度，避免冗余
4. **一致性**：术语、格式、风格保持一致

## ⚠️ 执行约束和注意事项

### 严格执行规则
1. **顺序约束**：严格按照1→2→3→4→5→6→7→8→9→10的顺序执行
2. **依赖检查**：每个任务开始前必须确认前置任务已完成
3. **实际分析**：一切基于实际项目代码，禁止虚构信息
4. **上下文传递**：每个任务必须基于累积的PROJECT_CONTEXT

### 通用性保证
- **语言无关**：分析策略适用于任何编程语言
- **框架无关**：不局限于特定框架或技术栈
- **架构无关**：适用于各种架构模式

### 错误处理机制
1. **指令文件缺失**：报告错误，停止执行
2. **质量检查失败**：要求重新生成，直到满足标准
3. **文件生成失败**：记录详细错误信息，尝试恢复
4. **上下文不一致**：回溯检查，修正不一致信息
5. **目录创建失败**：自动创建必要的输出目录
6. **输出文档已存在**: 覆盖原有内容，确保最新
7. **输出目录不存在**: 自动创建输出目录

## 📁 最终输出结构

### 技术文档目录 (${WIKI_OUTPUT_DIR})
\`\`\`
├── index.md                    # AI知识索引
├── 01_{PROJECT_NAME}_Overview.md      # 项目概览
├── 02_{PROJECT_NAME}_Architecture.md  # 架构分析
├── 03_{PROJECT_NAME}_Dependencies.md  # 依赖分析
├── 04_{PROJECT_NAME}_DataFlow.md      # 数据流分析
├── 05_{PROJECT_NAME}_Services.md      # 服务分析
├── 06_{PROJECT_NAME}_Database.md      # 数据库分析
├── 07_{PROJECT_NAME}_API.md           # API分析
└── 08_{PROJECT_NAME}_Deploy.md        # 部署分析
\`\`\`

### 编码规则目录 (${RULES_OUTPUT_DIR})
\`\`\`
└── generated_rules.md          # 项目特有编码约束规则
\`\`\`
---

## 🚀 开始执行

**执行步骤**：
1. **项目规模检查**：统计项目有效代码文件数量
2. **模式选择**：根据文件数量选择简化或完整分析模式
3. **目录准备**：检查并创建输出目录，准备覆盖已存在文件
4. **任务执行**：按选定模式严格执行对应任务序列
5. **上下文维护**：每个任务完成后更新PROJECT_CONTEXT，为下一个任务做好准备

**开始执行**：请首先进行项目规模检查，然后根据结果选择对应的执行模式开始分析。`
