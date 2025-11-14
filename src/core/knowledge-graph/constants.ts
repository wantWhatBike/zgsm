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
  fileSizeLimit: 1024 * 1024, // 1MB
  storageType: 'file',
  cacheDir: '.costrict/cache/knowledge-graph',
  breakpointResume: true,
  exportFormats: ['json', 'jsonl', 'markdown', 'zip']
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

// 文件类型映射
export const FILE_TYPE_MAPPING: Record<string, 'source' | 'config' | 'document' | 'test'> = {
  // 源代码文件
  '.ts': 'source',
  '.tsx': 'source',
  '.js': 'source',
  '.jsx': 'source',
  '.py': 'source',
  '.java': 'source',
  '.cpp': 'source',
  '.c': 'source',
  '.cs': 'source',
  '.go': 'source',
  '.rs': 'source',
  '.php': 'source',
  '.rb': 'source',
  '.swift': 'source',
  '.kt': 'source',
  '.scala': 'source',
  '.r': 'source',
  '.m': 'source',
  '.mm': 'source',
  '.vue': 'source',
  '.svelte': 'source',
  
  // 配置文件
  '.json': 'config',
  '.yaml': 'config',
  '.yml': 'config',
  '.xml': 'config',
  '.toml': 'config',
  '.ini': 'config',
  '.conf': 'config',
  '.config': 'config',
  '.env': 'config',
  '.properties': 'config',
  
  // 文档文件
  '.md': 'document',
  '.markdown': 'document',
  '.rst': 'document',
  '.txt': 'document',
  '.doc': 'document',
  '.docx': 'document',
  
  // 测试文件
  '.test.ts': 'test',
  '.spec.ts': 'test',
  '.test.js': 'test',
  '.spec.js': 'test',
  '.test.py': 'test',
  '.spec.py': 'test',
  '.test.java': 'test',
  '.spec.java': 'test',
  '_test.go': 'test',
  '_test.rb': 'test',
  'test_': 'test'
}

// 关键配置文件
export const KEY_CONFIG_FILES = [
  'package.json',
  'pom.xml',
  'build.gradle',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'setup.py',
  'composer.json',
  'Gemfile',
  'Podfile',
  'build.sbt',
  'project.clj',
  'mix.exs',
  'CMakeLists.txt',
  'Makefile',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.env',
  '.env.example',
  'tsconfig.json',
  'jsconfig.json',
  'webpack.config.js',
  'vite.config.js',
  'rollup.config.js',
  'babel.config.js',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  'jest.config.js',
  'vitest.config.ts',
  'cypress.config.js',
  'playwright.config.js'
]

// 关键文档文件
export const KEY_DOCUMENT_FILES = [
  'README.md',
  'README.rst',
  'README.txt',
  'CHANGELOG.md',
  'CHANGELOG.rst',
  'CONTRIBUTING.md',
  'CONTRIBUTING.rst',
  'LICENSE',
  'LICENSE.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'docs/',
  'documentation/',
  'wiki/'
]

// 构建文件
export const BUILD_FILES = [
  'Makefile',
  'makefile',
  'CMakeLists.txt',
  'build.gradle',
  'pom.xml',
  'package.json',
  'Cargo.toml',
  'go.mod',
  'setup.py',
  'build.sbt',
  'project.clj',
  'mix.exs'
]

// 部署文件
export const DEPLOYMENT_FILES = [
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'kubernetes.yaml',
  'k8s.yaml',
  '.github/workflows/',
  '.gitlab-ci.yml',
  'Jenkinsfile',
  'azure-pipelines.yml',
  '.travis.yml',
  'circle.yml'
]

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