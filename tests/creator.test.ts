import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionNote, InvalidFormatError, planDefaults, planSession } from "../src/creator.ts";
import type { SessionNoteSettings } from "../src/settings.ts";
import { BUILTIN_TEMPLATE, DEFAULT_SETTINGS, mergeSettings } from "../src/settings.ts";
import { day, formatDate, MemoryVault } from "./helpers.ts";

const SETTINGS: SessionNoteSettings = {
  ...DEFAULT_SETTINGS,
  folder: "200_勉強/ゼミ",
  fileNameFormat: "第{{number}}回輪講_{{date:M_DD}}",
  templatePath: "900_テンプレート/輪講テンプレート",
  weekdays: [2, 5],
  indexNotePath: "200_勉強/輪講.md",
  indexHeading: "## 輪講ノート一覧",
};

const TEMPLATE = "---\n回: 第{{number}}回\n作成日: {{date:YYYY-MM-DD}}\n---\n\n# 第{{kanji}}回輪講（{{date:YYYY/MM/DD}}）\n\n---\n- 前回: {{prevLink}}\n";

/** 第1〜8回がある保管庫を作る */
function makeVault(): MemoryVault {
  return new MemoryVault({
    "200_勉強/ゼミ/第1回輪講_9_18.md": "",
    "200_勉強/ゼミ/第7回輪講_10_09.md": "",
    "200_勉強/ゼミ/第8回輪講_10_13.md": "",
    "200_勉強/ゼミ/解説・質問/坂泰河/1.6.4-1.8_TaigaBan_解説・質問.md": "",
    "200_勉強/輪講.md": "## 輪講ノート一覧\n- [[第1回輪講_9_18]]（2026/09/18）\n- [[第7回輪講_10_09]]（2026/10/09）\n- [[第8回輪講_10_13]]（2026/10/13）\n\n## 関連\n",
    "900_テンプレート/輪講テンプレート.md": TEMPLATE,
  });
}

test("初期値は次の番号と次の開催日", () => {
  const defaults = planDefaults(SETTINGS, makeVault(), day(2026, 10, 14));
  assert.equal(defaults.number, 9);
  assert.deepEqual(defaults.date, day(2026, 10, 16));
});

test("テンプレートからノートを作り，一覧に追記する", async () => {
  const vault = makeVault();
  const plan = planSession(SETTINGS, vault, 9, day(2026, 10, 16), formatDate);
  assert.equal(plan.path, "200_勉強/ゼミ/第9回輪講_10_16.md");
  assert.equal(plan.prevTitle, "第8回輪講_10_13");
  assert.equal(plan.exists, false);
  const result = await createSessionNote(plan, SETTINGS, vault, formatDate);
  assert.deepEqual(result, { path: plan.path, created: true, indexUpdated: true, warnings: [] });
  assert.equal(
    vault.files.get(plan.path),
    "---\n回: 第9回\n作成日: 2026-10-16\n---\n\n# 第九回輪講（2026/10/16）\n\n---\n- 前回: [[第8回輪講_10_13]]\n",
  );
  const index = vault.files.get("200_勉強/輪講.md") ?? "";
  assert.ok(index.includes("- [[第8回輪講_10_13]]（2026/10/13）\n- [[第9回輪講_10_16]]（2026/10/16）\n"));
});

test("すでにあるノートは作り直さない", async () => {
  const vault = makeVault();
  const plan = planSession(SETTINGS, vault, 8, day(2026, 10, 13), formatDate);
  assert.equal(plan.exists, true);
  const result = await createSessionNote(plan, SETTINGS, vault, formatDate);
  assert.equal(result.created, false);
  assert.equal(vault.files.get(plan.path), "");
});

test("テンプレートや一覧ノートがなくても作れる", async () => {
  const vault = new MemoryVault({});
  const settings = { ...SETTINGS, folder: "", templatePath: "なし", indexNotePath: "なし" };
  const plan = planSession(settings, vault, 1, day(2026, 9, 18), formatDate);
  const result = await createSessionNote(plan, settings, vault, formatDate);
  assert.equal(plan.path, "第1回輪講_9_18.md");
  assert.deepEqual(result.warnings, ["templateMissing", "indexMissing"]);
  assert.ok((vault.files.get(plan.path) ?? "").startsWith("---\n回: 第1回\n"));
  assert.ok(BUILTIN_TEMPLATE.includes("{{prevLink}}"));
});

test("番号の差し込みがない形式はエラー", () => {
  assert.throws(() => planDefaults({ ...SETTINGS, fileNameFormat: "輪講_{{date}}" }, makeVault(), day(2026, 10, 14)), InvalidFormatError);
});

test("保存されていた設定を補って読む", () => {
  const merged = mergeSettings({ folder: "a", weekdays: [2, 9, "x"] });
  assert.equal(merged.folder, "a");
  assert.deepEqual(merged.weekdays, [2]);
  assert.equal(merged.fileNameFormat, DEFAULT_SETTINGS.fileNameFormat);
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
});
