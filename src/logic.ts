// 連番ノートの番号・日付・ファイル名・テンプレートを扱う関数群．
// Obsidian の API に依存しないので，そのままテストできる．

/** 日付を書式に従って文字列にする関数（プラグインでは moment を渡す） */
export type DateFormatter = (date: Date, format: string) => string;

/** テンプレートに差し込む値 */
export interface TemplateContext {
  number: number;
  date: Date;
  title: string;
  prevTitle: string | null;
}

/** ファイル名から回の番号を読み取るための照合器 */
export interface NoteMatcher {
  regex: RegExp;
}

/** 一覧ノートに追記する1行の情報 */
export interface IndexEntry {
  line: string;
  title: string;
  number: number;
  heading: string;
}

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

const PLACEHOLDER_PATTERN = /\{\{(\w+)(?::([^}]*))?\}\}/g;
const WIKILINK_PATTERN = /\[\[([^\]|#]+)/g;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;
const KANJI_NUMBER_CHARS = "〇一二三四五六七八九十百千";
const KANJI_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const KANJI_UNITS: ReadonlyArray<readonly [number, string]> = [[1000, "千"], [100, "百"], [10, "十"]];
const MAX_KANJI_NUMBER = 9999;
const DAYS_PER_WEEK = 7;
const MONTH_OFFSET = 1;
const PAD_LENGTH = 2;

/** 正規表現の特殊文字をエスケープする */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 1〜9999 の整数を漢数字にする（範囲外は算用数字のまま返す） */
export function toKanjiNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > MAX_KANJI_NUMBER) {
    return String(value);
  }
  let rest = value;
  let result = "";
  for (const [unit, unitChar] of KANJI_UNITS) {
    const count = Math.floor(rest / unit);
    if (count > 0) {
      // 「一十」「一百」とは書かないので，1のときは数字を省く
      result += (count === 1 ? "" : KANJI_DIGITS[count]) + unitChar;
      rest -= count * unit;
    }
  }
  if (rest > 0) {
    result += KANJI_DIGITS[rest];
  }
  return result;
}

/** 漢数字（または算用数字）を整数にする．読めなければ null */
export function fromKanjiNumber(text: string): number | null {
  if (/^\d+$/.test(text)) {
    return Number(text);
  }
  if (text.length === 0) {
    return null;
  }
  let total = 0;
  let current = 0;
  for (const char of text) {
    const digit = KANJI_DIGITS.indexOf(char);
    if (digit >= 0) {
      current = digit;
      continue;
    }
    const unit = KANJI_UNITS.find(([, unitChar]) => unitChar === char);
    if (!unit) {
      return null;
    }
    total += (current === 0 ? 1 : current) * unit[0];
    current = 0;
  }
  return total + current;
}

/** ファイル名の形式から，番号を読み取る照合器を作る．番号の差し込みがなければ null */
export function buildNoteMatcher(format: string): NoteMatcher | null {
  let pattern = "";
  let lastIndex = 0;
  let hasNumberGroup = false;
  for (const match of format.matchAll(PLACEHOLDER_PATTERN)) {
    pattern += escapeRegExp(format.slice(lastIndex, match.index));
    pattern += placeholderToPattern(match[1], !hasNumberGroup);
    if (match[1] === "number" || match[1] === "kanji") {
      hasNumberGroup = true;
    }
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  pattern += escapeRegExp(format.slice(lastIndex));
  if (!hasNumberGroup) {
    return null;
  }
  return { regex: new RegExp(`^${pattern}$`) };
}

/** 差し込みの1つを正規表現の部品にする（番号は最初の1つだけを取り出す） */
function placeholderToPattern(key: string, captureNumber: boolean): string {
  if (key === "number") {
    return captureNumber ? "(?<num>\\d+)" : "\\d+";
  }
  if (key === "kanji") {
    const chars = `[${KANJI_NUMBER_CHARS}]+`;
    return captureNumber ? `(?<num>${chars})` : chars;
  }
  return ".+?";
}

/** ファイル名（拡張子なし）から回の番号を読み取る．形式に合わなければ null */
export function parseNoteNumber(basename: string, matcher: NoteMatcher): number | null {
  const found = matcher.regex.exec(basename);
  const text = found?.groups?.num;
  if (text === undefined) {
    return null;
  }
  return fromKanjiNumber(text);
}

/** 既存のノート名から，次の回の番号を求める（1つもなければ1） */
export function findNextNumber(basenames: string[], matcher: NoteMatcher): number {
  let max = 0;
  for (const name of basenames) {
    const value = parseNoteNumber(name, matcher);
    if (value !== null && value > max) {
      max = value;
    }
  }
  return max + 1;
}

/** 指定した番号より前で，いちばん番号の大きいノート名を返す（なければ null） */
export function findPreviousTitle(basenames: string[], matcher: NoteMatcher, number: number): string | null {
  let best: { name: string; value: number } | null = null;
  for (const name of basenames) {
    const value = parseNoteNumber(name, matcher);
    if (value !== null && value < number && (best === null || value > best.value)) {
      best = { name, value };
    }
  }
  return best?.name ?? null;
}

/** 開催曜日から，作るノートの日付の初期値を決める（今日が開催日なら今日，違えば次の開催日） */
export function computeDefaultDate(today: Date, weekdays: number[]): Date {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (weekdays.length === 0) {
    return base;
  }
  for (let offset = 0; offset < DAYS_PER_WEEK; offset++) {
    const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    if (weekdays.includes(candidate.getDay())) {
      return candidate;
    }
  }
  return base;
}

/** 「YYYY-MM-DD」を日付にする．正しくなければ null */
export function parseIsoDate(text: string): Date | null {
  const found = ISO_DATE_PATTERN.exec(text.trim());
  if (!found) {
    return null;
  }
  const year = Number(found[1]);
  const month = Number(found[2]) - MONTH_OFFSET;
  const day = Number(found[3]);
  const date = new Date(year, month, day);
  // 2月30日のような存在しない日付は弾く
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** 日付を「YYYY-MM-DD」にする（日付入力欄の値に使う） */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + MONTH_OFFSET).padStart(PAD_LENGTH, "0");
  const day = String(date.getDate()).padStart(PAD_LENGTH, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** テンプレートの差し込み（{{number}} など）を値に置き換える．知らない差し込みはそのまま残す */
export function renderTemplate(template: string, context: TemplateContext, formatDate: DateFormatter): string {
  return template.replace(PLACEHOLDER_PATTERN, (whole: string, key: string, argument?: string) => {
    switch (key) {
      case "number":
        return String(context.number);
      case "kanji":
        return toKanjiNumber(context.number);
      case "date":
        return formatDate(context.date, argument && argument.length > 0 ? argument : DEFAULT_DATE_FORMAT);
      case "title":
        return context.title;
      case "prev":
        return context.prevTitle ?? "";
      case "prevLink":
        return context.prevTitle ? `[[${context.prevTitle}]]` : "";
      default:
        return whole;
    }
  });
}

/** ファイル名の形式からファイル名（拡張子なし）を作る．使えない文字は「_」にする */
export function renderFileName(format: string, number: number, date: Date, formatDate: DateFormatter): string {
  const context: TemplateContext = { number, date, title: "", prevTitle: null };
  const name = renderTemplate(format, context, formatDate).replace(INVALID_FILE_NAME_CHARS, "_").trim();
  return name.length > 0 ? name : String(number);
}

/** 一覧ノートの本文に，新しい回の行を番号順の位置へ足す．すでにリンクがあれば何もしない */
export function insertIndexEntry(content: string, entry: IndexEntry, matcher: NoteMatcher): string {
  if (content.includes(`[[${entry.title}]]`)) {
    return content;
  }
  const lines = content.split("\n");
  const listed = findListedEntries(lines, matcher);
  if (listed.length > 0) {
    const before = listed.filter((item) => item.number < entry.number);
    const insertAt = before.length > 0 ? Math.max(...before.map((item) => item.index)) + 1 : listed[0].index;
    lines.splice(insertAt, 0, entry.line);
    return lines.join("\n");
  }
  const headingIndex = entry.heading.trim().length > 0
    ? lines.findIndex((line) => line.trim() === entry.heading.trim())
    : -1;
  if (headingIndex >= 0) {
    lines.splice(headingIndex + 1, 0, entry.line);
    return lines.join("\n");
  }
  return appendLine(content, entry.line);
}

/** 本文の各行から，形式に合うノートへのリンクを含む行と，その番号を集める */
function findListedEntries(lines: string[], matcher: NoteMatcher): Array<{ index: number; number: number }> {
  const result: Array<{ index: number; number: number }> = [];
  lines.forEach((line, index) => {
    for (const link of line.matchAll(WIKILINK_PATTERN)) {
      const basename = link[1].split("/").pop() ?? "";
      const value = parseNoteNumber(basename.trim(), matcher);
      if (value !== null) {
        result.push({ index, number: value });
        return;
      }
    }
  });
  return result;
}

/** 本文の末尾に1行足す */
function appendLine(content: string, line: string): string {
  if (content.length === 0) {
    return `${line}\n`;
  }
  return content.endsWith("\n") ? `${content}${line}\n` : `${content}\n${line}\n`;
}
