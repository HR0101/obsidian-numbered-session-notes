// テスト用の小さな日付書式（moment の代わり）と，メモリ上の保管庫

import type { VaultPort } from "../src/creator.ts";
import type { DateFormatter } from "../src/logic.ts";

const PAD_LENGTH = 2;

/** YYYY，MM，M，DD，D だけを扱う書式関数 */
export const formatDate: DateFormatter = (date, format) =>
  format.replace(/YYYY|MM|M|DD|D/g, (token) => {
    switch (token) {
      case "YYYY":
        return String(date.getFullYear());
      case "MM":
        return String(date.getMonth() + 1).padStart(PAD_LENGTH, "0");
      case "M":
        return String(date.getMonth() + 1);
      case "DD":
        return String(date.getDate()).padStart(PAD_LENGTH, "0");
      default:
        return String(date.getDate());
    }
  });

/** パスと本文の対応で保管庫をまねる */
export class MemoryVault implements VaultPort {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();

  constructor(files: Record<string, string>) {
    for (const [path, content] of Object.entries(files)) {
      this.files.set(path, content);
    }
  }

  listMarkdownBasenames(folderPath: string): string[] {
    const prefix = folderPath.length > 0 ? `${folderPath}/` : "";
    return Array.from(this.files.keys())
      .filter((path) => path.startsWith(prefix) && path.endsWith(".md") && !path.slice(prefix.length).includes("/"))
      .map((path) => path.slice(prefix.length, -".md".length));
  }

  exists(path: string): boolean {
    return this.files.has(path) || this.folders.has(path);
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`missing ${path}`);
    }
    return content;
  }

  async create(path: string, content: string): Promise<void> {
    if (this.files.has(path)) {
      throw new Error(`exists ${path}`);
    }
    this.files.set(path, content);
  }

  async process(path: string, update: (content: string) => string): Promise<void> {
    this.files.set(path, update(await this.read(path)));
  }

  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path);
  }
}

/** 年・月・日から日付を作る（月は1始まり） */
export function day(year: number, month: number, date: number): Date {
  return new Date(year, month - 1, date);
}
