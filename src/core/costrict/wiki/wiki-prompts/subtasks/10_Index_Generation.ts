import { WIKI_OUTPUT_DIR } from "./constants"

export const INDEX_GENERATION_TEMPLATE = `# 项目技术文档索引生成

## 使用场景
为 ${WIKI_OUTPUT_DIR} 文件夹下的技术文档，生成结构化的索引目录文件，便于AI快速导航和信息定位。

## 输入要求
- **技术文档目录**: ${WIKI_OUTPUT_DIR} 文件夹下的所有.md技术文档
- **项目基本信息**: 从文档中提取项目名称、核心特性等
- **文档内容**: 各技术文档的核心内容和结构

# 项目技术文档索引生成任务

## 任务描述
扫描 ${WIKI_OUTPUT_DIR} 目录下的所有技术文档，分析其内容结构，生成一个结构化的索引文件，为AI提供快速的信息导航和定位能力。

### 项目概述信息提取
从 \`${WIKI_OUTPUT_DIR}01_{PROJECT_NAME}_Overview.md\` 文件中提取以下关键信息：
1. **项目定位**: 从"项目概述"或"项目定位"章节提取核心定位描述，控制在50字以内
2. **技术栈**: 从"技术栈分析"章节提取主要技术组件，控制在40字以内
3. **架构特点**: 从"架构设计"章节提取核心架构特色，控制在40字以内
4. **组织结构**: 从"项目组织结构"部分提取目录结构，简化为50行以内的核心结构，非核心或者超过部分折叠

### 信息提取原则
- 必须基于实际文档内容，不能虚构
- 优先提取最核心、最具代表性的信息
- 使用关键词和短语，避免冗长描述
- 确保信息对AI理解项目有实际帮助

## 输出格式要求

生成完整的索引文档：

### 文档结构
\`\`\`markdown
# {项目名称} 项目技术文档索引

## 📚 文档导航

本索引为AI提供{项目名称}项目的完整技术文档导航，支持快速信息定位和上下文理解。

### 📋 项目概述

**项目定位**: AI编程助手VSCode扩展
**技术栈**: TypeScript + Node.js + VSCode API + WebView
**架构特点**: 插件化架构 + 前后端分离

### 🏗️ 组织结构

\`\`\`
src/
├── core/           # 核心功能模块
├── integrations/   # 集成功能
├── utils/          # 工具函数
└── webview-ui/     # 前端界面
\`\`\`

### 🎯 核心文档概览

| 文档名称 | 文件路径 | 主要内容 | 适用场景 |
|---------|---------|---------|---------|
| **项目概览** | [\`01_{PROJECT_NAME}_Overview.md\`](${WIKI_OUTPUT_DIR}01_{PROJECT_NAME}_Overview.md) | {项目定位摘要} | 项目理解、技术选型、功能开发 |
| **整体架构** | [\`02_{PROJECT_NAME}_Architecture.md\`](${WIKI_OUTPUT_DIR}02_{PROJECT_NAME}_Architecture.md) | {架构模式摘要} | 架构设计、模块开发、系统集成 |
| **服务依赖** | [\`03_{PROJECT_NAME}_Service_Dependencies.md\`](${WIKI_OUTPUT_DIR}03_{PROJECT_NAME}_Service_Dependencies.md) | {服务间依赖摘要} | 依赖管理、性能优化、故障排查 |
| **数据流分析** | [\`04_{PROJECT_NAME}_Data_Flow_Integration.md\`](${WIKI_OUTPUT_DIR}04_{PROJECT_NAME}_Data_Flow_Integration.md) | {数据流模式摘要} | 数据处理、集成开发、性能调优 |
| **服务模块** | [\`05_{PROJECT_NAME}_Service_Analysis.md\`](${WIKI_OUTPUT_DIR}05_{PROJECT_NAME}_Service_Analysis.md) | {核心服务摘要} | 服务开发、代码重构、功能扩展 |
| **数据库分析** | [\`06_{PROJECT_NAME}_Database_Schema.md\`](${WIKI_OUTPUT_DIR}06_{PROJECT_NAME}_Database_Schema.md) | {数据库架构摘要} | 数据库设计、查询优化、数据迁移 |
| **API接口** | [\`07_{PROJECT_NAME}_API.md\`](${WIKI_OUTPUT_DIR}07_{PROJECT_NAME}_API.md) | {接口规范摘要} | API开发、接口测试、集成开发 |
| **部署分析** | [\`08_{PROJECT_NAME}_Deploy.md\`](${WIKI_OUTPUT_DIR}08_{PROJECT_NAME}_Deploy.md) | {部署方式摘要} | 部署配置、运维管理、扩容缩容 |

### 🚀 角色导向导航

#### 🆕 新手入门路径
1. **快速了解项目**: [\`项目概览\`](${WIKI_OUTPUT_DIR}01_{PROJECT_NAME}_Overview.md) → [\`API接口\`](${WIKI_OUTPUT_DIR}07_{PROJECT_NAME}_API.md)
2. **开发环境准备**: [\`项目规则\`](.roo/code-rules/generated_rules.md) → [\`部署分析\`](${WIKI_OUTPUT_DIR}08_{PROJECT_NAME}_Deploy.md)

#### 🏗️ 架构设计路径
1. **架构理解**: [\`整体架构\`](${WIKI_OUTPUT_DIR}02_{PROJECT_NAME}_Architecture.md) → [\`服务依赖\`](${WIKI_OUTPUT_DIR}03_{PROJECT_NAME}_Service_Dependencies.md)
2. **数据架构**: [\`数据流分析\`](${WIKI_OUTPUT_DIR}04_{PROJECT_NAME}_Data_Flow_Integration.md) → [\`数据库分析\`](${WIKI_OUTPUT_DIR}06_{PROJECT_NAME}_Database_Schema.md)

#### 💻 开发实施路径
1. **编码规范**: [\`项目规则\`](.roo/code-rules/generated_rules.md) → [\`服务模块\`](${WIKI_OUTPUT_DIR}05_{PROJECT_NAME}_Service_Analysis.md)
2. **接口开发**: [\`API接口\`](${WIKI_OUTPUT_DIR}07_{PROJECT_NAME}_API.md) → [\`数据库分析\`](${WIKI_OUTPUT_DIR}06_{PROJECT_NAME}_Database_Schema.md)

#### 🔧 运维部署路径
1. **部署配置**: [\`部署分析\`](${WIKI_OUTPUT_DIR}08_{PROJECT_NAME}_Deploy.md) → [\`项目规则\`](.roo/code-rules/generated_rules.md)
2. **系统维护**: [\`服务依赖\`](${WIKI_OUTPUT_DIR}03_{PROJECT_NAME}_Service_Dependencies.md) → [\`数据流分析\`](${WIKI_OUTPUT_DIR}04_{PROJECT_NAME}_Data_Flow_Integration.md)
\`\`\`

## 特别注意事项
1. 必须扫描 ${WIKI_OUTPUT_DIR} 目录下的实际文档文件；
2. 摘要信息必须从实际文档内容中提取，不能虚构；
3. 文档链接路径使用 ${WIKI_OUTPUT_DIR} 作为父路径；
4. 整个索引文档控制在100行以内，保持简洁；
5. 如果某个文档不存在，则不在索引中包含该项；
6. 只包含文档目录和快速导航两部分；
7. 所有摘要信息控制在30字以内，简洁明了；

## 输出文件命名
\`${WIKI_OUTPUT_DIR}index.md\`
注意：如果${WIKI_OUTPUT_DIR} 目录不存在，则创建。`
