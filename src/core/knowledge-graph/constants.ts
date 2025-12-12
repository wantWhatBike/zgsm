/**
 * 知识图谱常量配置
 */

import type { KnowledgeGraphConfig } from './types'
import { KNOWLEDGE_GRAPH_DEFAULTS, KnowledgeGraphBuildState, KNOWLEDGE_GRAPH_STATUS, KNOWLEDGE_GRAPH_PHASE } from "@roo-code/types"

// UI 配置常量（前端轮询、超时等）
export const UI_CONFIG = {
  // 轮询间隔（毫秒）
  POLLING_INTERVAL_RUNNING: 1500,
  POLLING_INTERVAL_PAUSED: 5000,
  POLLING_INTERVAL_DEFAULT: 10000,
  // 操作超时（毫秒）
  OPERATION_TIMEOUT: 10000,
  // 防抖延迟（毫秒）
  DEBOUNCE_DELAY: 300,
} as const

// ✅ 日志输出长度限制配置（防御性编程）
export const LOG_CONFIG = {
  MAX_ERROR_MESSAGE_LENGTH: 300,     // 错误消息最大长度
  MAX_RESPONSE_BODY_LENGTH: 200,     // API 响应体最大长度
  MAX_RESPONSE_PREVIEW_LENGTH: 200,  // 响应预览最大长度
} as const

// 可视化配置常量
export const VISUALIZATION_CONFIG = {
  // Worker 阈值：节点数超过此值使用 Web Worker
  WORKER_THRESHOLD: 1000,
  // 力导向图参数
  FORCE_LINK_DISTANCE: 100,
  FORCE_LINK_STRENGTH: 0.5,
  FORCE_CHARGE_STRENGTH: -300,
  FORCE_CHARGE_DISTANCE: 200,
  FORCE_COLLISION_RADIUS_BASE: 30,
  // 渲染参数
  NODE_RADIUS_BASE: 6,
  LABEL_FONT_SIZE: 10,
  TOOLTIP_DELAY_MS: 1000,
  TOOLTIP_HIDE_DELAY_MS: 200,
} as const

// 文件处理配置常量
export const FILE_PROCESSING_CONFIG = {
  FILE_LINES_LIMIT: 5000,
  MAX_FILES_PER_BATCH: 50,
  MAX_LINES_PER_FILE: 10000,
  // 运行时配置
  INCREMENTAL_UPDATE: true,
  BREAKPOINT_RESUME: true,
} as const

// 关键文件检测配置常量
export const KEY_FILE_DETECTION_CONFIG = {
  // 关键文件 hash 计算超时时间（毫秒）
  // 配置文件通常很小，1 秒足够；超时则跳过以避免阻塞构建启动
  HASH_TIMEOUT_MS: 1000,
  // 关键文件最大大小（字节）
  // 配置文件通常 < 1MB，超过 10MB 可能是误放的二进制文件
  // 注意：实际使用时优先使用 config.fileSizeLimit（如果配置了更小的值）
  MAX_KEY_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
} as const

// 注意：知识图谱使用混合存储模式
// - 文件摘要、目录摘要：SQLite（支持增量更新和全文搜索）
// - 根信息、构建状态、文件列表：JSON 文件（轻量级配置数据）
// storageType 配置项保留用于其他用途，实际使用由代码控制

// 默认配置
export const DEFAULT_CONFIG: KnowledgeGraphConfig = {
  model: 'auto',
  maxFiles: KNOWLEDGE_GRAPH_DEFAULTS.DEFAULT_MAX_FILES,
  fileSizeLimit: KNOWLEDGE_GRAPH_DEFAULTS.DEFAULT_FILE_SIZE_LIMIT,
  fileLinesLimit: FILE_PROCESSING_CONFIG.FILE_LINES_LIMIT,
  cacheDir: '.costrict/cache/knowledge-graph',
  exportFormat: 'markdown',
  // Auto-rebuild configuration
  autoRebuildEnabled: false,
  autoRebuildIntervalMinutes: KNOWLEDGE_GRAPH_DEFAULTS.DEFAULT_AUTO_REBUILD_INTERVAL,
  // Test files configuration
  includeTestFiles: KNOWLEDGE_GRAPH_DEFAULTS.DEFAULT_INCLUDE_TEST_FILES,
  // Visualization configuration
  maxVisualizationFiles: KNOWLEDGE_GRAPH_DEFAULTS.DEFAULT_MAX_VISUALIZATION_FILES,
  // LLM configuration
  contextWindowSize: 128000,
  contextWindowThreshold: 25,  // ✅ 优化：降低到 25%，避免批次过大导致响应慢（原 50%）
  llmTimeoutMs: 300000,
  llmMaxRetries: 5,
  // 新增配置：目录文件分析
  maxFilesPerDirectory: 50,      // 单目录最大文件数，超过则只发送文件名
  maxDefinitionLines: 100,       // 文件大纲最大行数
}


