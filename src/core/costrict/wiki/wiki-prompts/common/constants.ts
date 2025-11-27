import * as os from "os"
import * as path from "path"

export const PROJECT_WIKI_VERSION = "v2.1.0"
export const WIKI_OUTPUT_DIR = path.join(".cospec", "wiki") + path.sep
export const GENERAL_RULES_OUTPUT_DIR = path.join(".roo", "rules") + path.sep


export const subtaskDir =
	path.join(getGlobalCommandsDir(), "costrict-project-wiki-tasks", PROJECT_WIKI_VERSION) + path.sep


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

// ========== 文档体系定义 ==========

// 必选文档（8个，必须生成）
export const REQUIRED_DOCS = [
	{ id: "01", name: "项目概览", filename: "01_项目概览.md", template: "01_overview-doc" },
	{ id: "02", name: "代码架构", filename: "02_代码架构.md", template: "02_architecture-doc" },
	{ id: "03", name: "业务流程", filename: "03_业务流程.md", template: "03_business-flow-doc" },
	{ id: "04", name: "API接口文档", filename: "04_API接口文档.md", template: "04_api-doc" },
	{ id: "05", name: "数据存储", filename: "05_数据存储.md", template: "05_data-storage-doc" },
	{ id: "06", name: "编码规范", filename: "06_编码规范.md", template: "06_coding-standard-doc" },
	{ id: "07", name: "测试指南", filename: "07_测试指南.md", template: "07_testing-guide-doc" },
	{ id: "08", name: "构建部署", filename: "08_构建部署.md", template: "08_build-deploy-doc" },
] as const

// ========== 可选文档示例（仅供参考，模型可自行扩展）==========
// 以下仅为常见示例，模型应根据项目实际情况：
// 1. 判断这些示例是否适用
// 2. 自行添加项目特有的、对AI生成代码有价值的文档

// 常见可选文档示例
export const OPTIONAL_DOC_EXAMPLES = [
	{ id: "09", name: "服务通信", template: "09_service-comm-doc", 
	  description: "微服务间的调用方式、协议定义、服务发现" },
	{ id: "10", name: "中间件集成", template: "10_middleware-doc",
	  description: "缓存、消息队列、搜索引擎等中间件的使用方式" },
	{ id: "11", name: "安全认证", template: "11_security-auth-doc",
	  description: "认证授权机制、权限模型、安全实践" },
	{ id: "12", name: "前端组件", template: "00_default-doc",
	  description: "前端组件库、状态管理、路由配置" },
	{ id: "13", name: "领域模型", template: "00_default-doc",
	  description: "DDD领域模型、聚合根、实体、值对象" },
] as const

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
1. **定义查找 (search_definitions)**：
   - **场景**：需要获取类、接口、函数、常量的完整定义和签名时。
   - **优势**：比 read_file 更精准，能跨文件查找，消耗 Token 更少。
   - **规则**：优先使用 search_definitions 获取类型定义 (Interface/Struct) 和函数签名。
2. **引用追踪 (search_references)**：
   - **场景**：分析业务流程、调用链、依赖关系时。
   - **优势**：能找到所有调用方，构建完整的上下游链路。
   - **规则**：在生成“业务流程”或“架构图”时，必须对核心入口函数使用 search_references。
3. **大纲扫描 (list_code_definition_names)**：
   - **场景**：快速了解文件结构、类/方法列表，避免读取整个大文件。
   - **规则**：在分析陌生的大型文件前，先用此工具获取概览。
`

export const ANTI_HALLUCINATION_RULES = `
## 反幻觉协议 (Anti-Hallucination Protocol)
1. **零信任原则**：严禁使用任何“模板自带”的路径（如 \`src/api/user.ts\`）。所有路径必须来自 \`list_files\` 的真实输出。
2. **验证-执行-检查**：
   - **验证**：在引用文件前，必须确认其在文件列表中存在。
   - **执行**：读取文件内容或查找定义，确保函数/类/变量名真实存在。
   - **检查**：输出前再次核对路径拼写。
3. **置信度标记**：
   - 如果逻辑不清晰或代码缺失，必须标注 \`[待人工核实]\` 或 \`[逻辑推断]\`。
   - 禁止使用“可能”、“大概”等模糊词汇，要么是事实，要么是“未知”。
4. **禁止幽灵依赖**：严禁在 Mermaid 图或调用链中引用不存在的文件节点。
5. **工具验证**：对于关键的类型定义和函数调用，必须通过 \`search_definitions\` 或 \`read_file\` 获取确凿证据，禁止仅凭文件名猜测内容。
`

export const DEEP_ANALYSIS_RULES = `
## 深度分析协议 (Deep Analysis Protocol)
1. **透视隐式逻辑**：不要只翻译代码表面意思。要提取代码背后的业务规则（如：状态必须为 ACTIVE 才能登录、金额必须大于 0）。
2. **追踪调用链 (DFS)**：遇到函数调用时，必须说明“调用了谁”以及“对方做了什么”，而不是简单说“调用服务层”。
3. **识别领域术语**：提取代码中的业务术语（Ubiquitous Language），如 \`OrderPlaced\` (下单), \`InventoryReserved\` (库存预占)。
4. **关注异常路径**：不仅要描述成功流程，必须描述失败时的处理逻辑（回滚、重试、报错）。
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