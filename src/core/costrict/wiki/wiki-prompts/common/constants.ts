import * as os from "os"
import * as path from "path"

export const PROJECT_WIKI_VERSION = "v2.1.0"
export const WIKI_OUTPUT_DIR = path.join(".cospec", "wiki") + path.sep
export const GENERAL_RULES_OUTPUT_DIR = path.join(".roo", "rules") + path.sep


export const subtaskDir =
	path.join(getGlobalCommandsDir(), "costrict-project-wiki-tasks", PROJECT_WIKI_VERSION) + path.sep

export const templatesDir = path.join(subtaskDir, "templates") + path.sep

// Safely get home directory
export function getHomeDir(): string {
	const homeDir = os.homedir()
	if (!homeDir) {
		throw new Error("Unable to determine home directory")
	}
	return homeDir
}

// Get global commands directory path
export function getGlobalCommandsDir(): string {
	return path.join(getHomeDir(), ".roo", "commands")
}

export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack || error.message
	}
	return String(error)
}

export const NEW_SUBTASK = `创建如下 \`subtask\`子任务，执行，根据实际情况填充Input、Background信息：`

// v3 Agent文件名常量（合并后）
export const SUBTASK_FILENAMES = {
	PROJECT_ANALYZE_AGENT: "01_project-basic-analyze-agent.md",  // 项目分析+文档目录
	DOCUMENT_GENERATION_AGENT: "02_document-generate-agent.md",
	INDEX_GENERATION_AGENT: "03_index-generation-agent.md",
} as const

// v3 Agent输出文件名常量
export const AGENT_OUTPUT_FILENAMES = {
	PROJECT_ANALYZE_AGENT: "catalogue.json",  // 直接输出文档目录
	DOCUMENT_GENERATION_AGENT: "technical-documentation.md",
	INDEX_GENERATION_AGENT: "index.md",
} as const

// 主文件名
export const MAIN_WIKI_FILENAME = "project-wiki.md"

// v2 系统输入输出文件路径常量
export const WIKI_OUTPUT_FILE_PATHS = {
	// 输出目录
	STAGING_OUTPUT_DIR: ".cospec/wiki/.staging/",
	WIKI_OUTPUT_DIR: ".cospec/wiki/",
	GENERAL_RULES_OUTPUT_DIR: ".roo/rules-code/",
	
	// 各阶段输出文件
	PROJECT_BASIC_ANALYZE_JSON: `.cospec/wiki/.staging/basic_analyze.json`,
	OUTPUT_CATALOGUE_JSON: ".cospec/wiki/.staging/catalogue.json",
	
	// 最终输出文件
	DOCUMENT_INDEX_MD: ".cospec/wiki/index.md",
} as const

// v2 模式选择阈值
export const MODE_THRESHOLDS = {
	SMALL_PROJECT: 50,    // 小型项目文件数阈值
	MEDIUM_PROJECT: 200,  // 中型项目文件数阈值
	LARGE_PROJECT: 201,   // 大型项目文件数阈值
} as const

// ========== 文档体系定义 (v3 动态策略) ==========

export type ProjectType = "WebService" | "Frontend" | "Library" | "CLI" | "Mobile" | "Embedded" | "Unknown";

export interface DocMetadata {
    id: string;
    name: string;
    filename: string;
    template: string;
    description?: string;
}

export interface DocStrategy {
    required: DocMetadata[];
    optional: DocMetadata[];
}

