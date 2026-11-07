import {
  App, Component, MarkdownRenderer, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder,
  finishRenderMath, normalizePath,
} from "obsidian";
import { exportPdf } from "./exporter";
import { injectMath, preprocessMath } from "./math";
import { renderRemainingMermaid } from "./mermaid";
import { computeGeometry, DEFAULT_OPTIONS, ExportOptions, MM_TO_PX, PaperName } from "./options";

interface PluginSettings {
  opts: ExportOptions;
  outputFolder: string; // "" = next to the note
  openAfterExport: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
  opts: { ...DEFAULT_OPTIONS },
  outputFolder: "",
  openAfterExport: true,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function splitFrontmatter(text: string): { body: string; meta: Record<string, string> } {
  const m = text.match(/^---\s*\n([\s\S]*?\n)---\s*\n?/);
  const meta: Record<string, string> = {};
  if (!m) return { body: text, meta };
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0 && !line.trim().startsWith("#")) {
      meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return { body: text.slice(m[0].length), meta };
}

export default class MdExportUpscPlugin extends Plugin {
  settings!: PluginSettings;
  private busy = false;

  async onload() {
    const saved = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS, ...(saved ?? {}),
      opts: { ...DEFAULT_OPTIONS, ...(saved?.opts ?? {}) },
    };

    this.addRibbonIcon("printer", "print UPSC - MD to PDF", () => this.openForActive());
    this.addCommand({
      id: "print-upsc-md-to-pdf",
      name: "print UPSC - MD to PDF",
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) new ExportModal(this.app, this, f).open();
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && file.extension === "md") {
        menu.addItem((i) =>
          i.setTitle("print UPSC - MD to PDF")
            .setIcon("printer")
            .onClick(() => new ExportModal(this.app, this, file).open())
        );
      }
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, _editor, view) => {
      const file = view.file;
      if (file instanceof TFile && file.extension === "md") {
        menu.addItem((i) =>
          i.setTitle("print UPSC - MD to PDF")
            .setIcon("printer")
            .onClick(() => new ExportModal(this.app, this, file).open())
        );
      }
    }));
    this.addSettingTab(new ExportSettingTab(this.app, this));
  }

  private openForActive() {
    const f = this.app.workspace.getActiveFile();
    if (!f || f.extension !== "md") { new Notice("Open a Markdown note first."); return; }
    new ExportModal(this.app, this, f).open();
  }

  async saveSettings() { await this.saveData(this.settings); }

  async runExport(file: TFile, opts: ExportOptions, onProgress: (m: string, f: number) => void | Promise<void>): Promise<TFile> {
    if (this.busy) throw new Error("An export is already running.");
    this.busy = true;
    const comp = new Component();
    comp.load();
    const g = computeGeometry(opts);
    const stage = document.body.createDiv({ cls: "markdown-rendered theme-light mdx-render-stage" });
    stage.style.cssText = `position:fixed;left:0;top:0;z-index:-1;width:${Math.round(g.contentWmm * MM_TO_PX)}px;pointer-events:none;`;
    try {
      await onProgress("Rendering note…", 0.01);
      const raw = await this.app.vault.cachedRead(file);
      const { body, meta } = splitFrontmatter(raw);
      const eff: ExportOptions = {
        ...opts,
        title: opts.title.trim() || meta["title"] || "",
        subtitle: opts.subtitle.trim() || meta["author"] || "",
      };
      await MarkdownRenderer.render(this.app, preprocessMath(body), stage, file.path, comp);
      await this.waitForRender(stage);
      const badMath = injectMath(stage);
      if (badMath) new Notice(`${badMath} formula(s) could not be typeset and were left as source.`);
      const bytes = await exportPdf(stage, eff, onProgress);

      const dir = this.settings.outputFolder.trim() || file.parent?.path || "";
      if (dir && dir !== "/" && !this.app.vault.getAbstractFileByPath(normalizePath(dir))) {
        await this.app.vault.createFolder(normalizePath(dir));
      }
      const out = normalizePath(`${dir === "/" ? "" : dir}/${file.basename}.pdf`);
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const existing = this.app.vault.getAbstractFileByPath(out);
      if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, ab);
      else if (existing instanceof TFolder) throw new Error(`${out} is a folder`);
      else await this.app.vault.createBinary(out, ab);
      return this.app.vault.getAbstractFileByPath(out) as TFile;
    } finally {
      comp.unload();
      stage.remove();
      this.busy = false;
    }
  }

  /** Wait for embeds, images, math and diagrams that Obsidian renders asynchronously. */
  private async waitForRender(stage: HTMLElement) {
    try { await finishRenderMath(); } catch { /* not available */ }
    const deadline = Date.now() + 400;
    while (Date.now() < deadline) {
      const pendingEmbeds = stage.querySelectorAll(".markdown-embed.is-loading").length;
      const pendingImgs = Array.from(stage.querySelectorAll("img")).filter((i) => !i.complete).length;
      if (!pendingEmbeds && !pendingImgs) break;
      await sleep(100);
    }
    // Render any remaining unrendered mermaid diagrams into real SVGs
    try {
      await renderRemainingMermaid(stage);
    } catch (e) {
      console.warn("Error rendering remaining mermaid:", e);
    }
    // Remove any lingering .is-loading classes
    stage.querySelectorAll(".is-loading").forEach((e) => e.classList.remove("is-loading"));
  }
}

