// プラグインの本体：リボンのボタン，コマンド，作成ダイアログ，設定画面

import type { App, ButtonComponent, TAbstractFile } from "obsidian";
import {
  AbstractInputSuggest,
  Modal,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  moment,
} from "obsidian";
import type { CreateResult, SessionPlan, VaultPort } from "./creator.ts";
import { createSessionNote, InvalidFormatError, planDefaults, planSession } from "./creator.ts";
import { getStrings } from "./i18n.ts";
import type { DateFormatter } from "./logic.ts";
import { buildNoteMatcher, parseIsoDate, toIsoDate } from "./logic.ts";
import type { SessionNoteSettings } from "./settings.ts";
import { mergeSettings, WEEKDAY_COUNT } from "./settings.ts";

const RIBBON_ICON = "calendar-plus";
const MAX_SUGGESTIONS = 50;
const CSS_PREFIX = "numbered-session-notes";

/** moment で日付を書式に従って文字列にする */
const formatWithMoment: DateFormatter = (date, format) => moment(date).format(format);

/** Obsidian の保管庫を VaultPort として使うための橋渡し */
class ObsidianVaultPort implements VaultPort {
  private readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  listMarkdownBasenames(folderPath: string): string[] {
    const folder = folderPath.trim().length > 0
      ? this.app.vault.getAbstractFileByPath(normalizePath(folderPath))
      : this.app.vault.getRoot();
    if (!(folder instanceof TFolder)) {
      return [];
    }
    return folder.children
      .filter((child): child is TFile => child instanceof TFile && child.extension === "md")
      .map((file) => file.basename);
  }

  exists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async read(path: string): Promise<string> {
    return this.app.vault.cachedRead(this.getFile(path));
  }

  async create(path: string, content: string): Promise<void> {
    await this.app.vault.create(normalizePath(path), content);
  }

  async process(path: string, update: (content: string) => string): Promise<void> {
    await this.app.vault.process(this.getFile(path), update);
  }

  async ensureFolder(path: string): Promise<void> {
    if (path.trim().length === 0) {
      return;
    }
    const normalized = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder) {
      return;
    }
    await this.app.vault.createFolder(normalized);
  }

  /** パスのノートを取り出す（なければエラー） */
  private getFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  }
}

export default class NumberedSessionNotesPlugin extends Plugin {
  settings: SessionNoteSettings = mergeSettings(null);
  private vaultPort: VaultPort = new ObsidianVaultPort(this.app);

  async onload(): Promise<void> {
    await this.loadSettings();
    const strings = getStrings();
    this.addRibbonIcon(RIBBON_ICON, strings.ribbonTooltip, () => {
      this.openCreateModal();
    });
    this.addCommand({
      id: "create-next-note",
      name: strings.commandCreate,
      callback: () => this.openCreateModal(),
    });
    this.addCommand({
      id: "create-next-note-now",
      name: strings.commandCreateNow,
      callback: () => {
        void this.createWithDefaults();
      },
    });
    this.addSettingTab(new SessionSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 番号と日付を確かめるダイアログを開く */
  openCreateModal(): void {
    const defaults = this.safePlanDefaults();
    if (!defaults) {
      return;
    }
    new CreateSessionModal(this.app, this, defaults.number, defaults.date).open();
  }

  /** ダイアログを出さずに，初期値のまま作る */
  async createWithDefaults(): Promise<void> {
    const defaults = this.safePlanDefaults();
    if (!defaults) {
      return;
    }
    await this.createAndOpen(defaults.number, defaults.date);
  }

  /** 番号と日付からノートの計画を立てる（ダイアログのプレビューにも使う） */
  plan(number: number, date: Date): SessionPlan {
    return planSession(this.settings, this.vaultPort, number, date, formatWithMoment);
  }

  /** ノートを作って（すでにあればそのまま）開き，結果を知らせる */
  async createAndOpen(number: number, date: Date): Promise<void> {
    const strings = getStrings();
    try {
      const plan = this.plan(number, date);
      const result = await createSessionNote(plan, this.settings, this.vaultPort, formatWithMoment);
      await this.openNote(result.path);
      this.notifyResult(result, plan);
    } catch (error) {
      this.notifyError(error);
      console.error(`[${this.manifest.id}] ${strings.errorCreate}`, error);
    }
  }

  /** 初期値を求める．形式の誤りなどは知らせて null を返す */
  private safePlanDefaults(): { number: number; date: Date } | null {
    try {
      return planDefaults(this.settings, this.vaultPort, new Date());
    } catch (error) {
      this.notifyError(error);
      return null;
    }
  }

  private async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(this.settings.openInNewTab ? "tab" : false).openFile(file);
    }
  }

  private notifyResult(result: CreateResult, plan: SessionPlan): void {
    const strings = getStrings();
    const messages = [result.created ? `${strings.noticeCreated}${plan.title}` : `${strings.noticeOpened}${plan.title}`];
    if (result.indexUpdated) {
      messages.push(strings.noticeIndexUpdated);
    }
    if (result.warnings.includes("templateMissing")) {
      messages.push(strings.warnTemplateMissing);
    }
    if (result.warnings.includes("indexMissing")) {
      messages.push(strings.warnIndexMissing);
    }
    new Notice(messages.join("\n"));
  }

