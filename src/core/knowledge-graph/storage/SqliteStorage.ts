import { IStorage } from "./IStorage";

//TODO: 实现sqlite 存储 文件摘要 FileSummary、目录摘要 DirSummary , 便于增量更新、全文检索（FTS5）。
export class SqliteStorate implements IStorage {
    addBatch(table: string, data: any[]): Promise<void> {
        throw new Error("Method not implemented.");
    }
    deleteItems(table: string, predicate: (item: any) => boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }
    initialize(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    exists(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    clear(table: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    load(table: string): Promise<string | null> {
        throw new Error("Method not implemented.");
    }
    overwrite(table: string, data: any): Promise<void> {
        throw new Error("Method not implemented.");
    }
    add(table: string, data: any): Promise<void> {
        throw new Error("Method not implemented.");
    }



}