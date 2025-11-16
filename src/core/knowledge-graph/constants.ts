/**
 * 知识图谱常量配置
 */

import type { KnowledgeGraphConfig, ExportFormat } from './types'

// 默认配置
export const DEFAULT_CONFIG: KnowledgeGraphConfig = {
  enabled: true,
  model: 'auto',
  maxConcurrency: 5,
  batchSize: 10,
  maxFiles: 50000,
  fileSizeLimit: 5 * 1024 * 1024, // 5MB
  fileLinesLimit: 5000,
  storageType: 'file',
  cacheDir: '.costrict/cache/knowledge-graph',
  exportFormat: 'markdown'
}

// 固定的运行时配置常量（不在UI中暴露）
export const RUNTIME_CONFIG = {
  // 最大并发数 - 固定为5，平衡性能和资源使用
  MAX_CONCURRENCY: 5,
  // 批次大小 - 固定为10，优化内存使用和处理效率
  BATCH_SIZE: 10,
  // 启用增量更新 - 固定为true，提高构建效率
  INCREMENTAL_UPDATE: true,
  // 启用断点执行 - 固定为true，支持任务中断后恢复
  BREAKPOINT_RESUME: true,
} as const


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
    'go.mod', 'go.sum',
    
    // Rust
    'Cargo.toml', 'Cargo.lock',
    
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
    '.gitignore', '.gitattributes',  // Git配置
    '.editorconfig',          // 编辑器统一配置
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
  '.pl', '.pm', '.pod', // Perl
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
  '.m', // Objective-C（iOS/macOS，.h已包含）
  '.kts', // Kotlin Script（Kotlin脚本）

  // 新增：数据科学/统计
  '.R', '.r', '.Rmd', // R语言及R Markdown
  '.jl', // Julia
  '.m', // MATLAB（与Objective-C共用，实际场景可区分）

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
  '.prolog', '.pl', // Prolog（.pl与Perl共用，实际场景可区分）

  // 新增：传统/企业级
  '.cob', '.cbl', // COBOL
  '.f', '.for', '.f90', '.f95', // Fortran
  '.vb', '.vbs', // Visual Basic/VBScript
  '.cfm', '.cfc', // ColdFusion
  '.cls', '.trigger', // Apex（Salesforce）
  '.pks', '.pkb' // PL/SQL（Oracle存储过程）
]

// LLM配置
export const LLM_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  maxTokens: 4000,
  temperature: 0.1,
  timeout: 60000,
  
  // 模型特定的配置
  models: {
    'gpt-4': {
      contextWindow: 8192,
      maxOutputTokens: 2048,
      supportsImages: false
    },
    'gpt-4-turbo': {
      contextWindow: 128000,
      maxOutputTokens: 4096,
      supportsImages: true
    },
    'claude-3-sonnet': {
      contextWindow: 200000,
      maxOutputTokens: 4096,
      supportsImages: true
    }
  }
}

// 分析配置
export const ANALYSIS_CONFIG = {
  maxFileSize: 1024 * 1024, // 1MB
  maxLinesPerFile: 10000,
  maxFilesPerBatch: 50,
  maxConcurrency: 5,
  
  // 复杂度计算权重
  complexityWeights: {
    lines: 0.1,
    functions: 2,
    classes: 5,
    imports: 0.5,
    dependencies: 1
  },
  
  // 依赖强度计算
  dependencyStrength: {
    direct_import: 1.0,
    indirect_reference: 0.7,
    inheritance: 0.9,
    composition: 0.8
  }
}

// 进度报告配置
export const PROGRESS_CONFIG = {
  updateInterval: 1000, // 1秒
  reportThreshold: 10, // 每10个文件报告一次
  phases: {
    root_analysis: { weight: 0.1, message: '分析项目根目录...' },
    file_analysis: { weight: 0.6, message: '分析文件...' },
    directory_analysis: { weight: 0.2, message: '分析目录...' },
    dependency_analysis: { weight: 0.1, message: '分析依赖关系...' }
  }
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

// 缓存配置
export const CACHE_CONFIG = {
  ttl: 24 * 60 * 60 * 1000, // 24小时
  maxSize: 1000,
  cleanupInterval: 60 * 60 * 1000 // 1小时
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

// 重试配置
export const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelay: 1000,
  maxDelay: 30000
}