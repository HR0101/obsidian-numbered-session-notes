// 次の回のノートを決めて作る処理．保管庫の操作は VaultPort を通すので，テストでは偽物に差し替えられる．

import type { DateFormatter, NoteMatcher } from "./logic.ts";
import {
  buildNoteMatcher,
  computeDefaultDate,
  findNextNumber,
  findPreviousTitle,
  insertIndexEntry,
  renderFileName,
  renderTemplate,
} from "./logic.ts";
import type { SessionNoteSettings } from "./settings.ts";
import { BUILTIN_TEMPLATE } from "./settings.ts";

/** プラグインが使う保管庫の操作 */
export interface VaultPort {
  /** フォルダの直下にある Markdown ノートの名前（拡張子なし） */
  listMarkdownBasenames(folderPath: string): string[];
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  create(path: string, content: string): Promise<void>;
  process(path: string, update: (content: string) => string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
}

/** これから作る（または開く）ノートの計画 */
export interface SessionPlan {
  number: number;
  date: Date;
  title: string;
  path: string;
  prevTitle: string | null;
  exists: boolean;
}

/** 作成で起きた，止めるほどではない問題 */
export type CreateWarning = "templateMissing" | "indexMissing";

export interface CreateResult {
  path: string;
  created: boolean;
  indexUpdated: boolean;
  warnings: CreateWarning[];
}

/** 設定の形式に番号の差し込みがないときのエラー */
export class InvalidFormatError extends Error {
  constructor() {
    super("The file name format must contain {{number}} or {{kanji}}.");
    this.name = "InvalidFormatError";
  }
}

const MARKDOWN_EXTENSION = ".md";

/** フォルダとファイル名をつなぐ */
export function joinPath(folder: string, name: string): string {
  const trimmed = folder.replace(/^\/+|\/+$/g, "");
  return trimmed.length > 0 ? `${trimmed}/${name}` : name;
}

/** 拡張子のないノートのパスに .md を付ける */
export function withMarkdownExtension(path: string): string {
  return path.toLowerCase().endsWith(MARKDOWN_EXTENSION) ? path : `${path}${MARKDOWN_EXTENSION}`;
}

/** 設定からファイル名の照合器を作る（番号の差し込みがなければエラー） */
export function requireMatcher(settings: SessionNoteSettings): NoteMatcher {
  const matcher = buildNoteMatcher(settings.fileNameFormat);
  if (!matcher) {
    throw new InvalidFormatError();
  }
  return matcher;
}

/** 次の回の番号と日付の初期値を決める */
export function planDefaults(settings: SessionNoteSettings, vault: VaultPort, today: Date): { number: number; date: Date } {
  const matcher = requireMatcher(settings);
  const names = vault.listMarkdownBasenames(settings.folder);
  return {
    number: findNextNumber(names, matcher),
    date: computeDefaultDate(today, settings.weekdays),
  };
}

/** 番号と日付から，作るノートの名前・パス・前回のノートを決める */
export function planSession(
  settings: SessionNoteSettings,
  vault: VaultPort,
  number: number,
  date: Date,
  formatDate: DateFormatter,
): SessionPlan {
  const matcher = requireMatcher(settings);
  const names = vault.listMarkdownBasenames(settings.folder);
  const title = renderFileName(settings.fileNameFormat, number, date, formatDate);
  const path = joinPath(settings.folder, `${title}${MARKDOWN_EXTENSION}`);
  return {
    number,
    date,
    title,
    path,
    prevTitle: findPreviousTitle(names, matcher, number),
    exists: vault.exists(path),
  };
}

/** テンプレートの本文を読む．指定のノートがなければ組み込みのテンプレートを使う */
async function loadTemplate(settings: SessionNoteSettings, vault: VaultPort, warnings: CreateWarning[]): Promise<string> {
  if (settings.templatePath.trim().length === 0) {
    return BUILTIN_TEMPLATE;
  }
  const path = withMarkdownExtension(settings.templatePath.trim());
  if (!vault.exists(path)) {
    warnings.push("templateMissing");
    return BUILTIN_TEMPLATE;
  }
  return vault.read(path);
}

/** 一覧ノートに新しい回の行を足す．一覧ノートがなければ警告だけ出す */
async function updateIndex(
  plan: SessionPlan,
  settings: SessionNoteSettings,
  vault: VaultPort,
  formatDate: DateFormatter,
  warnings: CreateWarning[],
): Promise<boolean> {
  if (settings.indexNotePath.trim().length === 0) {
    return false;
  }
  const path = withMarkdownExtension(settings.indexNotePath.trim());
  if (!vault.exists(path)) {
    warnings.push("indexMissing");
    return false;
  }
  const matcher = requireMatcher(settings);
  const line = renderTemplate(settings.indexLineFormat, {
    number: plan.number,
    date: plan.date,
    title: plan.title,
    prevTitle: plan.prevTitle,
  }, formatDate);
  let changed = false;
  await vault.process(path, (content) => {
    const updated = insertIndexEntry(content, {
      line,
      title: plan.title,
      number: plan.number,
      heading: settings.indexHeading,
    }, matcher);
    changed = updated !== content;
    return updated;
  });
  return changed;
}

/** 計画どおりにノートを作り，一覧ノートを更新する．すでにあれば作らない */
export async function createSessionNote(
  plan: SessionPlan,
  settings: SessionNoteSettings,
  vault: VaultPort,
  formatDate: DateFormatter,
): Promise<CreateResult> {
  const warnings: CreateWarning[] = [];
  if (vault.exists(plan.path)) {
    return { path: plan.path, created: false, indexUpdated: false, warnings };
  }
  const template = await loadTemplate(settings, vault, warnings);
  const content = renderTemplate(template, {
    number: plan.number,
    date: plan.date,
    title: plan.title,
    prevTitle: plan.prevTitle,
  }, formatDate);
  await vault.ensureFolder(settings.folder);
  await vault.create(plan.path, content);
  const indexUpdated = await updateIndex(plan, settings, vault, formatDate, warnings);
  return { path: plan.path, created: true, indexUpdated, warnings };
}
