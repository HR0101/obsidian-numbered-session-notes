# 公開の手順（Obsidian コミュニティプラグイン）

状態：公開の直前まで準備済み（2026-10-13）．GitHub への push と申請はまだしていない．

## 準備できているもの

- [x] `manifest.json`（id `numbered-session-notes`，名前，英語の説明，`minAppVersion` 1.8.7，`isDesktopOnly: false`）
- [x] `versions.json` と `version-bump.mjs`（`npm version patch` などで manifest と versions を自動でそろえる）
- [x] `README.md`（英語＋日本語），`LICENSE`（MIT）
- [x] リリース用の GitHub Actions（`.github/workflows/release.yml`）：タグを push すると，テストとビルドをしてから，下書きのリリースに `main.js`，`manifest.json`，`styles.css` を付ける
- [x] テスト14件（`npm test`），型検査とビルド（`npm run build`），`eslint-plugin-obsidianmd`（`npm run lint`：エラー0，警告1）
- [x] id と名前が，コミュニティプラグインの一覧（2026-10-13 時点で8802件）のどれとも重ならないことを確認
- [x] 審査で見られる点：既定のホットキーなし，コマンド名にプラグイン名なし，設定の見出しは `setHeading()`，`innerHTML` を使わない，`normalizePath`・`Vault.process` を使う，ネットワークを使わない
- [x] 自分の保管庫に入れて使用中（`.obsidian/plugins/numbered-session-notes/`）

## 残りの手順

公式の手順（[Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)）が変わっていることがあるので，始める前に確かめる．

1. GitHub に公開リポジトリを作る（例：`HR0101/obsidian-numbered-session-notes`）．
2. push する．
   ```bash
   git remote add origin git@github.com:HR0101/obsidian-numbered-session-notes.git
   git push -u origin main
   ```
3. 版のタグを push する（`v` を付けず，manifest の版と同じにする）．
   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```
4. Actions が作った下書きのリリースを GitHub で確かめて，Publish する．
5. `obsidianmd/obsidian-releases` をフォークし，`community-plugins.json` の末尾に次を足してプルリクエストを出す．テンプレートのチェックリストにも答える．
   ```json
   {
     "id": "numbered-session-notes",
     "name": "Numbered Session Notes",
     "author": "HR0101",
     "description": "Create the next numbered session note, such as a seminar or meeting log, from a template with one click in the ribbon.",
     "repo": "HR0101/obsidian-numbered-session-notes"
   }
   ```
6. 自動レビューやレビュアーの指摘に対応する．直したら版を上げて（`npm version patch`）タグを push し，リリースし直す．

## 公開前に見直すとよいこと

- `manifest.json` の `author`，`authorUrl` と `LICENSE` の名前（今は GitHub のユーザー名 `HR0101`）．
- lint の警告1件：`PluginSettingTab` の `getSettingDefinitions()`（Obsidian 1.13 以降の設定検索に載る，宣言的な設定 API）．対応は任意．対応するなら，1.13 未満向けの `display()` も残す．
- README にスクリーンショットか GIF を足す．
- 英語の README と説明文の表現．

## 版を上げるとき

```bash
npm version patch   # 1.0.0 → 1.0.1．manifest.json と versions.json も更新される
git push && git push --tags
```
