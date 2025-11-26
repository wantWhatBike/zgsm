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

export const NEW_SUBTASK = `鍒涘缓濡備笅 \`subtask\`瀛愪换鍔★紝鎵ц锛屾牴鎹疄闄呮儏鍐靛～鍏匢nput銆丅ackground淇℃伅锛歚

// v3 Agent鏂囦欢鍚嶅父閲忥紙鍚堝苟鍚庯級
export const SUBTASK_FILENAMES = {
	PROJECT_ANALYZE_AGENT: "01_project-basic-analyze-agent.md",  // 椤圭洰鍒嗘瀽+鏂囨。鐩綍
	DOCUMENT_GENERATION_AGENT: "02_document-generate-agent.md",
	INDEX_GENERATION_AGENT: "03_index-generation-agent.md",
} as const

// v3 Agent杈撳嚭鏂囦欢鍚嶅父閲?
export const AGENT_OUTPUT_FILENAMES = {
	PROJECT_ANALYZE_AGENT: "catalogue.json",  // 鐩存帴杈撳嚭鏂囨。鐩綍
	DOCUMENT_GENERATION_AGENT: "technical-documentation.md",
	INDEX_GENERATION_AGENT: "index.md",
} as const

// 涓绘枃浠跺悕
export const MAIN_WIKI_FILENAME = "project-wiki.md"

// v2 绯荤粺杈撳叆杈撳嚭鏂囦欢璺緞甯搁噺
export const WIKI_OUTPUT_FILE_PATHS = {
	// 杈撳嚭鐩綍
	STAGING_OUTPUT_DIR: ".cospec/wiki/.staging/",
	WIKI_OUTPUT_DIR: ".cospec/wiki/",
	GENERAL_RULES_OUTPUT_DIR: ".roo/rules-code/",
	
	// 鍚勯樁娈佃緭鍑烘枃浠?
	PROJECT_BASIC_ANALYZE_JSON: `.cospec/wiki/.staging/basic_analyze.json`,
	OUTPUT_CATALOGUE_JSON: ".cospec/wiki/.staging/catalogue.json",
	
	// 鏈€缁堣緭鍑烘枃浠?
	DOCUMENT_INDEX_MD: ".cospec/wiki/index.md",
} as const

// v2 妯″紡閫夋嫨闃堝€?
export const MODE_THRESHOLDS = {
	SMALL_PROJECT: 50,    // 灏忓瀷椤圭洰鏂囦欢鏁伴槇鍊?
	MEDIUM_PROJECT: 200,  // 涓瀷椤圭洰鏂囦欢鏁伴槇鍊?
	LARGE_PROJECT: 201,   // 澶у瀷椤圭洰鏂囦欢鏁伴槇鍊?
} as const

// ========== 鏂囨。浣撶郴瀹氫箟 ==========

// 蹇呴€夋枃妗ｏ紙8涓紝蹇呴』鐢熸垚锛?
export const REQUIRED_DOCS = [
	{ id: "01", name: "椤圭洰姒傝", filename: "01_椤圭洰姒傝.md", template: "01_overview-doc" },
	{ id: "02", name: "浠ｇ爜鏋舵瀯", filename: "02_浠ｇ爜鏋舵瀯.md", template: "02_architecture-doc" },
	{ id: "03", name: "涓氬姟娴佺▼", filename: "03_涓氬姟娴佺▼.md", template: "03_business-flow-doc" },
	{ id: "04", name: "API鎺ュ彛鏂囨。", filename: "04_API鎺ュ彛鏂囨。.md", template: "04_api-doc" },
	{ id: "05", name: "鏁版嵁瀛樺偍", filename: "05_鏁版嵁瀛樺偍.md", template: "05_data-storage-doc" },
	{ id: "06", name: "缂栫爜瑙勮寖", filename: "06_缂栫爜瑙勮寖.md", template: "06_coding-standard-doc" },
	{ id: "07", name: "娴嬭瘯鎸囧崡", filename: "07_娴嬭瘯鎸囧崡.md", template: "07_testing-guide-doc" },
	{ id: "08", name: "鏋勫缓閮ㄧ讲", filename: "08_鏋勫缓閮ㄧ讲.md", template: "08_build-deploy-doc" },
] as const

// ========== 鍙€夋枃妗ｇず渚嬶紙浠呬緵鍙傝€冿紝妯″瀷鍙嚜琛屾墿灞曪級==========
// 浠ヤ笅浠呬负甯歌绀轰緥锛屾ā鍨嬪簲鏍规嵁椤圭洰瀹為檯鎯呭喌锛?
// 1. 鍒ゆ柇杩欎簺绀轰緥鏄惁閫傜敤
// 2. 鑷娣诲姞椤圭洰鐗规湁鐨勩€佸AI鐢熸垚浠ｇ爜鏈変环鍊肩殑鏂囨。

// 甯歌鍙€夋枃妗ｇず渚?
export const OPTIONAL_DOC_EXAMPLES = [
	{ id: "09", name: "鏈嶅姟閫氫俊", template: "09_service-comm-doc", 
	  description: "寰湇鍔￠棿鐨勮皟鐢ㄦ柟寮忋€佸崗璁畾涔夈€佹湇鍔″彂鐜? },
	{ id: "10", name: "涓棿浠堕泦鎴?, template: "10_middleware-doc",
	  description: "缂撳瓨銆佹秷鎭槦鍒椼€佹悳绱㈠紩鎿庣瓑涓棿浠剁殑浣跨敤鏂瑰紡" },
	{ id: "11", name: "瀹夊叏璁よ瘉", template: "11_security-auth-doc",
	  description: "璁よ瘉鎺堟潈鏈哄埗銆佹潈闄愭ā鍨嬨€佸畨鍏ㄥ疄璺? },
	{ id: "12", name: "鍓嶇缁勪欢", template: "00_default-doc",
	  description: "鍓嶇缁勪欢搴撱€佺姸鎬佺鐞嗐€佽矾鐢遍厤缃? },
	{ id: "13", name: "棰嗗煙妯″瀷", template: "00_default-doc",
	  description: "DDD棰嗗煙妯″瀷銆佽仛鍚堟牴銆佸疄浣撱€佸€煎璞? },
] as const

// 鍙€夋枃妗ｆ墿灞曡鏄庯紙渚涙彁绀鸿瘝浣跨敤锛?
export const OPTIONAL_DOC_EXTENSION_GUIDE = `
**鍙€夋枃妗ｄ笉闄愪簬浠ヤ笂绀轰緥**锛屼綘搴旇鏍规嵁椤圭洰瀹為檯鎯呭喌鎬濊€冿細
- 椤圭洰鏈夊摢浜涚嫭鐗圭殑銆佸鏉傜殑妯″潡鍊煎緱鍗曠嫭鎴愭枃妗ｏ紵
- 鏈夊摢浜涘AI鐢熸垚浠ｇ爜鏈夐噸瑕佸弬鑰冧环鍊肩殑鍐呭锛?
- 椤圭洰鐨勬牳蹇冧笟鍔￠鍩熸槸鍚﹂渶瑕佷笓闂ㄦ枃妗ｏ紵

