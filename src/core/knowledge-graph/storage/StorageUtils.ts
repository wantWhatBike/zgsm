/**
 * 存储工具类
 */

export class StorageUtils {
  /**
   * 生成存储键
   */
  static generateKey(type: string, path: string): string {
    // Windows文件名不能包含的字符: < > : " | ? * 以及控制字符
    // 同时需要处理路径分隔符和其他特殊字符
    const safePath = path
      .replace(/[<>:"|?*]/g, '_')            // 替换Windows非法字符
      .split('').map(char => {               // 替换控制字符 (0-31)
        const code = char.charCodeAt(0)
        return (code >= 0 && code <= 31) ? '_' : char
      }).join('')
      .replace(/\\/g, '_')                   // 替换反斜杠
      .replace(/\//g, '_')                   // 替换正斜杠
      .replace(/\s+/g, '_')                  // 替换空格
      .replace(/_{2,}/g, '_')                // 合并多个下划线
      .replace(/^_+|_+$/g, '')               // 移除开头和结尾的下划线
    
    return `${type}_${safePath}`  // 使用下划线而不是冒号分隔
  }

  /**
   * 序列化数据
   */
  static serialize(data: any): string {
    return JSON.stringify(data, null, 2)
  }

  /**
   * 反序列化数据
   */
  static deserialize<T>(jsonString: string): T {
    try {
      return JSON.parse(jsonString) as T
    } catch (error) {
      throw new Error(`反序列化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 生成文件哈希
   */
  static generateFileHash(content: string): string {
    // 简单的哈希实现
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 格式化文件大小
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 检查路径是否有效
   */
  static isValidPath(path: string): boolean {
    if (!path || path.length === 0) return false
    
    // 检查是否包含非法字符
    const invalidChars = /[<>:"|?*]/
    // 检查控制字符 (ASCII 0-31)
    const hasControlChars = path.split('').some(char => {
      const code = char.charCodeAt(0)
      return code >= 0 && code <= 31
    })
    if (invalidChars.test(path) || hasControlChars) return false
    
    // 检查路径长度
    if (path.length > 260) return false // Windows路径长度限制
    
    return true
  }

  /**
   * 标准化路径
   */
  static normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/') // 统一使用正斜杠
      .replace(/\/+/g, '/') // 移除重复斜杠
      .replace(/\/$/, '') // 移除末尾斜杠
  }

  /**
   * 获取文件扩展名
   */
  static getFileExtension(filePath: string): string {
    const basename = filePath.split('/').pop() || ''
    const dotIndex = basename.lastIndexOf('.')
    
    if (dotIndex === -1 || dotIndex === 0) return ''
    
    return basename.substring(dotIndex + 1).toLowerCase()
  }

  /**
   * 生成时间戳
   */
  static generateTimestamp(): string {
    return new Date().toISOString()
  }

  /**
   * 深拷贝对象
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as unknown as T
    if (typeof obj === 'object') {
      const cloned = {} as T
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          cloned[key] = this.deepClone(obj[key])
        }
      }
      return cloned
    }
    return obj
  }
}


