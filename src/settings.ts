// 設定の型と初期値，組み込みのテンプレート

export interface SessionNoteSettings {
  /** ノートを作るフォルダ（空なら保管庫の一番上） */
  folder: string;
  /** ファイル名の形式（{{number}} か {{kanji}} が必要） */
  fileNameFormat: string;
  /** テンプレートのノート（空なら組み込みのテンプレート） */
  templatePath: string;
  /** 開催曜日（0=日曜〜6=土曜）．空なら今日の日付を使う */
  weekdays: number[];
  /** 新しい回へのリンクを追記する一覧ノート（空なら追記しない） */
  indexNotePath: string;
  /** 一覧ノートで，最初のリンクを書き足す見出し */
  indexHeading: string;
  /** 一覧ノートに追記する行の形式 */
  indexLineFormat: string;
  /** 作ったノートを新しいタブで開く */
  openInNewTab: boolean;
}

export const DEFAULT_SETTINGS: SessionNoteSettings = {
  folder: "",
  fileNameFormat: "第{{number}}回_{{date:M_DD}}",
  templatePath: "",
  weekdays: [],
  indexNotePath: "",
  indexHeading: "",
  indexLineFormat: "- [[{{title}}]]（{{date:YYYY/MM/DD}}）",
  openInNewTab: false,
};

/** テンプレートのノートがないときに使う本文 */
export const BUILTIN_TEMPLATE = `---
回: 第{{number}}回
日付: {{date:YYYY-MM-DD}}
---

# 第{{kanji}}回（{{date:YYYY/MM/DD}}）

## メモ


---
- 前回: {{prevLink}}
`;

/** 曜日の数（設定画面のチェックボックスの数） */
export const WEEKDAY_COUNT = 7;

/** 保存されていた設定を，足りない項目を初期値で補って読み込む */
export function mergeSettings(saved: unknown): SessionNoteSettings {
  const source = (typeof saved === "object" && saved !== null ? saved : {}) as Partial<SessionNoteSettings>;
  const merged: SessionNoteSettings = { ...DEFAULT_SETTINGS, ...source };
  merged.weekdays = Array.isArray(source.weekdays)
    ? source.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day < WEEKDAY_COUNT)
    : [];
  return merged;
}