绀轰緥锛堟牴鎹」鐩壒鐐瑰彲鑳介渶瑕侊級锛?
- 鏀粯闆嗘垚锛氭敮浠樻笭閬撳鎺ャ€佸洖璋冨鐞?
- 绗笁鏂笰PI锛氬閮ㄦ湇鍔￠泦鎴愭柟寮?
- 瀹氭椂浠诲姟锛欽ob璋冨害銆丆ron閰嶇疆
- WebSocket锛氬疄鏃堕€氫俊鍗忚
- 鏂囦欢瀛樺偍锛歄SS/S3涓婁紶涓嬭浇
- 鍥介檯鍖栵細澶氳瑷€閰嶇疆
- 鐩戞帶鍛婅锛氭棩蹇椼€佹寚鏍囥€侀摼璺拷韪?
- ...

缂栧彿鎺ョ画蹇呴€夋枃妗?01-08)涔嬪悗锛屾寜椤哄簭閫掑锛屼娇鐢ㄩ粯璁ゆā鏉?00_default-doc)鍗冲彲
`

// 鏂囨。妯℃澘鏂囦欢鍚嶆槧灏?
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

// 鏂囨。绫诲瀷鏋氫妇
export type DocTemplateType = keyof typeof DOC_TEMPLATE_FILES

export const COMMON_RULES = 
`1. 浣跨敤\`todo_list\` 瑙勫垝浠诲姟锛岄€愪釜鎵ц銆?
2. 涓ユ牸閬靛惊姣忎釜姝ラ鐨?*杈撳嚭瑕佹眰**锛屼笉瑕侀仐婕忎换浣曠粏鑺傘€?
3. 浣跨敤\`attempt_completion\`宸ュ叿杩斿洖鍏抽敭淇℃伅锛屼緵鐖朵换鍔′娇鐢ㄣ€?
`

// 浠ｇ爜鍏宠仈楠岃瘉瑙勫垯锛堟墍鏈夋ā鏉块€氱敤锛?
export const CODE_REFERENCE_RULES = `
## 浠ｇ爜鍏宠仈寮哄埗瑙勫垯
- 姣忎釜缁撹蹇呴』鏍囨敞鏉ユ簮锛歕`鏉ユ簮: src/service/user.ts, src/api/userController.ts\`
- 姣忓紶鍥捐〃蹇呴』鏍囨敞鍏宠仈浠ｇ爜锛歕`鐩稿叧浠ｇ爜: src/flow/, src/handler/\`
- 姣忔浠ｇ爜绀轰緥蹇呴』鏍囨敞鍘熷浣嶇疆锛歕`鎽樿嚜: src/utils/auth.ts:L23-45\`
- 澶氫釜鐩稿叧鏂囦欢鏃跺垪鍑哄叏閮紝渚夸簬AI绱㈠紩
- 绂佹鎻忚堪鏈鍙栬繃鐨勪唬鐮佹枃浠?
- 绂佹缂栭€犱唬鐮佺ず渚?

## 杈撳嚭鍓嶆鏌ユ竻鍗?
1. [ ] 姣忎釜缁撹鏄惁鏍囨敞浜嗕唬鐮佹潵婧愯矾寰勶紵
2. [ ] 姣忓紶鍥捐〃鏄惁鍏宠仈浜嗙浉鍏充唬鐮佺洰褰?鏂囦欢锛?
3. [ ] 浠ｇ爜绀轰緥鏄惁鏍囨敞浜嗗師濮嬫枃浠朵綅缃紵
4. [ ] 鍑芥暟绛惧悕銆佸弬鏁扮被鍨嬫槸鍚︿笌婧愮爜瀹屽叏涓€鑷达紵
5. [ ] 鏄惁鏈夋湭璇诲彇浠ｇ爜灏辩敓鎴愮殑鍐呭锛燂紙绂佹锛?
`