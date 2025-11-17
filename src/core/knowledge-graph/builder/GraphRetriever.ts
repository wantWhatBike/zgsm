import { ILogger } from "../../../utils/logger"
import { FileStorage } from "../../storage/FileStorage"
import { SearchResult, SearchQuery } from "../../types"
import { Exporter } from "../export/Exporter"
import { ExportOptions, ExportResult, RootInfo } from "../types"

/**
 * 知识图谱检索器
 * 负责高效检索知识图谱中的信息，为LLM提供项目上下文
 */
export class GraphRetriever {
	private logger: ILogger
	private exporter: Exporter
	private storage: FileStorage

	constructor(logger: ILogger, storage: FileStorage, exporter: Exporter) {
		this.logger = logger
		this.storage = storage
        this.exporter = exporter
	}

	/**
	 * 搜索知识图谱
	 * @param query 搜索查询
	 * @returns 搜索结果
	 */
	public async search(query: SearchQuery): Promise<SearchResult[]> {
		this.logger?.info(`[GraphRetriever] 搜索: ${JSON.stringify(query)}`)
		// TODO: 实现搜索逻辑
		return []
	}

	public async export(options: ExportOptions): Promise<ExportResult> {
		return this.exporter.export(options)
	}

	/**
	 * 获取项目根信息 - 从root_info.json读取
	 */
	public async getRootInfo(): Promise<RootInfo | null> {
		return await this.storage.getRootInfo()
	}
}