// 所有可用文档定义池
export const ALL_DOCS = {
    OVERVIEW: { id: "01", name: "项目概览", filename: "01_项目概览.md", template: "01_overview-doc" },
    ARCHITECTURE: { id: "02", name: "代码架构", filename: "02_代码架构.md", template: "02_architecture-doc" },
    BUSINESS_FLOW: { id: "03", name: "业务流程", filename: "03_业务流程.md", template: "03_business-flow-doc" },
    API: { id: "04", name: "API接口文档", filename: "04_API接口文档.md", template: "04_api-doc" },
    INTERFACE: { id: "04", name: "接口参考", filename: "04_接口参考.md", template: "04_api-doc" }, // Library 用
    COMMAND: { id: "04", name: "命令参考", filename: "04_命令参考.md", template: "04_api-doc" }, // CLI 用
    DATA_STORAGE: { id: "05", name: "数据存储", filename: "05_数据存储.md", template: "05_data-storage-doc" },
    STATE_MANAGEMENT: { id: "05", name: "状态管理", filename: "05_状态管理.md", template: "05_data-storage-doc" }, // Frontend 用
    CODING_STANDARD: { id: "06", name: "编码规范", filename: "06_编码规范.md", template: "06_coding-standard-doc" },
    TESTING: { id: "07", name: "测试指南", filename: "07_测试指南.md", template: "07_testing-guide-doc" },
    BUILD_DEPLOY: { id: "08", name: "构建部署", filename: "08_构建部署.md", template: "08_build-deploy-doc" },
    BUILD_RELEASE: { id: "08", name: "构建发布", filename: "08_构建发布.md", template: "08_build-deploy-doc" }, // Lib/CLI 用
    // Optional
    SERVICE_COMM: { id: "09", name: "服务通信", filename: "09_服务通信.md", template: "09_service-comm-doc", description: "微服务调用" },
    MIDDLEWARE: { id: "10", name: "中间件集成", filename: "10_中间件集成.md", template: "10_middleware-doc", description: "Redis/MQ等" },
    SECURITY: { id: "11", name: "安全认证", filename: "11_安全认证.md", template: "11_security-auth-doc", description: "认证授权" },
    COMPONENTS: { id: "12", name: "前端组件", filename: "12_前端组件.md", template: "00_default-doc", description: "UI组件" },
    DOMAIN_MODEL: { id: "13", name: "领域模型", filename: "13_领域模型.md", template: "00_default-doc", description: "DDD领域模型" },
};

// 针对不同项目类型的文档策略
export const DOC_STRATEGIES: Record<ProjectType, DocStrategy> = {
    WebService: {
        required: [ALL_DOCS.OVERVIEW, ALL_DOCS.ARCHITECTURE, ALL_DOCS.BUSINESS_FLOW, ALL_DOCS.API, ALL_DOCS.DATA_STORAGE, ALL_DOCS.CODING_STANDARD, ALL_DOCS.TESTING, ALL_DOCS.BUILD_DEPLOY],
        optional: [ALL_DOCS.SERVICE_COMM, ALL_DOCS.MIDDLEWARE, ALL_DOCS.SECURITY, ALL_DOCS.DOMAIN_MODEL]
    },
    Frontend: {
        required: [ALL_DOCS.OVERVIEW, ALL_DOCS.ARCHITECTURE, ALL_DOCS.BUSINESS_FLOW, ALL_DOCS.STATE_MANAGEMENT, ALL_DOCS.CODING_STANDARD, ALL_DOCS.TESTING, ALL_DOCS.BUILD_DEPLOY],
        optional: [ALL_DOCS.COMPONENTS, ALL_DOCS.SECURITY]
    },
    Library: {
        required: [ALL_DOCS.OVERVIEW, ALL_DOCS.ARCHITECTURE, ALL_DOCS.INTERFACE, ALL_DOCS.CODING_STANDARD, ALL_DOCS.TESTING, ALL_DOCS.BUILD_RELEASE],
        optional: []
    },
    CLI: {
        required: [ALL_DOCS.OVERVIEW, ALL_DOCS.ARCHITECTURE, ALL_DOCS.COMMAND, ALL_DOCS.CODING_STANDARD, ALL_DOCS.TESTING, ALL_DOCS.BUILD_RELEASE],
        optional: []
    },
    Mobile: {
        required: [ALL_DOCS.OVERVIEW, ALL_DOCS.ARCHITECTURE, ALL_DOCS.BUSINESS_FLOW, ALL_DOCS.DATA_STORAGE, ALL_DOCS.CODING_STANDARD, ALL_DOCS.TESTING, ALL_DOCS.BUILD_DEPLOY],
        optional: [ALL_DOCS.SECURITY]
    },
    Embedded: {
        required: [ALL_DOCS.OVERVIEW, ALL_DOCS.ARCHITECTURE, ALL_DOCS.INTERFACE, ALL_DOCS.CODING_STANDARD, ALL_DOCS.TESTING, ALL_DOCS.BUILD_RELEASE],
        optional: []
    },
    Unknown: {
        required: [ALL_DOCS.OVERVIEW, ALL_DOCS.ARCHITECTURE, ALL_DOCS.CODING_STANDARD, ALL_DOCS.TESTING, ALL_DOCS.BUILD_DEPLOY],
        optional: []
    }
};

