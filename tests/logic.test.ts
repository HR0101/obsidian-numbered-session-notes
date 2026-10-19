import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNoteMatcher,
  computeDefaultDate,
  findNextNumber,
  findPreviousTitle,
  fromKanjiNumber,
  insertIndexEntry,
  parseIsoDate,
  parseNoteNumber,
  renderFileName,
  renderTemplate,
  toIsoDate,
  toKanjiNumber,
} from "../src/logic.ts";
import { day, formatDate } from "./helpers.ts";

const RINKOU_FORMAT = "第{{number}}回輪講_{{date:M_DD}}";
const EXISTING = [
  "第1回輪講_9_18", "第2回輪講_9_22", "第3回輪講_9_25", "第4回輪講_9_29",
  "第5回輪講_10_02", "第6回輪講_10_06", "第7回輪講_10_09", "第8回輪講_10_13",
];

test("漢数字に変換する", () => {
  assert.equal(toKanjiNumber(1), "一");
  assert.equal(toKanjiNumber(8), "八");
  assert.equal(toKanjiNumber(10), "十");
  assert.equal(toKanjiNumber(11), "十一");
  assert.equal(toKanjiNumber(20), "二十");
  assert.equal(toKanjiNumber(105), "百五");
  assert.equal(toKanjiNumber(1234), "千二百三十四");
  assert.equal(toKanjiNumber(0), "0");
  assert.equal(toKanjiNumber(10000), "10000");
});

test("漢数字を数に戻す", () => {
  for (const value of [1, 8, 10, 11, 20, 99, 105, 1234, 9999]) {
    assert.equal(fromKanjiNumber(toKanjiNumber(value)), value);
  }
  assert.equal(fromKanjiNumber("12"), 12);
  assert.equal(fromKanjiNumber("x"), null);
  assert.equal(fromKanjiNumber(""), null);
});

test("ファイル名の形式から番号を読む", () => {
  const matcher = buildNoteMatcher(RINKOU_FORMAT);
  assert.ok(matcher);
  assert.equal(parseNoteNumber("第8回輪講_10_13", matcher), 8);
  assert.equal(parseNoteNumber("第12回輪講_1_06", matcher), 12);
  assert.equal(parseNoteNumber("輪講", matcher), null);
  assert.equal(parseNoteNumber("第8回輪講_10_13.md.bak", matcher), 8, "形式の後ろは日付として何でも合う");
  const kanji = buildNoteMatcher("第{{kanji}}回");
  assert.ok(kanji);
  assert.equal(parseNoteNumber("第十二回", kanji), 12);
  assert.equal(buildNoteMatcher("輪講_{{date}}"), null);
});

test("次の番号と前の回を求める", () => {
  const matcher = buildNoteMatcher(RINKOU_FORMAT);
  assert.ok(matcher);
  assert.equal(findNextNumber(EXISTING, matcher), 9);
  assert.equal(findNextNumber(["輪講"], matcher), 1);
  assert.equal(findPreviousTitle(EXISTING, matcher, 9), "第8回輪講_10_13");
  assert.equal(findPreviousTitle(EXISTING.filter((name) => !name.startsWith("第7回")), matcher, 8), "第6回輪講_10_06");
  assert.equal(findPreviousTitle(EXISTING, matcher, 1), null);
});

test("開催曜日から日付の初期値を決める", () => {
  const tuesdayFriday = [2, 5];
  assert.deepEqual(computeDefaultDate(day(2026, 10, 13), tuesdayFriday), day(2026, 10, 13), "火曜はその日");
  assert.deepEqual(computeDefaultDate(day(2026, 10, 14), tuesdayFriday), day(2026, 10, 16), "水曜は金曜へ");
  assert.deepEqual(computeDefaultDate(day(2026, 10, 17), tuesdayFriday), day(2026, 10, 20), "土曜は次の火曜へ");
  assert.deepEqual(computeDefaultDate(day(2026, 12, 30), [2]), day(2027, 1, 5), "年をまたぐ");
  assert.deepEqual(computeDefaultDate(day(2026, 10, 14), []), day(2026, 10, 14), "曜日なしは今日");
});

test("日付の入力を読む", () => {
  assert.deepEqual(parseIsoDate("2026-10-16"), day(2026, 10, 16));
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(parseIsoDate("10/16"), null);
  assert.equal(toIsoDate(day(2026, 1, 5)), "2026-01-05");
});

test("テンプレートとファイル名を作る", () => {
  const template = "回: 第{{number}}回\n# 第{{kanji}}回輪講（{{date:YYYY/MM/DD}}）\n作成日: {{date}}\n前回: {{prevLink}}\n{{time}}";
  const rendered = renderTemplate(template, {
    number: 9,
    date: day(2026, 10, 16),
    title: "第9回輪講_10_16",
    prevTitle: "第8回輪講_10_13",
  }, formatDate);
  assert.equal(rendered, "回: 第9回\n# 第九回輪講（2026/10/16）\n作成日: 2026-10-16\n前回: [[第8回輪講_10_13]]\n{{time}}");
  const first = renderTemplate("前回: {{prevLink}}", { number: 1, date: day(2026, 9, 18), title: "", prevTitle: null }, formatDate);
  assert.equal(first, "前回: ");
  assert.equal(renderFileName(RINKOU_FORMAT, 9, day(2026, 10, 16), formatDate), "第9回輪講_10_16");
  assert.equal(renderFileName(RINKOU_FORMAT, 5, day(2026, 10, 2), formatDate), "第5回輪講_10_02");
  assert.equal(renderFileName("第{{number}}回 {{date:M/D}}", 3, day(2026, 9, 25), formatDate), "第3回 9_25");
});

test("一覧ノートに番号順で追記する", () => {
  const matcher = buildNoteMatcher(RINKOU_FORMAT);
  assert.ok(matcher);
  const content = [
    "# 輪講",
    "## 輪講ノート一覧",
    "- [[第1回輪講_9_18]]（2026/09/18）",
    "- [[第8回輪講_10_13]]（2026/10/13）",
    "",
    "## 解説・質問",
    "| [[1.6.4-1.8_TaigaBan_解説・質問]] |",
  ].join("\n");
  const entry = { line: "- [[第9回輪講_10_16]]（2026/10/16）", title: "第9回輪講_10_16", number: 9, heading: "## 輪講ノート一覧" };
  const added = insertIndexEntry(content, entry, matcher);
  assert.equal(added.split("\n")[4], entry.line, "第8回の次の行に入る");
  assert.equal(insertIndexEntry(added, entry, matcher), added, "2回目は何もしない");
  const middle = insertIndexEntry(content, { ...entry, line: "- [[第5回輪講_10_02]]", title: "第5回輪講_10_02", number: 5 }, matcher);
  assert.equal(middle.split("\n")[3], "- [[第5回輪講_10_02]]", "第1回と第8回の間に入る");
  const empty = insertIndexEntry("# 輪講\n## 輪講ノート一覧\n\n## 関連", entry, matcher);
  assert.equal(empty.split("\n")[2], entry.line, "見出しの直後に入る");
  assert.equal(insertIndexEntry("# 一覧", { ...entry, heading: "" }, matcher), `# 一覧\n${entry.line}\n`, "見出しがなければ末尾");
});