// 项目关键文件模式
export const KEY_FILE_PATTERNS = [
  // 第一优先级：文档（项目核心说明）
  [
    'readme*',         // README及多语言变体（如README_zh.md、ReadMe.txt）
  ],
  // 第二优先级：依赖配置（各语言依赖管理文件）
  [
    // Node.js/前端
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    
    // Python
    'requirements.txt', 'requirements-dev.txt',
    'pyproject.toml', 'setup.py', 'setup.cfg',
    'Pipfile', 'Pipfile.lock',
    
    // Java/JVM
    'pom.xml',                  // Maven
    'build.gradle', 'build.gradle.kts',  // Gradle（Groovy/Kotlin）
    'settings.gradle', 'settings.gradle.kts',
    
    // Go
    'go.mod',
    
    // Rust
    'Cargo.toml',
    
    // PHP
    'composer.json', 'composer.lock',
    
    // Ruby
    'Gemfile', 'Gemfile.lock',
    
    // Swift（iOS/macOS）
    'Package.swift', 'Podfile', 'Podfile.lock',
    
    // Dart/Flutter
    'pubspec.yaml', 'pubspec.lock',
    
    // Elixir
    'mix.exs', 'mix.lock',
    
    // .NET（C#/VB/F#）
    '*.csproj', '*.vbproj', '*.fsproj',
    'Directory.Build.props', 'Directory.Build.targets',
    
    // Scala
    'build.sbt',
    
    // Julia
    'Project.toml', 'Manifest.toml',
    
    // R
    'DESCRIPTION'
  ],
  // 第三优先级：项目配置（环境、工具、规范配置）
  [
    '.env*',                  // 环境变量（.env、.env.local、.env.example）
    '.eslint*', '.prettier*', // 代码规范（.eslintrc.js、prettier.config.json）
    'tsconfig.*', 'jsconfig.*', // 类型配置（tsconfig.json、tsconfig.app.json）
    'jest.config.*', 'pytest.ini', 'pylintrc' // 测试工具配置
  ],
  // 第四优先级：构建部署（构建脚本、部署配置）
  [
    'dockerfile*', 'docker-compose*.yml', 'docker-compose*.yaml', // 容器化
    'makefile*', 'cmakeLists.txt', 'CMakeCache.txt', // 构建工具
    'gulpfile.*', 'gruntfile.*', // 前端构建
    'webpack.config.*', 'vite.config.*', 'rollup.config.*', // 打包工具
    'build.*', 'deploy.*', 'publish.*' // 自定义构建/部署脚本
  ]
];


// 忽略的文件模式
export const IGNORE_PATTERNS = [
  // 构建输出
  'node_modules/',
  'dist/',
  'build/',
  'out/',
  'target/',
  'bin/',
  'obj/',
  '.next/',
  '.nuxt/',
  '.cache/',
  
  // 二进制文件
  '*.exe',
  '*.dll',
  '*.so',
  '*.dylib',
  '*.class',
  '*.jar',
  '*.war',
  '*.ear',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.rar',
  '*.7z',
  
  // 媒体文件
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.bmp',
  '*.ico',
  '*.svg',
  '*.mp3',
  '*.mp4',
  '*.avi',
  '*.mov',
  '*.pdf',
  '*.doc',
  '*.docx',
  
  // 日志和临时文件
  '*.log',
  '*.tmp',
  '*.temp',
  '*.bak',
  '*.swp',
  '*.swo',
  '*.pid',
  '*.seed',
  '*.pid.lock',
  
  // 系统文件
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.lnk',
  
  // IDE文件
  '.vscode/',
  '.idea/',
  '*.sublime-project',
  '*.sublime-workspace',
  
  // 版本控制
  '.git/',
  '.svn/',
  '.hg/',
  '.bzr/',
  
  // 测试覆盖率
  'coverage/',
  '.nyc_output/',
  '.jest/',
  '.c8/',
  '*.lcov'
]