// 兼容旧版引用 (默认指向 WebService)
export const REQUIRED_DOCS = DOC_STRATEGIES.WebService.required;
export const OPTIONAL_DOC_EXAMPLES = DOC_STRATEGIES.WebService.optional;

// 可选文档扩展说明（供提示词使用）
export const OPTIONAL_DOC_EXTENSION_GUIDE = `
**可选文档不限于以上示例**，你应该根据项目实际情况思考：
- 项目有哪些独特的、复杂的模块值得单独成文档？
- 有哪些对AI生成代码有重要参考价值的内容？
- 项目的核心业务领域是否需要专门文档？

示例（根据项目特点可能需要）：
- 支付集成：支付渠道对接、回调处理
- 第三方API：外部服务集成方式
- 定时任务：Job调度、Cron配置
- WebSocket：实时通信协议
- 文件存储：OSS/S3上传下载
- 国际化：多语言配置
- 监控告警：日志、指标、链路追踪
- ...

编号接续必选文档(01-08)之后，按顺序递增，使用默认模板(00_default-doc)即可
`

// 文档模板文件名映射
export const DOC_TEMPLATE_FILES = {
	"01_overview-doc": "01_overview-doc.ts",
	"02_architecture-doc": "02_architecture-doc.ts",
	"03_business-flow-doc": "03_business-flow-doc.ts",
	"04_api-doc": "04_api-doc.ts",
	"05_data-storage-doc": "05_data-storage-doc.ts",
	"06_coding-standard-doc": "06_coding-standard-doc.ts",
	"07_testing-guide-doc": "07_testing-guide-doc.ts",
	"08_build-deploy-doc": "08_build-deploy-doc.ts",
	"09_service-comm-doc": "09_service-comm-doc.ts",
	"10_middleware-doc": "10_middleware-doc.ts",
	"11_security-auth-doc": "11_security-auth-doc.ts",
	"00_default-doc": "00_default-doc.ts",
} as const

// 文档类型枚举
export type DocTemplateType = keyof typeof DOC_TEMPLATE_FILES

export const ADVANCED_TOOL_STRATEGY = `
## 高级工具使用策略 (Advanced Tool Strategy)

### 1. 核心工具优先 (Primary Tools)
- **定义查找 (search_definitions)**：
  - **场景**：获取类、接口、函数、常量的完整定义。
  - **规则**：优先使用此工具获取类型定义和签名，而非读取全文件。
- **引用追踪 (search_references)**：
  - **场景**：分析业务流程、调用链、依赖关系。
  - **规则**：在生成“业务流程”或“架构图”时，必须对核心入口函数使用此工具。
- **大纲扫描 (list_code_definition_names)**：
  - **场景**：快速了解文件结构，避免读取大文件。
  - **规则**：分析陌生文件前，先获取概览。

### 2. 智能降级策略 (Graceful Degradation)
**当 search_definitions / search_references 返回空、报错或不可用时，必须执行以下 Fallback 流程：**
1. **降级 Level 1 (Regex Search)**：使用 \`search_files\` 配合精确的正则（如 \`class User\`, \`function login\`）查找定义位置。
2. **降级 Level 2 (Direct Read)**：如果正则搜索定位到了文件，使用 \`read_file\` 读取该文件（建议使用 line_count 限制读取范围）。
3. **降级 Level 3 (Context Inference)**：如果上述均失败，在文档中明确标注 \`[工具无法获取定义，基于上下文推断]\`，禁止编造。

### 3. 上下文范围控制 (Context Scoping)
- **分层扫描**：禁止对 \`src/\` 进行全量递归扫描。必须先扫描一级目录，再根据文档主题深入特定子目录。
- **按需加载**：只有在确认文件与当前文档主题强相关时，才允许读取其详细内容。
`

