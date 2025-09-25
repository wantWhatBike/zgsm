import { WIKI_OUTPUT_DIR } from "./constants"

export const INDEX_GENERATION_TEMPLATE = `# 项目技术文档索引生成

## 使用场景
为 ${WIKI_OUTPUT_DIR} 文件夹下的技术文档和 \`.roo/code-rules/generated_rules.md \` 文件，生成结构化的索引目录文件，便于AI快速导航和信息定位。

## 输入要求
- **技术文档目录**: ${WIKI_OUTPUT_DIR} 文件夹下的所有.md技术文档
- **项目基本信息**: 从文档中提取项目名称、核心特性等
- **文档内容**: 各技术文档的核心内容和结构

# 项目技术文档索引生成任务

## 任务描述
扫描 ${WIKI_OUTPUT_DIR} 目录下的所有技术文档，分析其内容结构，生成一个结构化的索引文件，为AI提供快速的信息导航和定位能力。

## 输出格式要求

生成完整的索引文档：

### 文档结构
\`\`\`markdown
# {项目名称} 项目技术文档索引

## 📚 文档导航

#### 1. [项目概览分析](${WIKI_OUTPUT_DIR}01_{PROJECT_NAME}_Overview.md)
- **项目定位**: {项目定位摘要}
- **技术栈**: {主要技术栈摘要}
- **架构特点**: {架构特色摘要}

#### 2. [整体架构分析](${WIKI_OUTPUT_DIR}02_{PROJECT_NAME}_Architecture.md)
- **架构模式**: {架构模式摘要}
- **核心组件**: {核心组件摘要}
- **设计决策**: {设计决策摘要}

#### 3. [服务依赖分析](${WIKI_OUTPUT_DIR}03_{PROJECT_NAME}_Service_Dependencies.md)
- **依赖关系**: {服务间依赖摘要}
- **关键依赖**: {外部依赖摘要}
- **容错机制**: {容错机制摘要}

#### 4. [数据流分析](${WIKI_OUTPUT_DIR}04_{PROJECT_NAME}_Data_Flow_Integration.md)
- **数据流模式**: {数据流模式摘要}
- **集成模式**: {集成模式摘要}
- **一致性保证**: {一致性机制摘要}

#### 5. [服务模块分析](${WIKI_OUTPUT_DIR}05_{PROJECT_NAME}_Service_Analysis.md)
- **核心服务**: {核心服务摘要}
- **服务接口**: {接口设计摘要}
- **质量属性**: {性能指标摘要}

#### 6. [数据库分析](${WIKI_OUTPUT_DIR}06_{PROJECT_NAME}_Database_Schema.md)
- **数据库设计**: {数据库架构摘要}
- **数据模型**: {数据结构摘要}
- **ER图**: {数据模型摘要}

#### 7. [API接口分析](${WIKI_OUTPUT_DIR}07_{PROJECT_NAME}_API.md)
- **API设计**: {接口规范摘要}
- **接口文档**: {端点定义摘要}
- **认证授权**: {安全机制摘要}

#### 8. [部署分析](${WIKI_OUTPUT_DIR}08_{PROJECT_NAME}_Deploy.md)
- **部署架构**: {部署方式摘要}
- **基础设施**: {基础设施摘要}
- **运维指南**: {运维说明摘要}

#### 9. [项目规则](.roo/code-rules/generated_rules.md)
- **代码规范**: {编码标准摘要}
- **开发流程**: {开发工作流摘要}
- **部署规范**: {部署规范摘要}

## 🎯 快速导航

### 新人入门
1. [项目概览](\${WIKI_OUTPUT_DIR}01_{PROJECT_NAME}_Overview.md) → [API文档](\${WIKI_OUTPUT_DIR}07_{PROJECT_NAME}_API.md)

### 架构师参考
1. [整体架构](\${WIKI_OUTPUT_DIR}02_{PROJECT_NAME}_Architecture.md) → [服务依赖](\${WIKI_OUTPUT_DIR}03_{PROJECT_NAME}_Service_Dependencies.md) → [数据流](\${WIKI_OUTPUT_DIR}04_{PROJECT_NAME}_Data_Flow_Integration.md)

### 开发者指南
1. [项目规则](../.roo/code-rules/generated_rules.md) → [服务模块](\${WIKI_OUTPUT_DIR}05_{PROJECT_NAME}_Service_Analysis.md) → [数据库设计](\${WIKI_OUTPUT_DIR}06_{PROJECT_NAME}_Database_Schema.md)

### 运维人员参考
1. [部署分析](\${WIKI_OUTPUT_DIR}08_{PROJECT_NAME}_Deploy.md) → [项目规则](../.roo/code-rules/generated_rules.md)
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
