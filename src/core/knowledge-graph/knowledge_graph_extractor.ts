import * as path from "path"

// 知识图谱提取配置常量
export const KNOWLEDGE_GRAPH_VERSION = "v1.0.0"
export const KNOWLEDGE_GRAPH_OUTPUT_DIR = ".cospec" + path.sep + "knowledge-graph" + path.sep
export const KNOWLEDGE_GRAPH_STAGING_OUTPUT_DIR =
	".cospec" + path.sep + "knowledge-graph" + path.sep + ".staging" + path.sep

// 项目规模阈值
export const SMALL_PROJECT_THRESHOLD = 50
export const MEDIUM_PROJECT_THRESHOLD = 200

// 输出文件名常量
export const OUTPUT_FILENAMES = {
	ROOT_INFO: "root_info.md",
	PROCESSING_UNITS: "processing_units.txt",
	FILE_LIST: "file_list.txt",
	PROJECT_SCALE: "project_scale.txt",
	FILE_SUMMARIES: "file_summaries.jsonl",
	DIR_SUMMARIES: "dir_summaries.jsonl",
	GLOBAL_RELATIONS: "global_relations.md",
	STRUCTURE_TREE: "structure_tree.md",
	MINDMAP: "mindmap.md",
	INDEX: "index.md",
} as const

// 输出路径模板常量
export const OUTPUT_PATHS = {
	ROOT_INFO: (workspace: string) => `${workspace}${KNOWLEDGE_GRAPH_STAGING_OUTPUT_DIR}${OUTPUT_FILENAMES.ROOT_INFO}`,
	PROCESSING_UNITS: (workspace: string) =>
		`${workspace}${KNOWLEDGE_GRAPH_STAGING_OUTPUT_DIR}${OUTPUT_FILENAMES.PROCESSING_UNITS}`,
	FILE_LIST: (workspace: string) => `${workspace}${KNOWLEDGE_GRAPH_STAGING_OUTPUT_DIR}${OUTPUT_FILENAMES.FILE_LIST}`,
	FILE_SUMMARIES: (workspace: string) =>
		`${workspace}${KNOWLEDGE_GRAPH_OUTPUT_DIR}${OUTPUT_FILENAMES.FILE_SUMMARIES}`,
	DIR_SUMMARIES: (workspace: string) => `${workspace}${KNOWLEDGE_GRAPH_OUTPUT_DIR}${OUTPUT_FILENAMES.DIR_SUMMARIES}`,
	STRUCTURE_TREE: (workspace: string) =>
		`${workspace}${KNOWLEDGE_GRAPH_OUTPUT_DIR}${OUTPUT_FILENAMES.STRUCTURE_TREE}`,
	PROJECT_MINDMAP: (workspace: string) => `${workspace}${KNOWLEDGE_GRAPH_OUTPUT_DIR}${OUTPUT_FILENAMES.MINDMAP}`,
	INDEX: (workspace: string) => `${workspace}${KNOWLEDGE_GRAPH_OUTPUT_DIR}${OUTPUT_FILENAMES.INDEX}`,
} as const

// 重复的长字符串常量（超过10字且重复3次以上）
export const REPEATED_LONG_STRINGS = {
	NEW_SUBTASK: "创建如下 `subtask`子任务，然后执行，根据实际情况填充Input、Background等信息：",
	PROJECT_BACKGROUND_INFO: `项目背景信息：${OUTPUT_PATHS.ROOT_INFO}`,
	FILE_LIST_INPUT: `项目文件清单：${OUTPUT_PATHS.FILE_LIST}`,
	FILE_SUMMARIES_INPUT: `文件摘要：${OUTPUT_PATHS.FILE_SUMMARIES}`,
	DIR_SUMMARIES_INPUT: `目录摘要：${OUTPUT_PATHS.DIR_SUMMARIES}`,
	PROCESSING_UNITS_INPUT: `处理单元分组列表：${OUTPUT_PATHS.PROCESSING_UNITS}`,
	VERSION_INFO: "版本信息：[Git Tag/分支]",
	STRUCTURE_TREE: `项目目录树： ${OUTPUT_PATHS.STRUCTURE_TREE}`,
	FUNCTION_MINDMAP: `项目思维导图：${OUTPUT_PATHS.PROJECT_MINDMAP}`,
	INDEX: `主索引文件：${OUTPUT_PATHS.INDEX}`,
} as const

/**
 * 知识图谱提取提示词模板
 * 实现纯LLM提示词的代码仓库知识图谱提取功能
 */