export const ANTI_HALLUCINATION_RULES = `
## 反幻觉协议 (Anti-Hallucination Protocol)

### 1. 严格路径验证 (Strict Path Verification - SPV)
- **Pre-Check**：在生成文档正文前，必须先输出一个 JSON 列表，列出所有计划引用的文件路径。
- **Verification**：强制将该列表与 \`list_files\` 的结果进行比对。
- **Action**：如果发现路径不存在，**立即**从计划中移除，严禁在文档中引用。

### 2. 零信任原则
- 严禁使用任何“模板自带”的路径（如 \`src/api/user.ts\`）。
- 所有路径必须来自 \`list_files\` 的真实输出。

### 3. 幽灵依赖清除
- 严禁在 Mermaid 图或调用链中引用不存在的文件节点。
- 如果某层级（如 Repository 层）在项目中不存在，禁止在架构图中画出。

### 4. 置信度标记
- 确凿证据：\`> 💡 来源: [src/path/to/file.ts]\`
- 推断内容：\`> ⚠️ [逻辑推断] 未找到直接定义，根据文件名推测\`
- 缺失内容：\`> ❌ [信息缺失] 工具无法获取该部分实现\`
`

export const DEEP_ANALYSIS_RULES = `
## 深度分析协议 (Deep Analysis Protocol)

### 1. 基于证据的推理 (Evidence-Based Reasoning - EBR)
在撰写任何“业务规则”或“架构决策”前，必须先在思维链中构建 **<EvidenceBlock>**：
- **定位**：找到具体的代码行（如 \`if (balance < amount)\`）。
- **提取**：复制该逻辑片段。
- **结论**：基于该片段总结规则（如“余额不足时禁止支付”）。
**没有 EvidenceBlock，就不允许写结论。**

### 2. 深度优先追踪 (DFS)
- 遇到函数调用时，必须说明“调用了谁”以及“对方做了什么”。
- 禁止使用“调用服务层处理”这种空洞描述，必须精确到“调用 OrderService.create 方法”。

### 3. 隐式逻辑显性化
- 必须提取代码中隐含的业务规则（校验、状态流转、权限控制）。
- 必须描述失败时的处理逻辑（回滚、重试、报错）。

### 4. 领域语言提取
- 提取代码中的业务术语（Ubiquitous Language），如 \`OrderPlaced\` (下单)。
`

export const EVIDENCE_FORMAT = `
## 证据标注标准
所有关键结论必须附带证据，格式如下：
> 💡 来源: [src/path/to/file.ts]

示例：
> 用户注册接口采用 JWT 认证。
> 💡 来源: [src/middleware/auth.ts]
`

export const COMMON_RULES =
`1. 使用\`todo_list\` 规划任务，逐个执行。
2. 严格遵循每个步骤的**输出要求**，不要遗漏任何细节。
3. 使用\`attempt_completion\`工具返回关键信息，供父任务使用。
\${ADVANCED_TOOL_STRATEGY}
\${ANTI_HALLUCINATION_RULES}
`

// 代码关联验证规则（所有模板通用）
export const CODE_REFERENCE_RULES = `
## 代码关联强制规则
- **精准定位**：每个结论必须标注来源：\`> 💡 来源: [src/service/user.ts]\`
- **图表真实**：每张图表必须标注关联代码：\`> 💡 来源: [src/flow/, src/handler/]\`
- **代码溯源**：每段代码示例必须标注原始位置：\`// 摘自: src/utils/auth.ts\`
- **全量索引**：多个相关文件时列出全部，便于AI索引
- **禁止臆造**：禁止描述未读取过的代码文件，禁止编造代码示例

## 输出前自检清单 (Self-Correction Checklist)
1. [ ] **幻觉自查**：文档中提到的所有文件路径（如 \`src/...\`）是否都在 \`list_files\` 结果中？(若否，立即修正)
2. [ ] **符号验证**：引用的函数名、类名、变量名是否与源码完全一致？(禁止拼写错误)
3. [ ] **模板清洗**：是否已彻底删除了模板自带的示例（如 user.ts, order.ts）？
4. [ ] **证据绑定**：每个核心业务逻辑是否都附带了 \`> 💡 来源: [...]\`？
5. [ ] **深度检查**：是否提取了隐式业务规则，而不仅仅是翻译代码？
`