export const INCLUDE_EXTS = [
  // 已有的主流语言
  '.java', '.go', '.py', '.rs', '.c', '.cpp', '.h', '.cs', '.kt',
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.html', '.css', '.sh', '.bash', '.lua',

  // 新增：后端/服务器端语言
  '.php', '.php3', '.php5', '.phtml', // PHP
  '.rb', '.rbw', // Ruby
  '.pl', '.pm', '.pod', // Perl (注意：.pl 也用于 Prolog，需要上下文区分)
  '.scala', '.sc', // Scala
  '.groovy', '.gvy', '.gy', // Groovy
  '.dart', // Dart（Flutter）
  '.ex', '.exs', // Elixir
  '.erl', '.hrl', // Erlang
  '.fs', '.fsx', '.fsi', // F#

  // 新增：前端/样式语言
  '.less', // Less（CSS预处理器）
  '.sass', '.scss', // Sass/SCSS（CSS预处理器）
  '.styl', // Stylus（CSS预处理器）
  '.d.ts', // TypeScript 声明文件
  '.coffee', // CoffeeScript（JS超集）

  // 新增：移动端/桌面端
  '.swift', // Swift（iOS/macOS）
  '.m', // Objective-C/MATLAB (注意：需要上下文区分 iOS 项目 vs 科学计算项目)
  '.kts', // Kotlin Script（Kotlin脚本）

  // 新增：数据科学/统计
  '.R', '.r', '.Rmd', // R语言及R Markdown
  '.jl', // Julia

  // 新增：系统/脚本
  '.ps1', '.psm1', '.psd1', // PowerShell
  '.bat', '.cmd', // Batch脚本
  '.tcl', // Tcl脚本

  // 新增：底层/硬件相关
  '.asm', '.s', // 汇编语言
  '.vhd', '.vhdl', // VHDL（硬件描述语言）
  '.v', '.sv', // Verilog/SystemVerilog（硬件描述语言）
  '.hpp', '.hh', // C++ 头文件（补充.h）

  // 新增：函数式/小众主流
  '.hs', '.lhs', // Haskell（.lhs为Literate Haskell）
  '.clj', '.cljs', '.cljc', // Clojure（及ClojureScript）
  '.lisp', '.lsp', // Lisp
  '.prolog', // Prolog (使用专用扩展名避免与 Perl 的 .pl 冲突)

  // 新增：传统/企业级
  '.cob', '.cbl', // COBOL
  '.f', '.for', '.f90', '.f95', // Fortran
  '.vb', '.vbs', // Visual Basic/VBScript
  '.cfm', '.cfc', // ColdFusion
  '.cls', '.trigger', // Apex（Salesforce）
  '.pks', '.pkb' // PL/SQL（Oracle存储过程）
]

// 重试配置常量
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000
} as const

// LLM 语言设置
export const LLM_LANGUAGE = "English"

// LLM配置
export const LLM_CONFIG = {
  maxRetries: RETRY_CONFIG.maxRetries,
  retryDelay: RETRY_CONFIG.initialDelay,
  maxTokens: 4000,
  temperature: 0.1,
  timeout: 300000,  // 5分钟超时
  ANSWER_LANGUAGE: LLM_LANGUAGE
}

// search_codes 工具配置
export const SEARCH_CODES_CONFIG = {
  DEFAULT_MAX_DEPTH: 5,      // 默认调用链追溯深度
  MAX_DEPTH_LIMIT: 10,       // 最大深度限制
  MIN_DEPTH_LIMIT: 1,        // 最小深度限制
} as const

// 导出配置
export const EXPORT_CONFIG = {
  json: {
    indent: 2,
    maxArrayLength: 1000
  },
  jsonl: {
    batchSize: 100
  },
  markdown: {
    maxDepth: 6,
    includeToc: true
  },
  zip: {
    compressionLevel: 6,
    maxFileSize: 100 * 1024 * 1024 // 100MB
  }
}


// 错误代码
export const ERROR_CODES = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  LLM_RATE_LIMIT: 'LLM_RATE_LIMIT',
  LLM_CONTEXT_EXCEEDED: 'LLM_CONTEXT_EXCEEDED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED'  // ✅ 用户主动中止操作（暂停）
} as const

// 默认构建状态
export const DEFAULT_BUILD_STATE: KnowledgeGraphBuildState = {
  progress: 0,
  totalFiles: 0,
  totalFilesToProcess: 0,
  processedFiles: 0,
  failedFiles: 0,
  currentFile: "",
  status: KNOWLEDGE_GRAPH_STATUS.PENDING,
  phase: "root_analysis",
  lastUpdateTime: new Date().toISOString(),
  totalDuration: 0,
  phaseProgress: {
    root_analysis: { total: 0, processed: 0, status: KNOWLEDGE_GRAPH_STATUS.PENDING },
    directory_file_analysis: { total: 0, processed: 0, status: KNOWLEDGE_GRAPH_STATUS.PENDING }
  }
}