import "regenerator-runtime/runtime";
import serif_regular from "../fonts/serif-regular.ttf";
import serif_bold from "../fonts/serif-bold.ttf";
import serif_italic from "../fonts/serif-italic.ttf";
import serif_bolditalic from "../fonts/serif-bolditalic.ttf";
import sans_regular from "../fonts/sans-regular.ttf";
import sans_bold from "../fonts/sans-bold.ttf";
import sans_italic from "../fonts/sans-italic.ttf";
import sans_bolditalic from "../fonts/sans-bolditalic.ttf";
import mono_regular from "../fonts/mono-regular.ttf";
import mono_bold from "../fonts/mono-bold.ttf";
import deva_regular from "../fonts/deva-regular.ttf";
import deva_bold from "../fonts/deva-bold.ttf";
import * as fontkitNs from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

const fontkitModule: any = (fontkitNs as any).default ?? fontkitNs;
export { fontkitModule as fontkit };

export type Family = "serif" | "sans" | "mono" | "deva";

export const CSS_FAMILY: Record<Family, string> = {
  serif: "MDX Serif", sans: "MDX Sans", mono: "MDX Mono", deva: "MDX Deva",
};
export const STACK: Record<"serif" | "sans" | "mono", string> = {
  serif: "'MDX Serif','MDX Deva',serif",
  sans: "'MDX Sans','MDX Deva',sans-serif",
  mono: "'MDX Mono','MDX Deva',monospace",
};

interface FontDef { key: string; family: Family; bold: boolean; italic: boolean; data: Uint8Array; }

const DEFS: FontDef[] = [
  { key: "serif-regular", family: "serif", bold: false, italic: false, data: serif_regular },
  { key: "serif-bold", family: "serif", bold: true, italic: false, data: serif_bold },
  { key: "serif-italic", family: "serif", bold: false, italic: true, data: serif_italic },
  { key: "serif-bolditalic", family: "serif", bold: true, italic: true, data: serif_bolditalic },
  { key: "sans-regular", family: "sans", bold: false, italic: false, data: sans_regular },
  { key: "sans-bold", family: "sans", bold: true, italic: false, data: sans_bold },
  { key: "sans-italic", family: "sans", bold: false, italic: true, data: sans_italic },
  { key: "sans-bolditalic", family: "sans", bold: true, italic: true, data: sans_bolditalic },
  { key: "mono-regular", family: "mono", bold: false, italic: false, data: mono_regular },
  { key: "mono-bold", family: "mono", bold: true, italic: false, data: mono_bold },
  { key: "deva-regular", family: "deva", bold: false, italic: false, data: deva_regular },
  { key: "deva-bold", family: "deva", bold: true, italic: false, data: deva_bold },
];

function uint8ToBase64(u8: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("base64");
  }
  let binary = "";
  const len = u8.byteLength;
  const chunk = 0x8000;
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunk, len)) as any);
  }
  return btoa(binary);
}

let cachedFontFaceCss = "";

export function getFontFaceCss(): string {
  if (cachedFontFaceCss) return cachedFontFaceCss;
  const rules: string[] = [];
  for (const d of DEFS) {
    const fam = CSS_FAMILY[d.family];
    const weight = d.bold ? "700" : "400";
    const style = d.italic ? "italic" : "normal";
    const b64 = uint8ToBase64(d.data);
    rules.push(`@font-face {
  font-family: '${fam}';
  font-weight: ${weight};
  font-style: ${style};
  font-display: block;
  src: url('data:font/truetype;charset=utf-8;base64,${b64}') format('truetype');
}`);
  }
  cachedFontFaceCss = rules.join("\n");
  return cachedFontFaceCss;
}

/** A font usable both for browser layout (FontFace) and PDF embedding. */
export class PFont {
  pdf!: PDFFont;
  upm = 1000;
  ascent = 1000;
  descent = -250;
  private fk: any;
  constructor(public def: FontDef) {}
  has(cp: number): boolean { return !!this.fk && this.fk.hasGlyphForCodePoint(cp); }
  /** Browsers round ascent to whole px, so we do too when placing the baseline. */
  baselineOffset(sizePx: number): number { return Math.round((this.ascent / this.upm) * sizePx); }
  async init(pdfDoc: PDFDocument): Promise<void> {
    this.fk = fontkitModule.create(this.def.data);
    this.upm = this.fk.unitsPerEm;
    this.ascent = this.fk.ascent;
    this.descent = this.fk.descent;
    this.pdf = await pdfDoc.embedFont(this.def.data, { subset: true });
  }
}

export class FontSet {
  private faces: FontFace[] = [];
  private fonts = new Map<string, PFont>();

  /** Register the bundled fonts with the document so the browser lays text out with the exact same glyphs. */
  async loadIntoDocument(): Promise<void> {
    for (const d of DEFS) {
      try {
        const buf = d.data.buffer.slice(d.data.byteOffset, d.data.byteOffset + d.data.byteLength) as ArrayBuffer;
        const face = new FontFace(CSS_FAMILY[d.family], buf, {
          weight: d.bold ? "700" : "400", style: d.italic ? "italic" : "normal",
        });
        await Promise.race([
          face.load(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Font load timeout")), 2000)),
        ]);
        if (document.fonts) (document.fonts as any).add(face);
        this.faces.push(face);
      } catch (err) {
        console.warn(`Could not load document font face ${d.key}:`, err);
      }
    }
  }

  unloadFromDocument(): void {
    try {
      this.faces.forEach((f) => {
        if (document.fonts) (document.fonts as any).delete(f);
      });
    } catch { /* ignore */ }
    this.faces = [];
  }

  /** Lazily embed into the PDF (only fonts actually used end up in the file). */
  async get(pdfDoc: PDFDocument, family: Family, bold: boolean, italic: boolean): Promise<PFont> {
    const exact = DEFS.find((d) => d.family === family && d.bold === bold && d.italic === italic)
      ?? DEFS.find((d) => d.family === family && d.bold === bold)
      ?? DEFS.find((d) => d.family === family)!;
    let f = this.fonts.get(exact.key);
    if (!f) {
      f = new PFont(exact);
      await f.init(pdfDoc);
      this.fonts.set(exact.key, f);
    }
    return f;
  }
}