  private notifyError(error: unknown): void {
    const strings = getStrings();
    if (error instanceof InvalidFormatError) {
      new Notice(strings.errorFormat);
      return;
    }
    const detail = error instanceof Error ? error.message : String(error);
    new Notice(`${strings.errorCreate}${detail}`);
  }
}

/** 回と日付を確かめてからノートを作るダイアログ */
class CreateSessionModal extends Modal {
  private readonly plugin: NumberedSessionNotesPlugin;
  private numberText: string;
  private dateText: string;
  private previewEl: HTMLElement | null = null;
  private submitButton: ButtonComponent | null = null;

  constructor(app: App, plugin: NumberedSessionNotesPlugin, number: number, date: Date) {
    super(app);
    this.plugin = plugin;
    this.numberText = String(number);
    this.dateText = toIsoDate(date);
  }

  onOpen(): void {
    const strings = getStrings();
    this.setTitle(strings.modalTitle);
    const { contentEl } = this;
    new Setting(contentEl)
      .setName(strings.modalNumber)
      .setDesc(strings.modalNumberDesc)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.setValue(this.numberText).onChange((value) => {
          this.numberText = value;
          this.refreshPreview();
        });
      });
    new Setting(contentEl)
      .setName(strings.modalDate)
      .setDesc(strings.modalDateDesc)
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.dateText).onChange((value) => {
          this.dateText = value;
          this.refreshPreview();
        });
      });
    this.previewEl = contentEl.createDiv({ cls: `${CSS_PREFIX}-preview` });
    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(strings.modalCancel).onClick(() => this.close());
      })
      .addButton((button) => {
        this.submitButton = button;
        button.setButtonText(strings.modalCreate).setCta().onClick(() => {
          void this.submit();
        });
      });
    this.scope.register([], "Enter", (event) => {
      event.preventDefault();
      void this.submit();
      return false;
    });
    this.refreshPreview();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** 入力から番号と日付を読む．正しくなければ理由を返す */
  private readInput(): { number: number; date: Date } | { error: string } {
    const strings = getStrings();
    const number = Number(this.numberText);
    if (!Number.isInteger(number) || number < 1) {
      return { error: strings.invalidNumber };
    }
    const date = parseIsoDate(this.dateText);
    if (!date) {
      return { error: strings.invalidDate };
    }
    return { number, date };
  }

  /** 作るノートの名前と，すでにあるかどうかを表示する */
  private refreshPreview(): void {
    if (!this.previewEl) {
      return;
    }
    const strings = getStrings();
    const input = this.readInput();
    this.previewEl.empty();
    if ("error" in input) {
      this.previewEl.setText(input.error);
      this.previewEl.addClass(`${CSS_PREFIX}-error`);
      this.submitButton?.setDisabled(true);
      return;
    }
    this.previewEl.removeClass(`${CSS_PREFIX}-error`);
    this.submitButton?.setDisabled(false);
    try {
      const plan = this.plugin.plan(input.number, input.date);
      this.previewEl.createSpan({ text: `${strings.modalPreview}：` });
      this.previewEl.createEl("code", { text: plan.path });
      if (plan.exists) {
        this.previewEl.createSpan({ text: strings.modalExists });
      }
      this.submitButton?.setButtonText(plan.exists ? strings.modalOpen : strings.modalCreate);
    } catch (error) {
      this.previewEl.setText(error instanceof InvalidFormatError ? strings.errorFormat : String(error));
      this.previewEl.addClass(`${CSS_PREFIX}-error`);
      this.submitButton?.setDisabled(true);
    }
  }

  private async submit(): Promise<void> {
    const input = this.readInput();
    if ("error" in input) {
      new Notice(input.error);
      return;
    }
    this.close();
    await this.plugin.createAndOpen(input.number, input.date);
  }
}

/** 入力欄にフォルダやノートのパスの候補を出す */
class PathSuggest extends AbstractInputSuggest<string> {
  private readonly kind: "folder" | "file";

  constructor(app: App, inputEl: HTMLInputElement, kind: "folder" | "file", onPick: (value: string) => void) {
    super(app, inputEl);
    this.kind = kind;
    this.onSelect((value) => {
      this.setValue(value);
      onPick(value);
      this.close();
    });
  }

  protected getSuggestions(query: string): string[] {
    const lowered = query.toLowerCase();
    return this.app.vault.getAllLoadedFiles()
      .filter((file: TAbstractFile) => this.matchesKind(file))
      .map((file) => (file instanceof TFile ? file.path.replace(/\.md$/, "") : file.path))
      .filter((path) => path.length > 0 && path.toLowerCase().includes(lowered))
      .slice(0, MAX_SUGGESTIONS);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  private matchesKind(file: TAbstractFile): boolean {
    return this.kind === "folder" ? file instanceof TFolder : file instanceof TFile && file.extension === "md";
  }
}

/** 設定画面 */
class SessionSettingTab extends PluginSettingTab {
  private readonly plugin: NumberedSessionNotesPlugin;

