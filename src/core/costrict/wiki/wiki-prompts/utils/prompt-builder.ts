import { getLanguagePack, LanguageExample } from "../common/language-packs";

export interface ProjectContext {
  projectType?: "WebService" | "Frontend" | "Library" | "CLI" | "Mobile" | "Embedded" | "Unknown";
  techStack?: {
    language?: string;
    framework?: string;
  };
}

export class PromptBuilder {
  private languagePack: LanguageExample;
  private projectType: string;

  constructor(context: ProjectContext) {
    const language = context.techStack?.language || "generic";
    this.languagePack = getLanguagePack(language);
    this.projectType = context.projectType || "WebService";
  }

  public injectLanguageExamples(template: string): string {
    let result = template;
    
    // Replace placeholders with language-specific examples
    result = result.replace(/{{EXAMPLE_FILE_PATH}}/g, this.languagePack.filePath);
    result = result.replace(/{{EXAMPLE_CODE_SNIPPET}}/g, this.languagePack.codeSnippet);
    result = result.replace(/{{EXAMPLE_COMMAND}}/g, this.languagePack.command);
    result = result.replace(/{{NAMING_CONVENTION}}/g, this.languagePack.namingConvention);
    result = result.replace(/{{IMPORT_SYNTAX}}/g, this.languagePack.importSyntax);
    result = result.replace(/{{CLASS_DEFINITION}}/g, this.languagePack.classDefinition);
    result = result.replace(/{{FUNCTION_DEFINITION}}/g, this.languagePack.functionDefinition);
    result = result.replace(/{{TEST_FILE}}/g, this.languagePack.testFile);
    result = result.replace(/{{TEST_SNIPPET}}/g, this.languagePack.testSnippet);
    result = result.replace(/{{CONFIG_FILE}}/g, this.languagePack.configFile);
    result = result.replace(/{{DEPENDENCY_FILE}}/g, this.languagePack.dependencyFile);

    return result;
  }

  public customizeForProjectType(template: string): string {
    let typeSpecificInstructions = "";
    
    switch (this.projectType) {
      case "Library":
        typeSpecificInstructions = "重点关注导出的接口、类和类型定义。忽略 HTTP API 相关的描述，除非是一个 HTTP 客户端库。";
        break;
      case "CLI":
        typeSpecificInstructions = "重点关注命令行参数、子命令结构和标准输入输出处理。";
        break;
      case "Frontend":
        typeSpecificInstructions = "重点关注组件结构、状态管理和路由配置。忽略数据库和后端服务相关的描述。";
        break;
      case "Embedded":
        typeSpecificInstructions = "重点关注硬件接口、中断处理和内存管理。";
        break;
      case "Mobile":
        typeSpecificInstructions = "重点关注页面导航、生命周期管理和原生模块调用。";
        break;
      default: // WebService
        typeSpecificInstructions = "重点关注 API 接口、数据库模型和业务逻辑服务。";
        break;
    }

    return template.replace(/{{TYPE_SPECIFIC_INSTRUCTIONS}}/g, typeSpecificInstructions);
  }

  public build(template: string): string {
    let processed = this.injectLanguageExamples(template);
    processed = this.customizeForProjectType(processed);
    return processed;
  }
}