# Numbered Session Notes

Create the next numbered session note — a seminar, study group, or meeting log such as `第9回輪講_10_16` — from a template with one click in the ribbon.

[日本語の説明は下にあります](#日本語)

## Features

- **One click**: a ribbon button (calendar icon) opens a small dialog with the next number and date already filled in.
- **Next number**: counts the notes directly in your folder that match the file name format and suggests the next one.
- **Next session day**: set your session weekdays (for example Tuesday and Friday) and the date defaults to the next session day.
- **Your template**: use any note as the template. Placeholders such as `{{number}}`, `{{kanji}}`, `{{date:YYYY/MM/DD}}`, and `{{prevLink}}` are filled in.
- **Index note**: optionally adds a link to the new note in your index note, in number order.
- If the note already exists, it is opened instead of being overwritten.

## Usage

1. Click the calendar icon in the left ribbon, or run **Create next session note…** from the command palette.
2. Check the number and date, then press **Create**.
3. **Create next session note now** creates the note with the default number and date, without the dialog.

## Settings

| Setting | Description |
|---|---|
| Folder | Where notes are created. Numbers are counted from notes directly in this folder. |
| File name format | Must contain `{{number}}` or `{{kanji}}`. Example: `Session {{number}} {{date:YYYY-MM-DD}}` |
| Template note | Leave empty to use the built-in template. |
| Session weekdays | The default date becomes the first session day from today. |
| Open in a new tab | Otherwise the note opens in the current tab. |
| Index note / Heading / Line format | Adds a line such as `- [[{{title}}]]（{{date:YYYY/MM/DD}}）` to the index note. |

### Placeholders

| Placeholder | Value |
|---|---|
| `{{number}}` | Session number, e.g. `9` |
| `{{kanji}}` | Session number in kanji numerals, e.g. `九` |
| `{{date}}`, `{{date:format}}` | Date in [moment.js format](https://momentjs.com/docs/#/displaying/format/), default `YYYY-MM-DD` |
| `{{title}}` | Name of the new note |
| `{{prev}}`, `{{prevLink}}` | Name of the previous note, and a link to it (empty if none) |

Unknown placeholders are left as they are, so they do not conflict with other template plugins.

## Installation

Until the plugin is available in Community plugins, copy `main.js`, `manifest.json`, and `styles.css` from the latest release into `<your vault>/.obsidian/plugins/numbered-session-notes/`, then enable **Numbered Session Notes** in **Settings → Community plugins**.

## Development

```bash
npm install
npm run dev     # watch and rebuild main.js
npm run build   # type check and production build
npm test        # unit tests (Node.js 22 or later)
npm run lint    # eslint-plugin-obsidianmd
```

The plugin does not use the network and only reads and writes notes in your vault.

---

## 日本語

ゼミの輪講や勉強会，定例会議のように回を重ねるノート（例：`第9回輪講_10_16`）を，リボンのボタン1つでテンプレートから作るプラグインです．

### できること

- 左のリボンのカレンダーのボタンを押すと，次の回の番号と日付が入った小さな画面が開く．
- フォルダの中の既存のノートから，次の番号を数える．
- 開催曜日（例：火曜と金曜）を設定すると，日付の初期値が次の開催日になる．
- 好きなノートをテンプレートにできる．`{{number}}`，`{{kanji}}`（漢数字），`{{date:YYYY/MM/DD}}`，`{{prevLink}}`（前の回へのリンク）などを差し込む．
- 一覧ノートに，新しい回へのリンクを番号順の位置に書き足せる．
- 同じ名前のノートがすでにあれば，上書きせずに開く．

### 設定の例（輪講）

| 設定 | 値 |
|---|---|
| 保存先フォルダ | `200_勉強/ゼミ` |
| ファイル名の形式 | `第{{number}}回輪講_{{date:M_DD}}` |
| テンプレートのノート | `900_テンプレート/輪講テンプレート` |
| 開催曜日 | 火，金 |
| 一覧ノート | `200_勉強/輪講` |
| 見出し | `## 輪講ノート一覧` |
| 追記する行の形式 | `- [[{{title}}]]（{{date:YYYY/MM/DD}}）` |

テンプレートの例：

```markdown
---
回: 第{{number}}回
作成日: {{date:YYYY-MM-DD}}
---

# 第{{kanji}}回輪講（{{date:YYYY/MM/DD}}）

・memo

---
- 前回: {{prevLink}}
```

## License

[MIT](LICENSE)