class ExportModal extends Modal {
  private opts: ExportOptions;
  constructor(app: App, private plugin: MdExportUpscPlugin, private file: TFile) {
    super(app);
    this.opts = { ...plugin.settings.opts, title: file.basename, subtitle: "" };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("mdx-modal");
    contentEl.createEl("h3", { text: `print UPSC - MD to PDF: “${this.file.basename}”` });
    const o = this.opts;

    const section = (t: string) => contentEl.createEl("h4", { text: t });

    section("Document");
    new Setting(contentEl).setName("Title").setDesc("Shown on the title page and footer. Blank = none.")
      .addText((t) => t.setValue(o.title).onChange((v) => (o.title = v)));
    new Setting(contentEl).setName("Subtitle / author")
      .addText((t) => t.setValue(o.subtitle).onChange((v) => (o.subtitle = v)));
    new Setting(contentEl).setName("Title page").addToggle((t) => t.setValue(o.titlePage).onChange((v) => (o.titlePage = v)));
    new Setting(contentEl).setName("Index (table of contents)").addToggle((t) => t.setValue(o.toc).onChange((v) => (o.toc = v)));
    new Setting(contentEl).setName("Index depth").addDropdown((d) =>
      d.addOptions({ "1": "H1", "2": "H1–H2", "3": "H1–H3", "4": "H1–H4", "6": "All" }).setValue(String(o.tocDepth)).onChange((v) => (o.tocDepth = Number(v))));
    new Setting(contentEl).setName("New page per chapter (H1)").addToggle((t) => t.setValue(o.chapterBreak).onChange((v) => (o.chapterBreak = v)));

    section("Typography");
    new Setting(contentEl).setName("Font").addDropdown((d) =>
      d.addOptions({ serif: "Book (serif)", sans: "Modern (sans)" }).setValue(o.font).onChange((v) => (o.font = v as ExportOptions["font"])));
    new Setting(contentEl).setName("Justify text").addToggle((t) => t.setValue(o.justify).onChange((v) => (o.justify = v)));

    section("Page setup");
    new Setting(contentEl).setName("Paper").addDropdown((d) =>
      d.addOptions({ A4: "A4", A3: "A3", A5: "A5", Letter: "Letter", Legal: "Legal" }).setValue(o.paper).onChange((v) => (o.paper = v as PaperName)));
    new Setting(contentEl).setName("Layout").addDropdown((d) =>
      d.addOptions({ "1": "1 page per sheet (portrait)", "2": "2 pages per sheet (landscape)" }).setValue(o.twoUp ? "2" : "1").onChange((v) => (o.twoUp = v === "2")));
    new Setting(contentEl).setName("Scratchpad margin (1:5)").setDesc("Blank right-hand strip for handwritten notes in GoodNotes.")
      .addToggle((t) => t.setValue(o.scratchpad).onChange((v) => (o.scratchpad = v)));

    section("Watermark");
    new Setting(contentEl).setName("Text").setDesc("Diagonal watermark. Blank = none.")
      .addText((t) => t.setValue(o.watermark).onChange((v) => (o.watermark = v)));
    new Setting(contentEl).setName("Opacity (%)")
      .addSlider((s) => s.setLimits(1, 100, 1).setValue(o.wmOpacity).setDynamicTooltip().onChange((v) => (o.wmOpacity = v)));
    new Setting(contentEl).setName("Size (px)")
      .addSlider((s) => s.setLimits(20, 300, 5).setValue(o.wmSize).setDynamicTooltip().onChange((v) => (o.wmSize = v)));

    const status = contentEl.createDiv({ cls: "mdx-status" });
    const bar = contentEl.createEl("progress", { cls: "mdx-progress" });
    bar.max = 1; bar.value = 0; bar.hide();
    const btn = new Setting(contentEl).addButton((b) => {
      b.setButtonText("Export PDF").setCta().onClick(async () => {
        b.setDisabled(true);
        bar.show();
        try {
          this.plugin.settings.opts = { ...o, title: "", subtitle: "" };
          await this.plugin.saveSettings();
          const out = await this.plugin.runExport(this.file, o, async (m, f) => {
            status.setText(m);
            bar.value = f;
            await sleep(20); // Yield so mobile WebKit repaints status & progress bar
          });
          new Notice(`Saved ${out.path}`, 6000);
          this.close();
          if (this.plugin.settings.openAfterExport) {
            try {
              const leaf = this.app.workspace.getLeaf(false);
              await leaf.openFile(out);
            } catch (openErr) {
              console.warn("Could not auto-open PDF in leaf:", openErr);
            }
          }
        } catch (e) {
          console.error(e);
          status.setText(`Failed: ${(e as Error).message}`);
          b.setDisabled(false);
        }
      });
    });
    void btn;
  }

  onClose() { this.contentEl.empty(); }
}

class ExportSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MdExportUpscPlugin) { super(app, plugin); }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Output folder")
      .setDesc("Vault folder for exported PDFs. Leave blank to save next to the note.")
      .addText((t) => t.setPlaceholder("e.g. Exports").setValue(this.plugin.settings.outputFolder).onChange(async (v) => {
        this.plugin.settings.outputFolder = v; await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName("Open PDF after export")
      .addToggle((t) => t.setValue(this.plugin.settings.openAfterExport).onChange(async (v) => {
        this.plugin.settings.openAfterExport = v; await this.plugin.saveSettings();
      }));
  }
}