export const KNOWLEDGE_GRAPH_EXTRACTOR_TEMPLATE = (workspace: string) => `---
description: "代码仓库知识图谱提取"
---

#### 模式切换（强制进行）
优先确保当前处于 Orchestrator模式。
**注意**：本模式确认步骤不进行任何多余分析。
\`\`\`
如果当前模式不是 Orchestrator 模式：
    → 使用 \`switch_mode\`工具切换到 Orchestrator 模式
    → 等待确认
    → 输出："已切换到 Orchestrator 模式"
否则：
    → 输出："当前已在 Orchestrator 模式"
\`\`\`

# 🧠 代码仓库知识图谱提取

## 🎯 任务目标
通过纯LLM提示词引导，深度挖掘项目根目录关键信息，提取文件/目录的结构化摘要，构建包含层级关系、功能关联、全链路依赖的知识图谱，帮助AI和人类从宏观到细节理解项目全貌。

## 🚀 执行概览

**整体流程**：
1. **项目规模评估** → 确定处理模式和策略
2. **根目录信息提取** → 挖掘技术骨架与业务背景
3. **目录拆解与分组** → 控制处理规模和优先级
4. **文件摘要生成** → 结构化文件功能与依赖
5. **目录摘要生成** → 建立层级关系与协作
6. **全局关联聚合** → 提取跨目录依赖与协作
7. **可视化输出** → 生成结构树与思维导图
8. **主索引生成** → 创建快速检索映射

## 📋 详细执行步骤

**执行要点**：
- **模式切换**：必须先切换到 Orchestrator（📋 协调器）模式
- **严格顺序**：按 1→2→3→4→5→6→7→8→9→... 顺序执行
- **子任务委托**：每个子任务委托给子任务各自在\`执行模式\`定义的模式执行
- **协调管理**：Orchestrator 负责协调和跟踪进度
- **上下文管理**：通过子任务分解避免上下文累积过长
- **完成确认**：每个子任务完成后声明"子任务X已完成"
- **任务返回**： 每个子任务需使用\`attempt_completion\`工具返回精简的关键信息，供父任务传递到后续子任务使用
- **文件输出**：每个子任务必须生成对应文件

#### 子任务指令模板
\`\`\`
new_task:
    mode: {执行模式}
    message: |
      **{子任务名称}**
      ## Role
      {角色定义}
      ## Instructions
      {指令内容}
      ## Rules
      {注意事项}
      ## Input
      {输入内容}
      ## Output
      {输出内容}
      ## Output Example
      {输出示例}
      ## Background
      {背景信息}
      ## Todos
      {待办事项列表}
\`\`\`

## 前置步骤：模式切换（强制执行）
   确保当前处于 Orchestrator 模式，准备执行后续子任务

## 子任务序列
**注意**：以下子任务必须创建 \`subtask\` 子任务形式执行
\`\`\`\`\`   

### 子任务1：项目文件列表生成（**执行模式**：💻 Code）

${REPEATED_LONG_STRINGS.NEW_SUBTASK}

\`\`\`\`
## Role
工具执行器 - 严格按照指令执行工具调用和结果验证的程序化执行单元。

## Instructions
1. **工具调用**：
   - 工具名称：\`generate_files_list\`
   - 源目录参数：sourcedir = ${workspace}
   - 目标目录参数：target_dir = ${workspace}/${KNOWLEDGE_GRAPH_STAGING_OUTPUT_DIR}

2. **执行验证**：
   - 工具执行完成后，验证输出文件：${OUTPUT_PATHS.FILE_LIST(workspace)} 存在即可，不需要做内容校验。

3. **错误处理**：
   - 如果工具执行失败，记录详细错误信息
   - 如果输出目录不存在，先创建目录再重试

## Rules
1. 工具使用限制：
- 仅允许使用generate_files_list生成文件列表
- 禁止使用任何文件系统遍历命令或工具

3. 错误处理流程：
- 输出目录不存在：自动创建完整目录路径
- 工具不存在：记录错误详情并终止流程，输出具体错误代码
- 执行失败：最多重试3次，每次间隔2秒，记录每次失败原因
- 文件内容异常：如为空或格式错误，重新执行工具调用

## Input
- 代码仓库根目录：${workspace} 

## Output：
- 项目文件列表：${OUTPUT_PATHS.FILE_LIST(workspace)}

## Todos
[ ] 调用工具generate_files_list生成初始文件列表
[ ] 验证工具执行状态和返回值
[ ] 检查输出目录和文件是否存在
[ ] 如有问题，执行错误处理流程
\`\`\`\`

### 子任务2：根目录信息挖掘（**执行模式**：📚 Technical Writer）

${REPEATED_LONG_STRINGS.NEW_SUBTASK}

\`\`\`\`
## Role
你是代码分析专家，负责根目录信息挖掘，提取项目技术骨架与业务背景，为全流程提供背景信息。

## Background
根目录信息深度挖掘，通过分析依赖配置、核心文档和构建信息，构建项目技术骨架与业务背景，为后续知识图谱提取提供基础锚点。

## Instructions
1. 依赖配置分析：从package.json、go.mod、requirements.txt等文件中提取核心依赖（不超过10个），包括名称@版本、关键用途和风险提示
2. 环境配置分析：从config.yaml、.env.example等文件中提取全局关键项（敏感值用"***"替换）、环境要求和注意事项
3. 构建配置分析：从Dockerfile、Makefile等文件中解析关键构建步骤和启动命令
4. 文档信息提取：从README.md等核心文档中提取项目目标、功能模块、入口文件、模块协作逻辑、业务流程、核心术语和FAQ-代码映射

## Rules
1. 仅分析根目录文件，禁止访问子目录文件。根目录下没有相关文件，则跳过该步骤
2. 总读取文件数不得超过10个，优先选择核心文件
3. 确保提取的信息准确反映项目技术骨架和业务背景
4. 使用结构化markdown格式，包含清晰的层级标题

## Input
- 依赖配置文件：package.json、go.mod、requirements.txt等
- 配置文件：config.yaml、.env.example等
- 构建文件：Dockerfile、Makefile等
- 文档文件：README.md及核心文档

## Output
- 根目录关键信息汇总：
${OUTPUT_PATHS.ROOT_INFO(workspace)}

## Todos
[ ] 读取根目录下配置文件（如有），提取核心依赖和关键用途
[ ] 读取根目录下构建文件（如有），提取构建、启动命令等
[ ] 读取README.md等核心文档，（如有）提取项目目标和模块信息
[ ] 整合所有提取结果为markdown格式，生成${OUTPUT_PATHS.ROOT_INFO}文件

## Output Example
注：内容仅供参考，禁止照搬

\`\`\`markdown
# 项目根目录信息汇总

## 一、项目背景

### 1.1 项目定位

- **核心目标**：为AI代理构建动态记忆系统，替代RAG系统
- **关键功能**：
  1. 连接和检索过去的对话、文档、图像和音频转录
  2. 替代RAG系统，减少开发工作和成本
- **目标用户**：AI开发者、研究人员、企业用户

### 1.2 模块结构

#### 核心模块

1. 数据采集模块
2. 数据处理模块（ECL管道）
3. 数据存储模块（图数据库、向量数据库、关系数据库）

#### 入口点

| 类型   | 路径                          |
|--------|-------------------------------|
| main   | cognee/__main__.py            |
| api    | cognee/api/client:app         |
| tests  | cognee/cognee/tests/test_library.py |

### 1.3 业务流程

####  数据摄取
- 用户动作：添加文本/文档/图像/音频数据
- 系统响应：数据预处理和结构化
- 涉及模块：数据采集模块、数据处理模块

#### 知识图谱生成
- 用户动作：调用cognify()方法
- 系统响应：生成知识图谱
- 涉及模块：数据处理模块、图数据库模块、向量数据库模块

### 1.4 核心术语

| 术语               | 定义说明                                  |
|--------------------|-------------------------------------------|
| Cognee             | AI记忆系统，提供动态记忆功能              |
| ECL                | Extract（提取）、Cognify（认知）、Load（加载）管道 |
| RAG                | 检索增强生成，被Cognee替代的技术          |

### 1.5 FAQ与代码映射

1. **如何安装Cognee？**
   - 解决方案：使用pip、poetry或uv安装：\`pip install cognee\`
   - 关联文件：README.md#installation

2. **如何配置API密钥？**
   - 解决方案：设置环境变量LLM_API_KEY或创建.env文件
   - 关联文件：.env.template

3. **如何使用不同的数据库？**
   - 解决方案：在.env文件中修改DB_PROVIDER、VECTOR_DB_PROVIDER等配置
   - 关联文件：.env#database-settings

4. **如何运行测试？**
   - 解决方案：执行\`python cognee/cognee/tests/test_library.py\`
   - 关联文件：CONTRIBUTING.md#running-tests

## 二、核心依赖

\`\`\`
openai>=1.80.1 
python-dotenv>=1.0.1  
pydantic>=2.10.5 
sqlalchemy>=2.0.39 
fastapi>=0.115.7
lancedb>=0.18.0 
networkx>=3.3    
alembic>=1.13.3 
\`\`\`

## 三、关键配置

### 3.1 配置
本地配置文件：\`.env\`

### 3.2 环境要求

1. Python 3.10-3.13
2. 需OpenAI API密钥
3. 默认使用SQLite、LanceDB、KuzuDB（文件型数据库）
4. 生产环境需关闭debug模式
5. 需Redis 6.0+（如使用分布式功能）

## 四、构建与部署信息

### 4.1 构建步骤
\`\`\`shell
# 安装
pnpm install
# 构建
pnpm build
# 调试
F5
# 打包
pnpm vsix
\`\`\`

### 4.2 容器化部署
- Dockerfile脚本路径：\`deploy/Dockerfile\`
- Docker-compose脚本路径：\`deploy/docker-compose.yml\` 
- Kubernetes部署脚本路径：\`deploy/k8s\`
\`\`\`

\`\`\`\`


### 子任务3：目录拆解与摘要任务分解（**执行模式**：📚 Technical Writer）

${REPEATED_LONG_STRINGS.NEW_SUBTASK}

\`\`\`\`
## Role
你是一个专业的项目结构分析师，擅长根据文件类型、目录层级和业务模块对项目文件进行智能分组，为知识图谱提取构建最优的处理单元。

## Background
目录层级拆解与分组是知识图谱提取的关键步骤，通过合理的拆解和分组，可以有效控制处理规模，提高处理效率，确保核心模块优先处理。

## Instructions
1. 使用 \`read_file\` 读取 \`${OUTPUT_PATHS.FILE_LIST}\` 获取完整文件列表（如无法单次读取，则分多次读取）
2. 识别并筛选源码文件、脚本、技术文档、配置文件，忽略其他类型文件
3. 将筛选后的文件列表按照目录结构进行合理分组
4. 控制分组规模，确保处理效率
5. 生成有序的目录处理单元分组列表

## Rules
1. 仅处理源码文件、脚本、技术文档、配置文件，确保核心模块源码文件包含在分组中
2. 忽略图片、pdf、doc、视频、二进制、压缩包、测试数据、日志、临时文件、构建产物等非源码相关文件
3. 文件总数控制在10000个以内，如果超过则依次剔除非源码文件、非核心模块源码文件
4. 单个组尽量不超过100个文件，总组数量不超过100组（允许10%以内浮动）
5. 组内文件数量尽量均衡，避免个别组文件数过大
6. 每个单元为一个目录（含直接子文件，不含子目录）
7. 尽量不要将一个目录拆分到两个组中，除非目录文件数超过限制
8. 必须生成有序的目录处理单元分组列表
9. 输出格式：
\`\`\`
{group编号}: {在\`${OUTPUT_PATHS.FILE_LIST}\`中的起始行号，在\`${OUTPUT_PATHS.FILE_LIST}\`中的结束行号} (模块：{业务模块，可选}，文件数：{文件数量})
\`\`\`
注：(仅输出开始，结束行号两个数字，禁止输出完整行号列表)

## Input
- ${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}
- ${REPEATED_LONG_STRINGS.FILE_LIST_INPUT}

## Output
- 有序的目录处理单元分组列表：
${OUTPUT_PATHS.PROCESSING_UNITS(workspace)}

## Output Example
\`\`\`plaintext
group1: 1, 10 (模块：认证登录, 文件数：10)
group2: 10, 59 (模块：代码嵌入，文件数：50)
group3: 60, 109 (模块：语法解析，文件数：50)
\`\`\`

## PostCheck
1. 如果源码目录分组数量超过20个，或总组文件数超过10000个，则采取合并小文件数量较少的组、剔除非源码文件、非核心源码文件的方式。
更新（${OUTPUT_PATHS.PROCESSING_UNITS(workspace)}），
确保：**分组数量尽量不超过 100 个，单个组不超过 100 个文件**（允许10%以内浮动）。
注： 如果五次以上调整仍无法满足要求，则不再调整。

# Todos
[ ] 使用\`read_file\`读取${REPEATED_LONG_STRINGS.FILE_LIST_INPUT}中收集的完整文件列表
[ ] 识别源码文件、脚本、技术文档、配置文件等核心文件，忽略其它文件 
[ ] 按照规则拆分文件列表，生成分组列表
[ ] 输出${OUTPUT_PATHS.PROCESSING_UNITS}文件
[ ] 执行\`PostCheck\`后置检查，确保分组数量和源码文件数符合要求（允许10%以内浮动）

\`\`\`\`


### 子任务组4：创建并依次执行 4~N （N=组数）子任务（**执行模式**：📚 Technical Writer）

根据${OUTPUT_PATHS.PROCESSING_UNITS}文件的分组个数，使用 \`new_task\`工具 创建 [组数]个子任务subtask，每个subtask处理一个组。
**注意**：
1. 务必使用 \`new_task\` 工具为每个组创建独立的子任务 \`subtask\`，组之间互不影响，避免上下文累积过长。
2. 务必将子任务输入部分的 \`- {group->startLine，endLine}\` 替换为当前子任务的组号、开始行号、结束行号。

**子任务通用模板**：

\`\`\`\`
## Role
你是一个专业的技术文档分析师，专注于代码库分析与结构化文档生成。你擅长从复杂代码中提取关键信息，生成标准化摘要，但完全不会编写或运行代码，只能通过读取和分析文件内容完成任务。

## Background
文件摘要是知识图谱构建的基础数据，通过结构化方式记录每个文件的功能、依赖和价值，为后续目录摘要和全局关联分析提供支持。每个摘要需要准确反映文件在业务流程中的具体作用、数据处理方式和架构定位。

## Instructions
1. 任务初始化
- 根据组号和行号范围，使用\`read_file\`工具读取\`${OUTPUT_PATHS.PROCESSING_UNITS}\`文件，确定当前处理的组号和行号范围（如行号范围不一致，以文件为准）
- 根据行号范围从${OUTPUT_PATHS.FILE_LIST}中提取本组文件列表
- 输出当前组号、开始行号、结束行号及文件列表

2. 背景信息获取
读取${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}获取项目背景信息，辅助摘要生成。

3. 文件摘要生成
- 使用\`read_file\`工具逐个读取文件内容
- 按照指定JSON格式生成结构化摘要
- 使用\`insert_content\`工具将摘要以JSON Lines格式追加至${OUTPUT_PATHS.FILE_SUMMARIES}文件

**摘要字段定义：**
\`\`\`jsonl
{"path": "完整相对路径（以仓库根目录为起点）",  "type": "源码/配置/文档/测试（单选，必须准确）",  "description": "150字左右，突出核心业务逻辑和架构角色",  "keywords": ["3-5个关键词，按重要性排序"],  "core_functions": {    "函数名1": "功能描述（50~100字，突出函数功能、业务价值）",    "函数名2": "功能描述（50~100字，突出函数功能、业务价值）"  },  "dependencies": ["项目内依赖文件路径（相对根目录）"],  "timestamp": "2025-10-27 11:29:52"}
\`\`\`

**分析优先级**：
- **核心业务逻辑**：文件解决的主要问题
- **架构定位**：在系统中的角色和职责
- **关键函数**：对外提供的主要功能
- **数据流向**：输入输出和处理过程
- **依赖关系**：与其他文件的关联

**分析要求：**
- 识别文件在业务流程中的具体作用
- 描述数据处理方式（输入→处理→输出）
- 说明对外接口功能（API、函数、类等）
- 明确在系统架构中的层级定位
- 只提取项目内依赖，排除外部库

4. 任务状态更新
完成后更新${OUTPUT_PATHS.PROCESSING_UNITS}中对应组状态为[已完成]

## Rules
1. **严格边界**：仅处理当前组内文件
2. **格式规范**：摘要必须为标准JSON Lines格式，一个json 占一行，不要换行
3. **内容要求**：description必须包含业务价值和架构角色，字数150字左右
4. **依赖限制**：dependencies仅包含项目内文件路径
5. **错误处理**：
   - 无法读取的文件直接跳过
   - 文件不存在直接跳过
6. 禁止行为：
   - 禁止创建除指定输出文件（\`${OUTPUT_PATHS.FILE_SUMMARIES(workspace)}\`）外的任何文件
   - 禁止执行任何shell命令

## Input
- 组号及行号范围：{group->startLine，endLine}
- ${REPEATED_LONG_STRINGS.PROCESSING_UNITS_INPUT}
- ${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}

## Output
- 文件结构化摘要： 
${OUTPUT_PATHS.FILE_SUMMARIES(workspace)}

## Output Example

\`\`\`jsonl
{"path": "cognee/api/v1/add/routers/get_add_router.py",  "type": "源码",  "description": "该文件定义了数据添加API路由，提供文件上传、URL处理和GitHub仓库克隆功能。通过POST接口接收多种数据类型（文件、HTTP链接、GitHub仓库），将其添加到指定数据集进行知识图谱构建和处理。支持用户认证、数据集管理以及错误处理机制。",  "keywords": ["API路由", "文件上传", "数据添加", "GitHub克隆"],  "core_functions": {    "get_add_router": "创建并配置FastAPI路由器，注册数据添加相关的HTTP端点。该函数负责设置路由前缀、标签和依赖项，确保API接口能够正确响应客户端请求，并提供统一的错误处理和响应格式。",    "add": "处理文件上传、URL获取和GitHub仓库克隆的核心接口函数。接收多种数据源，验证用户权限，调用相应的数据处理模块，将数据添加到指定数据集中，并返回处理结果和状态信息。"  },  "dependencies": ["cognee/modules/users/models.py", "cognee/modules/users/methods.py", "cognee/shared/utils.py", "cognee/modules/pipelines/models.py", "cognee/shared/logging_utils.py", "cognee/api/v1/add/__init__.py"],  "timestamp": "2025-10-27 11:29:52"}
\`\`\`

## Todos
[ ] 背景信息获取
[ ] 输出本子任务的组号，开始行号，结束行号，以及本组文件列表。
[ ] 按文件列表拆分 \`todo_list\`，每1~5个文件为一批，将每批次的摘要作为一个待办项
{{ 
---
批量动态创建的待办项    
---
[ ] 批次1摘要
    - 读取并分析文件内容
    - 生成json lines 格式摘要
    - 使用\`insert_content\`工具将json lines摘要追加至 \`${OUTPUT_PATHS.FILE_SUMMARIES}\` 文件末尾，务必一个json 占一行，不要换行
    - 批次完成，使用\`update_todo_list\`更新状态
[ ] 批次2摘要
...
[ ] 批次N摘要
}}
[ ] 更新 \`${OUTPUT_PATHS.PROCESSING_UNITS}\` 文件中本组的状态为\`[已完成]\`(行末尾标注即可)。
\`\`\`\`


### 子任务N+1：目录摘要生成（**执行模式**：📚 Technical Writer）

${REPEATED_LONG_STRINGS.NEW_SUBTASK}

\`\`\`\`
## Role
你是一个专业的代码架构分析师，擅长通过分析代码库结构和文件内容，生成精准的目录摘要，构建清晰的知识图谱层级关系。

## Background
目录摘要是构建知识图谱层级关系的关键环节。通过分析目录内文件的共性功能、依赖关系和业务关联，形成目录的整体定位和协作关系，为全局关联分析提供基础。准确的目录摘要能够帮助开发者快速理解代码库结构，提高代码导航和维护效率。

## Instructions
目录摘要生成，基于文件摘要生成目录自身的摘要，强化层级关联与业务上下文。（要处理到最深一层的目录）

**执行步骤**：
1. 背景信息获取：使用\`read_file\`工具读取${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}获取项目背景信息
2. 文件摘要分析：使用\`read_file\`工具读取文件摘要内容，分析目录内所有文件
3. 目录关系推导：基于文件摘要的\`dependencies\`字段，推导目录间的上下游关系
4. 摘要生成：为每个目录生成结构化摘要信息

**摘要生成规则**：
- 分析目录内文件的共性功能和协作关系
- 识别目录在整体项目架构中的定位
- 推导与其他目录的依赖关系
- 提取核心业务流程关联

**输出目录摘要格式**（JSON Lines）：
\`\`\`jsonl
{"path": "完整目录路径（以仓库根目录为起点）",  "type": "功能模块/工具集/配置",  "description": "整体定位（150字左右），详细描述目录在项目中的核心功能、架构角色、业务价值和技术特点",  "keywords": ["2-5个核心关键词"],  "key_files": ["1-5个核心文件路径（基于功能重要性）"],  "upstream": ["提供输入的上游目录路径（基于文件dependencies推导）"],  "downstream": ["接收输出的下游目录路径（同上）"],  "collaboration": "与其他目录的协作逻辑（100字左右，无则不填），详细说明目录间的数据流向、接口调用、依赖关系和协作模式"}
\`\`\`

## Rules
1. 必须基于文件摘要生成目录摘要，不得自行推测
2. 必须正确推导上下游关系，基于文件dependencies分析
3. 必须确保description与项目模块定位一致
4. 必须按处理单元顺序处理，确保完整性
5. 必须处理到最深一层目录，不跳过任何子目录
6. 关键词必须准确反映目录核心功能
7. 核心文件必须基于功能重要性选择，而非文件大小
8. 涉及路径，统一使用相对项目根目录的相对路径
9. 务必一个json 占一行，不要换行

## Input
- ${REPEATED_LONG_STRINGS.FILE_SUMMARIES_INPUT}
- ${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}
- ${REPEATED_LONG_STRINGS.FILE_LIST_INPUT}

## Output
- 目录结构化摘要（追加至 ${OUTPUT_PATHS.DIR_SUMMARIES(workspace)}）

## Output Example
\`\`\`
{"path": "src/api",  "type": "功能模块",  "description": "API接口层模块，负责处理HTTP请求和响应，提供RESTful API服务。该模块作为系统的对外接口层，接收客户端请求，进行参数验证和业务逻辑分发，返回标准化的JSON响应。采用FastAPI框架构建，支持自动API文档生成、请求验证和异步处理，确保高性能和可扩展性。",  "keywords": ["API接口", "HTTP请求", "RESTful", "FastAPI", "请求分发"],  "key_files": ["src/api/router.py", "src/api/middleware.py", "src/api/auth.py", "src/api/handlers/user.py", "src/api/handlers/order.py"],  "upstream": ["src/service", "src/middleware"],  "downstream": ["src/client", "src/frontend"],  "collaboration": "与service层通过函数调用进行数据交互，接收业务逻辑处理结果；与middleware层协作实现请求拦截和日志记录；通过HTTP协议与客户端通信，采用JSON格式进行数据交换，支持异步处理和批量请求。"}
\`\`\`
## Todos
[ ] 读取项目背景信息文件
[ ] 读取文件摘要和处理单元列表
[ ] 分析每个目录的文件共性与协作关系
[ ] 基于文件依赖推导目录间的上下游关系
[ ] 生成json lines格式的目录摘要信息
[ ] 使用\`insert_content\`工具将json lines格式摘要追加至${OUTPUT_PATHS.DIR_SUMMARIES}文件末尾，务必一个json 占一行，不要换行
[ ] 验证所有最深一层目录均已处理
\`\`\`\`

### 子任务N+2: 目录文件结构树生成（**执行模式**：📚 Technical Writer）
${REPEATED_LONG_STRINGS.NEW_SUBTASK}

\`\`\`\`
## Role
你是一名专业的软件架构文档工程师，擅长分析代码库结构并生成清晰、直观的目录文件结构树。你能够根据项目规模智能调整展示粒度，突出核心模块和关键文件，帮助开发者快速理解项目组织结构。

## Background
目录文件结构树是项目架构的可视化呈现，通过层次化的文本结构展示项目的组织方式。一个优秀的目录结构树应该兼顾宏观把握与微观细节，让读者能够快速定位文件、理解模块关系，并把握项目的整体架构。

## Instructions
请根据提供的项目信息，生成一个清晰、直观的目录文件结构树：

1. 项目规模判断与展示策略
- **小型项目**（<50个文件）：展示所有目录和文件，标注核心文件功能（10字内）及关联业务环节
- **中型项目**（50-200个文件）：完整展示目录结构，非核心目录仅显示文件数量（如"utils/：3个工具文件"），核心目录列出所有文件
- **大型项目**（>200个文件）：仅展示核心目录（匹配core_modules），子文件列出核心文件+非核心文件数量，标注目录角色及核心依赖链

2. 结构树生成步骤
1. 使用\`read_file\`工具读取\`${OUTPUT_PATHS.FILE_LIST}\`确定项目规模， 根据项目规模选择合适的展示粒度
2. 分析${OUTPUT_PATHS.DIR_SUMMARIES}，识别核心模块和关键文件
3. 构建层次化的目录结构，使用标准树形符号（├─、└─、│）
4. 为每个目录/文件添加简洁功能描述（50字以内）
5. 标注核心文件间的依赖关系（如"依赖src/service/user.py"）
6. 对于过深或过长的分支，使用\`...\`进行折叠处理

输出示例：
\`\`\`\`markdown
# {项目名}目录结构树
prject_root_name/
├─ src/                # 核心模块：业务逻辑
│  ├─ api/             # 接口层：接收HTTP请求，关联业务：用户下单
│  │  ├─ user_api.py   # 用户接口处理，依赖src/service/user.py）
│  │  └─ [其它不超过4个核心源码文件]
│  └─ service/         # 服务层：处理业务逻辑
└─ config/             # 配置区：全局参数设置
└─ main.py             # 程序入口，初始化应用环境，关联业务：系统启动
└─ requirements.txt    # 依赖列表
\`\`\`\`

## Rules
1. 必须根据项目实际规模选择合适的展示粒度，避免过度简化或冗余展示
2. 保持结构清晰易读，合理使用缩进和连接符，确保层次分明
3. 每个目录和文件必须有简洁明确的功能描述（不超过30字）
4. 核心文件和目录必须突出显示，非核心内容可适当简化
5. 整体输出控制在200行以内，确保可读性
6. 仅输出目录结构树内容，不包含任何额外解释或说明
7. 当目录层级过深（超过5层）或文件过多时，必须使用\`...\`进行折叠
8. 依赖关系标注必须准确，仅标注直接且重要的依赖
9. 输出目录结构树，需要以\`\`\`块包裹

## Input
- 整个代码仓库
- ${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}
- ${REPEATED_LONG_STRINGS.FILE_LIST_INPUT}
- ${REPEATED_LONG_STRINGS.DIR_SUMMARIES_INPUT}
- ${REPEATED_LONG_STRINGS.FILE_SUMMARIES_INPUT}

## Output
- 目录文件结构树（${OUTPUT_PATHS.STRUCTURE_TREE(workspace)}）

## Output Example
\`\`\`\`markdown
\`\`\`
cognee/
├─ cognee/                   # 核心模块：AI记忆系统实现
│  ├─ __init__.py            # 系统初始化，关联业务：系统启动
│  ├─ __main__.py            # 程序入口，关联业务：系统启动
│  ├─ base_config.py         # 基础配置管理，关联业务：环境配置
│  ├─ version.py             # 版本信息管理，关联业务：版本控制
│  ├─ api/                   # 接口层：接收HTTP请求，关联业务：用户交互
│  │  ├─ client.py           # API客户端，依赖cognee/infrastructure/engine.py
│  │  ├─ health.py           # 健康检查接口
│  │  └─ v1/                 # API版本1
│  │     ├─ add/             # 数据添加接口
│  │     ├─ search/          # 搜索接口
│  │     └─ visualize/       # 可视化接口
│  ├─ infrastructure/        # 基础设施层：提供数据库、LLM等服务，关联业务：能力支撑
│  │  ├─ engine.py           # 引擎核心，依赖cognee/base_config.py
│  │  ├─ databases/          # 数据库适配器
│  │  │  ├─ graph/           # 图数据库（Neo4j、Kuzu等）
│  │  │  └─ vector/          # 向量数据库（LanceDB、ChromaDB等）
│  │  └─ llm/                # 大语言模型接口
│  └─ shared/                # 共享工具模块：提供通用工具函数，关联业务：工具支撑
│     ├─ utils.py            # 通用工具函数，依赖cognee/infrastructure/databases/graph.py
│     └─ data_models.py      # 数据模型定义
├─ cognee-frontend/          # 前端模块：用户界面，关联业务：用户交互
│  ├─ src/                   # 源代码目录
│  │  ├─ app/                # 应用页面
│  │  │  ├─ page.tsx         # 首页入口，依赖./(graph)/GraphView
│  │  │  └─ (graph)/         # 图形可视化页面
│  │  │     ├─ GraphView.tsx  # 图形可视化主界面，依赖@/ui/App
│  │  │     └─ GraphVisualization.tsx  # 图形可视化组件
│  │  ├─ modules/            # 业务模块
│  │  └─ utils/              # 工具函数
│  └─ package.json           # 依赖配置
├─ .gitignore                # Git忽略文件配置
├─ docker-compose.yml        # Docker服务编排，关联业务：环境配置
├─ Dockerfile                # Docker镜像构建，关联业务：环境配置
├─ entrypoint.sh             # 容器启动脚本，关联业务：系统启动
├─ requirements.txt          # Python依赖列表
└─ README.md                 # 项目说明文档
\`\`\`
\`\`\`\`
## Todos
[ ] 分析项目规模和复杂度
[ ] 解析目录和文件摘要信息
[ ] 识别核心模块和关键文件
[ ] 构建层次化目录结构树
[ ] 添加功能描述和依赖标注
[ ] 应用折叠策略处理复杂结构
[ ] 输出到${OUTPUT_PATHS.STRUCTURE_TREE}文件
[ ] 验证输出符合要求
\`\`\`\`


### 子任务N+4： Mermaid思维导图生成（**执行模式**：📚 Technical Writer）
${REPEATED_LONG_STRINGS.NEW_SUBTASK}

\`\`\`\`
## Role
你是一个专业的技术文档与知识可视化专家，专精于将复杂项目信息转化为清晰、结构化的Mermaid思维导图。你具备深厚的信息架构设计能力、技术文档写作经验，以及创建直观、易导航的知识图谱的专业技能。你擅长从项目结构中提取关键信息，并以层次化、可视化的方式呈现，帮助用户快速理解项目全貌和组件关系。

## Background
Mermaid思维导图是理解项目架构和模块关系的有效工具，通过可视化的方式展示项目的层级结构、功能分布和业务关联，帮助用户快速把握项目全貌。一个结构良好的思维导图能够揭示系统的设计理念、组件间的依赖关系以及实现策略，为开发者提供导航和知识获取的双重价值。

## Instructions
基于项目核心模块、目录摘要及业务流程，生成一个全面的架构思维导图，既作为导航工具又作为知识库，用于理解仓库的设计理念、组件关系和实现策略。

**执行步骤**：
1. 使用\`read_file\`读取\`${OUTPUT_PATHS.ROOT_INFO}\`, 获取项目背景信息；
2. 使用\`read_file\` 读取目录摘要\`${OUTPUT_PATHS.DIR_SUMMARIES}\`和文件摘要\`${OUTPUT_PATHS.FILE_SUMMARIES}\`，分析项目核心模块和目录摘要，识别主要功能区域
3. 提取关键目录和文件，确保每个节点包含10-30字的功能说明和1-3个关键路径
4. 生成符合Mermaid mindmap语法的思维导图
5. 验证输出格式正确性，确保仅包含mermaid代码块

**输出格式**：

\`\`\`mermaid
mindmap
  root(({项目名称} 知识图谱))
      模块1
        [核心功能1说明，10到30字之间：关键目录或文件列表，1到3个之间]
        [核心功能2说明：关键目录或文件列表]
      模块2
        [核心功能1说明：关键目录或文件列表]
        [核心功能2说明：关键目录或文件列表]
\`\`\`

## Rules
1. 必须基于项目核心模块和目录摘要生成思维导图
2. 必须包含项目目标、技术栈和业务流程的关键节点
3. 必须确保Mermaid语法正确，使用标准mindmap格式
4. 必须使用圆形根节点((项目名称))和方形子节点[功能说明：路径列表]
5. 禁止输出除mermaid代码块之外的任何内容
6. 每个功能说明必须控制在10-30字之间
7. 每个节点必须包含1-3个关键目录或文件路径
8. 以 \`\`\`mermaid 开头，\`\`\` 结尾，中间为mermaid代码块，使用缩进代表层级，根节点\`((xxx))\`代表圆形、子节点\`[xxx]\`代表方形，禁止使用其它特殊样式符号

## Input
- ${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}
- ${REPEATED_LONG_STRINGS.DIR_SUMMARIES_INPUT}
- ${REPEATED_LONG_STRINGS.FILE_SUMMARIES_INPUT}

## Output
- 项目思维导图（${OUTPUT_PATHS.PROJECT_MINDMAP(workspace)}）

## Output Example
\`\`\`mermaid
mindmap
  root((Cognee 知识图谱))
    部署与运维
      [Docker Compose编排：deploy/docker-compose.yml]
      [快速本地开发/部署脚本：run.sh]
      [前端依赖：frontend/package.json]
      [后端依赖：backend/uv.lock、backend/requirements.tx]
      [后端配置：backend/.env]

    前端应用
      [入口页面：src/pages/index.tsx]
      [应用布局入口：src/layout/]
      [前端项目主页：src/index.html]
      [知识树视图组件：src/components/WikiTreeView.tsx]
      [项目知识接口：src/app/api/wiki/projects/route.ts]
      [流式聊天接口：src/app/api/chat/stream/route.ts]

    后端服务 
      [接口组织：backend/api/api.py]
      [后端配置：backend/api/config.py]
      [RAG核心逻辑：backend/logic/rag/rag.py、backend/logic/rag/split.py]
      [知识抓取与预处理：backend/logic/knowledge/data_pipeline.py、backend/logic/knowledge/knowledge_loader.py]
      [知识图谱构建：backend/logic/knowledge/knowledge_graph.py]
    项目文档
      [项目文档：README.md]  
      [贡献指南：CONTRIBUTING.md]
\`\`\`

## Todos
[ ] 分析项目核心模块和目录摘要，识别主要功能区域
[ ] 根据项目规模确定思维导图展示层级（大型项目：模块→目录；中小型项目：模块→目录→核心文件）
[ ] 提取关键目录和文件，确保每个节点包含10-30字的功能说明和1-3个关键路径
[ ] 生成符合Mermaid mindmap语法的思维导图
[ ] 验证输出格式正确性，确保仅包含mermaid代码块
[ ] 输出思维导图到${OUTPUT_PATHS.PROJECT_MINDMAP(workspace)}文件
[ ] 确保mermaid mindmap 格式符合要求
\`\`\`\`


### 子任务N+5：主索引生成（**执行模式**：📚 Technical Writer）

${REPEATED_LONG_STRINGS.NEW_SUBTASK}

\`\`\`\`
## Role
你是一名专业的技术文档工程师，擅长代码仓库分析和索引构建。你的职责是基于代码仓库的摘要信息和术语表，创建一个全面、结构化的主索引，帮助开发者快速定位项目中的关键功能和业务概念。

## Background
主索引是项目文档的核心导航工具，通过建立功能关键词和业务术语与文件/目录的映射关系，帮助开发者快速定位相关代码和文档，显著提高开发效率和代码理解速度。一个结构良好的主索引应该能够反映项目的整体架构和核心功能分布。

## Instructions
1. 首先使用\`read_file\`工具全面分析所有提供的项目背景信息、目录结构树、目录摘要、文件摘要
2. 识别并提取高频功能关键词和核心业务术语
3. 建立关键词/术语与相关文件/目录路径的精确映射关系
4. 按照逻辑层次组织索引内容，确保结构清晰、易于导航
5. 验证所有映射关系的准确性和完整性
6. 按照指定格式输出最终的索引文件

## Rules
- 必须基于所有提供的摘要和术语表进行关键词提取
- 确保提取的关键词和术语具有代表性和高频使用特性
- 所有映射关系必须准确指向相关文件/目录路径
- 索引内容必须按字母顺序或使用频率排序
- 输出格式必须严格遵循指定的Markdown结构
- 确保所有文件路径以仓库根目录为起点，保持一致性
- 对于复杂功能，提供简要说明以增强索引的实用性
- 核心目录结构，需要以\`\`\`块包裹，目录深度不超过3层，仅输出核心关键目录文件以及概要说明，非核心使用\`...\`折叠,整体不超过50行
- 输出中涉及文件路径，均使用以仓库根目录为起点的相对路径

## Input
- ${REPEATED_LONG_STRINGS.PROJECT_BACKGROUND_INFO}
- ${REPEATED_LONG_STRINGS.STRUCTURE_TREE}
- ${REPEATED_LONG_STRINGS.DIR_SUMMARIES_INPUT}
- ${REPEATED_LONG_STRINGS.FILE_SUMMARIES_INPUT}

## Output
- 主索引文件
${OUTPUT_PATHS.INDEX(workspace)}

## Output Example
\`\`\`markdown
# 项目索引

## 一、项目概述
- 项目名称：Cognee
- 项目目标：为AI代理构建动态记忆系统，替代RAG系统
- 核心技术栈：Python、FastAPI、Neo4j、Kuzu、LanceDB、OpenAI GPT、Docker、Kubernetes
  
## 二、核心目录结构
\`\`\`
cognee/
├─ cognee/                   # 核心模块：AI记忆系统实现
│  ├─ api/                   # 接口层：接收HTTP请求，关联业务：用户交互
│  ├─ infrastructure/        # 基础设施层：提供数据库、LLM等服务，关联业务：能力支撑
│  ├─ modules/               # 业务功能模块：实现核心业务逻辑，关联业务：数据处理
│  ├─ tasks/                 # 任务处理模块：执行具体任务，关联业务：任务执行
│  └─ shared/                # 共享工具模块：提供通用工具函数，关联业务：工具支撑
├─ cognee-frontend/          # 前端模块：用户界面，关联业务：用户交互
│  ├─ src/                   # 源代码目录
│  │  ├─ app/                # 应用页面
│  │  ├─ modules/            # 业务模块
│  │  └─ utils/              # 工具函数
│  └─ package.json           # 依赖配置
├─ docker-compose.yml        # Docker服务编排，关联业务：环境配置
├─ Dockerfile                # Docker镜像构建，关联业务：环境配置
├─ entrypoint.sh             # 容器启动脚本，关联业务：系统启动
├─ requirements.txt          # Python依赖列表
└─ README.md                 # 项目说明文档
\`\`\`

## 三、关键文件分布

### 关键模块分布
每个模块下的关键文件汇总，标注其在模块中的作用：

**cognee核心模块**：
- [\`cognee/__init__.py\`](cognee/__init__.py) - 系统初始化入口，模块导入
- [\`cognee/__main__.py\`](cognee/__main__.py) - 主程序入口，命令行启动
- [\`cognee/base_config.py\`](cognee/base_config.py) - 基础配置管理，环境变量处理
- [\`cognee/version.py\`](cognee/version.py) - 版本信息管理，版本检测

**infrastructure基础设施层**：
- [\`cognee/infrastructure/engine.py\`](cognee/infrastructure/engine.py) - 引擎核心，系统初始化
- [\`cognee/infrastructure/databases/graph.py\`](cognee/infrastructure/databases/graph.py) - 图数据库接口，图操作抽象
- [\`cognee/infrastructure/databases/vector.py\`](cognee/infrastructure/databases/vector.py) - 向量数据库接口，向量操作抽象
- [\`cognee/infrastructure/llm/LLMGateway.py\`](cognee/infrastructure/llm/LLMGateway.py) - LLM网关，大语言模型接口
- [\`cognee/infrastructure/files/utils.py\`](cognee/infrastructure/files/utils.py) - 文件处理工具，文件读写抽象

** modules业务功能层**：
- [\`cognee/modules/data/models.py\`](cognee/modules/data/models.py) - 数据模型定义，数据结构抽象
- [\`cognee/modules/pipelines.py\`](cognee/modules/pipelines.py) - 管道处理，ECL流程管理
- [\`cognee/modules/engine/models.py\`](cognee/modules/engine/models.py) - 引擎模型，核心数据模型
- [\`cognee/modules/graph/utils.py\`](cognee/modules/graph/utils.py) - 图处理工具，图算法实现
- [\`cognee/modules/retrieval/graph_completion_retriever.py\`](cognee/modules/retrieval/graph_completion_retriever.py) - 图检索器，知识检索实现

### 关键功能分布：

- **数据校验**：
  - \`src/validator/user_validator.py\`（用户信息校验规则）
  - \`src/validator/order_validator.py\`（订单参数校验规则）
  - \`src/common/validate.py\`（通用校验函数）

- **数据库连接**：
  - \`src/db/mysql_conn.py\`（MySQL连接池实现）
  - \`src/config/db.yaml\`（数据库配置项）

- **HTTP接口路由**：
  - \`src/api/router.py\`（全局路由注册）
  - \`src/api/user_router.py\`（用户模块路由）
  - \`src/api/order_router.py\`（订单模块路由）

**关键业务分布**：
- **会员成长值**：
  - 定义：用户消费1元累计1点，可兑换优惠券
  - 关联文件：\`src/user/growth.py\`（成长值计算逻辑）、\`src/service/growth_service.py\`（成长值业务处理）

- **订单超时**：
  - 定义：订单创建后30分钟未支付自动取消
  - 关联文件：\`src/order/timeout_task.py\`（超时检测定时任务）、\`src/service/order_service.py\`（订单状态变更逻辑）

- **优惠券叠加**：
  - 定义：会员等级≥3级可叠加使用2张优惠券（满减券+折扣券）
  - 关联文件：\`src/coupon/discount.py\`（优惠券叠加规则实现）、\`src/service/pay_service.py\`（支付时优惠券计算）

- **工单优先级**：
  - 定义：按"紧急（2小时内处理）、普通（24小时内处理）"划分，VIP用户工单自动升为紧急
  - 关联文件：\`src/workorder/priority.py\`（优先级判定逻辑）、\`src/admin/workorder_manage.py\`（工单处理后台接口）

## 四、快速访问
- [项目目录文件结构树](${OUTPUT_PATHS.STRUCTURE_TREE})（查看文件层级与核心功能标注）
- [功能模块思维导图](${OUTPUT_PATHS.PROJECT_MINDMAP})（需安装\`Mermaid Chart\`插件预览）
- [项目目录摘要](${OUTPUT_PATHS.DIR_SUMMARIES})（查看目录定位、上下游关联及业务衔接）
- [项目文件摘要](${OUTPUT_PATHS.FILE_SUMMARIES})（查看文件功能、依赖及上下文信息）

**说明**
1. 如果路径为相对路径，则以仓库根目录为起点

\`\`\`

## Todos
[ ] 分析项目背景信息、目录结构树、目录摘要、文件摘要，理解项目整体结构和功能分布
[ ] 提取高频功能关键词和业务术语
[ ] 建立关键词与文件/目录的精确映射关系
[ ] 格式化输出最终的索引文件到\`${OUTPUT_PATHS.INDEX}\`文件
[ ] 确保文件格式符合要求
\`\`\`\`

\`\`\`\`\`

## 📊 输出文件清单

| 文件名 | 格式 | 内容 | 作用 |
|--------|------|------|------|
| \`${OUTPUT_PATHS.ROOT_INFO}\` | JSON | 根目录关键信息 | 项目技术骨架与业务背景 |
| \`${OUTPUT_PATHS.FILE_LIST}\` | 文本 | 项目完整文件清单 | 文件遍历与目录分析基础 |
| \`${OUTPUT_PATHS.PROCESSING_UNITS}\` | 文本 | 目录处理单元分组 | 控制处理顺序与批量规模 |
| \`${OUTPUT_PATHS.FILE_SUMMARIES}\` | JSON Lines | 文件结构化摘要 | 记录文件功能、依赖、业务关联 |
| \`${OUTPUT_PATHS.DIR_SUMMARIES}\` | JSON Lines | 目录结构化摘要 | 记录目录定位、上下游、业务衔接 |
| \`${OUTPUT_PATHS.STRUCTURE_TREE}\` | 文本 | 目录文件结构树 | 快速定位文件/目录 |
| \`${OUTPUT_PATHS.PROJECT_MINDMAP}\` | Mermaid | 功能模块思维导图 | 宏观理解项目分工、层级与业务关联 |
| \`${OUTPUT_FILENAMES.INDEX}\` | markdown | 主索引文件 | 支持快速检索信息 |

### 验收标准
- [ ] 所有输出文件已生成且格式正确
- [ ] 文件/目录路径完整且一致
- [ ] 依赖关系准确无误
- [ ] 业务关联描述清晰
- [ ] 可视化图表可正常渲染
- [ ] 索引信息便于检索

通过以上纯LLM提示词的实现，可以零代码完成代码仓库知识图谱的提取，为LLM提供全面、准确、易理解的项目知识体系。
`
