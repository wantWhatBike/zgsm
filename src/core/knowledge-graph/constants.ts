/**
 * 知识图谱常量配置
 */

import type { KnowledgeGraphConfig } from './types'

// 基础配置常量 - 统一管理所有配置值
export const BASE_CONFIG = {
  MAX_CONCURRENCY: 5,
  BATCH_SIZE: 10,
  MAX_FILES: 50000,
  FILE_SIZE_LIMIT: 5 * 1024 * 1024, // 5MB
  FILE_LINES_LIMIT: 5000,
  MAX_FILES_PER_BATCH: 50,
  MAX_LINES_PER_FILE: 10000,
  // 运行时配置
  INCREMENTAL_UPDATE: true,
  BREAKPOINT_RESUME: true,
} as const

// 默认配置
export const DEFAULT_CONFIG: KnowledgeGraphConfig = {
  enabled: true,
  model: 'auto',
  maxConcurrency: BASE_CONFIG.MAX_CONCURRENCY,
  batchSize: BASE_CONFIG.BATCH_SIZE,
  maxFiles: BASE_CONFIG.MAX_FILES,
  fileSizeLimit: BASE_CONFIG.FILE_SIZE_LIMIT,
  fileLinesLimit: BASE_CONFIG.FILE_LINES_LIMIT,
  storageType: 'file',
  cacheDir: '.costrict/cache/knowledge-graph',
  exportFormat: 'markdown'
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

// 扩展名冲突处理映射
export const EXT_CONFLICT_RESOLUTION = {
  '.m': {
    // 通过项目特征判断是 Objective-C 还是 MATLAB
    'objective-c': ['*.xcodeproj', '*.xcworkspace', 'Podfile', 'Info.plist'],
    'matlab': ['*.mat', '*.fig', '*.mlx', '*.slx']
  },
  '.pl': {
    // 通过项目特征判断是 Perl 还是 Prolog
    'perl': ['cpanfile', 'Makefile.PL', 'Build.PL', '*.pm'],
    'prolog': ['*.pro', '*.swi', '*.yap']
  }
} as const

// 重试配置常量
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000
} as const

// LLM配置
export const LLM_CONFIG = {
  maxRetries: RETRY_CONFIG.maxRetries,
  retryDelay: RETRY_CONFIG.initialDelay,
  maxTokens: 4000,
  temperature: 0.1,
  timeout: 60000,
  ANSWER_LANGUAGE: "简体中文"
}


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
  TIMEOUT: 'TIMEOUT'
} as const

const LLM_LANGUAGE = "简体中文"