  constructor(app: App, plugin: NumberedSessionNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.displayCreateSettings(containerEl);
    this.displayIndexSettings(containerEl);
    this.displayPlaceholderHelp(containerEl);
  }

  private displayCreateSettings(containerEl: HTMLElement): void {
    const strings = getStrings();
    new Setting(containerEl).setName(strings.headingCreate).setHeading();
    this.addPathSetting(containerEl, strings.settingFolder, strings.settingFolderDesc, "folder", "folder");
    const formatSetting = new Setting(containerEl)
      .setName(strings.settingFileName)
      .setDesc(strings.settingFileNameDesc);
    formatSetting.addText((text) => {
      text.setValue(this.plugin.settings.fileNameFormat).onChange(async (value) => {
        this.plugin.settings.fileNameFormat = value;
        await this.plugin.saveSettings();
        const valid = buildNoteMatcher(value) !== null;
        formatSetting.setDesc(valid ? strings.settingFileNameDesc : strings.errorFormat);
        formatSetting.descEl.toggleClass(`${CSS_PREFIX}-error`, !valid);
      });
      text.inputEl.addClass(`${CSS_PREFIX}-wide`);
    });
    this.addPathSetting(containerEl, strings.settingTemplate, strings.settingTemplateDesc, "templatePath", "file");
    this.addWeekdaySetting(containerEl);
    new Setting(containerEl)
      .setName(strings.settingNewTab)
      .setDesc(strings.settingNewTabDesc)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.openInNewTab).onChange(async (value) => {
          this.plugin.settings.openInNewTab = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private displayIndexSettings(containerEl: HTMLElement): void {
    const strings = getStrings();
    new Setting(containerEl).setName(strings.headingIndex).setHeading();
    this.addPathSetting(containerEl, strings.settingIndexNote, strings.settingIndexNoteDesc, "indexNotePath", "file");
    this.addTextSetting(containerEl, strings.settingIndexHeading, strings.settingIndexHeadingDesc, "indexHeading");
    this.addTextSetting(containerEl, strings.settingIndexLine, "", "indexLineFormat");
  }

  private displayPlaceholderHelp(containerEl: HTMLElement): void {
    const strings = getStrings();
    new Setting(containerEl).setName(strings.headingPlaceholders).setHeading();
    const list = containerEl.createEl("ul", { cls: `${CSS_PREFIX}-help` });
    for (const item of strings.placeholderHelp) {
      list.createEl("li", { text: item });
    }
  }

  /** パスを入れる欄（候補つき）を足す */
  private addPathSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: "folder" | "templatePath" | "indexNotePath",
    kind: "folder" | "file",
  ): void {
    new Setting(containerEl).setName(name).setDesc(desc).addText((text) => {
      const save = async (value: string): Promise<void> => {
        this.plugin.settings[key] = value.trim();
        await this.plugin.saveSettings();
      };
      text.setValue(this.plugin.settings[key]).onChange(save);
      new PathSuggest(this.app, text.inputEl, kind, (value) => {
        void save(value);
      });
    });
  }

  /** 文字を入れる欄を足す */
  private addTextSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: "indexHeading" | "indexLineFormat",
  ): void {
    new Setting(containerEl).setName(name).setDesc(desc).addText((text) => {
      text.setValue(this.plugin.settings[key]).onChange(async (value) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
      });
      text.inputEl.addClass(`${CSS_PREFIX}-wide`);
    });
  }

  /** 開催曜日のチェックボックスを足す */
  private addWeekdaySetting(containerEl: HTMLElement): void {
    const strings = getStrings();
    const setting = new Setting(containerEl).setName(strings.settingWeekdays).setDesc(strings.settingWeekdaysDesc);
    const group = setting.controlEl.createDiv({ cls: `${CSS_PREFIX}-weekdays` });
    for (let day = 0; day < WEEKDAY_COUNT; day++) {
      const label = group.createEl("label", { cls: `${CSS_PREFIX}-weekday` });
      const checkbox = label.createEl("input", { type: "checkbox" });
      checkbox.checked = this.plugin.settings.weekdays.includes(day);
      label.appendText(strings.weekdayNames[day]);
      // 設定画面を閉じると要素ごと捨てられるので，ここは addEventListener でよい
      checkbox.addEventListener("change", () => {
        void this.toggleWeekday(day, checkbox.checked);
      });
    }
  }

  private async toggleWeekday(day: number, checked: boolean): Promise<void> {
    const days = new Set(this.plugin.settings.weekdays);
    if (checked) {
      days.add(day);
    } else {
      days.delete(day);
    }
    this.plugin.settings.weekdays = Array.from(days).sort((a, b) => a - b);
    await this.plugin.saveSettings();
  }
}
