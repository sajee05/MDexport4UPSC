/**
 * Paints a laid-out DOM "sheet" into a PDF page as real vectors and text:
 * words are real selectable text in embedded fonts, math/diagrams are vector paths,
 * backgrounds/borders are drawn shapes. Nothing is rasterised except images
 * (and rare glyphs no bundled font covers, e.g. emoji).
 *
 * Layout comes from the browser itself (Range/getBoundingClientRect/getScreenCTM),
 * so the result matches what the DOM looked like at the pixel level.
 */
import {
  PDFDocument, PDFImage, PDFName, PDFOperator, PDFPage, LineCapStyle, LineJoinStyle, degrees, rgb,
  appendBezierCurve, clip, closePath, concatTransformationMatrix, endPath, fill, lineTo, moveTo,
  popGraphicsState, pushGraphicsState, setDashPattern, setFillingRgbColor, setGraphicsState, setLineCap,
  setLineJoin, setLineWidth, setStrokingRgbColor, stroke,
} from "pdf-lib";

const fillEvenOdd = () => PDFOperator.of("f*" as never);
import { FontSet, PFont } from "./fonts";
import { endpoints, ellipseSegs, parsePath, roundRectSegs, Seg } from "./svgpath";

export interface PaintEnv {
  pdf: PDFDocument;
  fonts: FontSet;
  hPt: number;
  kx: number; // css px -> pt (x)
  ky: number; // css px -> pt (y)
}

type M6 = [number, number, number, number, number, number];
interface RGBA { r: number; g: number; b: number; a: number; }

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

function parseColor(s: string | null | undefined): RGBA | null {
  if (!s || s === "none" || s === "transparent") return null;
  let m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a };
  }
  m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\)$/);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return null;
}

const mul = (p: M6, q: M6): M6 => [ // apply q first, then p
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];

function roman(n: number): string {
  const t: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = ""; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}
function alpha(n: number): string {
  let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s;
}

const SKIP_SVG = new Set(["defs", "clippath", "mask", "marker", "symbol", "pattern", "lineargradient", "radialgradient", "title", "desc", "style", "script", "metadata"]);

export class SheetPainter {
  private sr!: DOMRect;
  private gsCache = new Map<string, PDFName>();
  private imgCache = new Map<string, PDFImage | null>();
  private glyphCache = new Map<string, PDFImage | null>();
  private famCache = new Map<string, "serif" | "sans" | "mono">();
  private fontPick = new Map<string, PFont | null>();

  constructor(private env: PaintEnv, private page: PDFPage) {}

  /* ---------- coordinate helpers ---------- */
  private X(x: number) { return (x - this.sr.left) * this.env.kx; }
  private Y(y: number) { return this.env.hPt - (y - this.sr.top) * this.env.ky; }
  private ops(...o: PDFOperator[]) { this.page.pushOperators(...o); }

  private gs(a: number): PDFName {
    const key = String(Math.round(a * 1000) / 1000);
    let n = this.gsCache.get(key);
    if (!n) {
      const ctx = this.env.pdf.context;
      const ref = ctx.register(ctx.obj({ Type: "ExtGState", ca: +key, CA: +key }));
      n = PDFName.of("GS" + key.replace(".", "_"));
      this.page.node.setExtGState(n, ref);
      this.gsCache.set(key, n);
    }
    return n;
  }

  private segOps(segs: Seg[], tx: (x: number) => number, ty: (y: number) => number): PDFOperator[] {
    const o: PDFOperator[] = [];
    for (const s of segs) {
      if (s[0] === "M") o.push(moveTo(tx(s[1]), ty(s[2])));
      else if (s[0] === "L") o.push(lineTo(tx(s[1]), ty(s[2])));
      else if (s[0] === "C") o.push(appendBezierCurve(tx(s[1]), ty(s[2]), tx(s[3]), ty(s[4]), tx(s[5]), ty(s[6])));
      else o.push(closePath());
    }
    return o;
  }

  /** Fill and/or stroke a client-space path. */
  private drawClientPath(segs: Seg[], fillC: RGBA | null, op: number, strokeC: RGBA | null = null, strokeW = 1, dash: number[] | null = null, round = false) {
    const px = (x: number) => this.X(x), py = (y: number) => this.Y(y);
    if (fillC && fillC.a * op > 0.001) {
      this.ops(pushGraphicsState(), setGraphicsState(this.gs(fillC.a * op)), setFillingRgbColor(fillC.r, fillC.g, fillC.b),
        ...this.segOps(segs, px, py), fill(), popGraphicsState());
    }
    if (strokeC && strokeC.a * op > 0.001) {
      const o: PDFOperator[] = [pushGraphicsState(), setGraphicsState(this.gs(strokeC.a * op)), setStrokingRgbColor(strokeC.r, strokeC.g, strokeC.b),
        setLineWidth(strokeW * this.env.kx)];
      if (round) o.push(setLineCap(LineCapStyle.Round));
      if (dash) o.push(setDashPattern(dash.map((d) => d * this.env.kx), 0));
      o.push(...this.segOps(segs, px, py), stroke(), popGraphicsState());
      this.ops(...o);
    }
  }

  private pushClip(r: { left: number; top: number; width: number; height: number }) {
    const x = this.X(r.left), y = this.Y(r.top + r.height);
    this.ops(pushGraphicsState(), moveTo(x, y), lineTo(x + r.width * this.env.kx, y), lineTo(x + r.width * this.env.kx, y + r.height * this.env.ky),
      lineTo(x, y + r.height * this.env.ky), closePath(), clip(), endPath());
  }
  private popClip() { this.ops(popGraphicsState()); }

  /* ---------- fonts ---------- */
  private family(cs: CSSStyleDeclaration): "serif" | "sans" | "mono" {
    const key = cs.fontFamily;
    let f = this.famCache.get(key);
    if (f) return f;
    const first = key.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
    if (first === "mdx mono" || /mono|consolas|menlo|courier/.test(first)) f = "mono";
    else if (first === "mdx sans" || /sans|helvetica|arial|segoe|system|inter/.test(first)) f = "sans";
    else f = "serif";
    this.famCache.set(key, f);
    return f;
  }

  private async fontFor(cp: number, fam: "serif" | "sans" | "mono", bold: boolean, italic: boolean): Promise<PFont | null> {
    const k = `${fam}${bold ? 1 : 0}${italic ? 1 : 0}:${cp}`;
    if (this.fontPick.has(k)) return this.fontPick.get(k)!;
    const { pdf, fonts } = this.env;
    let pick: PFont | null = null;
    const primary = await fonts.get(pdf, fam, bold, italic);
    if (primary.has(cp) || cp === 0x20 || cp === 0xa0) pick = primary;
    else {
      const deva = await fonts.get(pdf, "deva", bold, false);
      if (deva.has(cp)) pick = deva;
      else {
        const sans = await fonts.get(pdf, "sans", bold, italic);
        if (sans.has(cp)) pick = sans;
      }
    }
    this.fontPick.set(k, pick);
    return pick;
  }

  /* ---------- entry ---------- */
  async paint(sheet: HTMLElement, watermark: { text: string; size: number; opacity: number } | null): Promise<void> {
    this.sr = sheet.getBoundingClientRect();
    await this.walk(sheet, 1, true);
    if (watermark && watermark.text.trim()) await this.paintWatermark(watermark.text.trim(), watermark.size, watermark.opacity);
  }

  private async paintWatermark(text: string, sizePx: number, opacity: number) {
    const { pdf, fonts, kx, hPt } = this.env;
    const sans = await fonts.get(pdf, "sans", true, false);
    const deva = await fonts.get(pdf, "deva", true, false);
    const covers = (f: PFont) => Array.from(text).every((c) => c === " " || f.has(c.codePointAt(0)!));
    const font = covers(sans) ? sans : covers(deva) ? deva : sans;
    const size = sizePx * kx;
    const w = font.pdf.widthOfTextAtSize(text, size);
    const wPt = this.sr.width * kx;
    const cx = wPt / 2, cy = hPt / 2;
    const th = Math.PI / 4, c = Math.cos(th), s = Math.sin(th);
    const dx = w / 2, dy = size * 0.35;
    this.page.drawText(text, {
      x: cx - (c * dx - s * dy), y: cy - (s * dx + c * dy), size, font: font.pdf,
      rotate: degrees(45), color: rgb(0.5, 0.5, 0.5), opacity: Math.max(0.01, Math.min(1, opacity / 100)),
    });
  }

  /* ---------- DOM walk ---------- */
  private async walk(el: Element, parentOp: number, isSheet = false): Promise<void> {
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    const tag = el.tagName.toLowerCase();
    const op = parentOp * (parseFloat(cs.opacity) || (cs.opacity === "0" ? 0 : 1));
    if (op <= 0.001) return;
    const visible = cs.visibility !== "hidden";

    if (tag === "svg") { if (visible) await this.paintSvg(el as SVGSVGElement, op); return; }
    if (tag === "img") { if (visible) await this.paintImg(el as HTMLImageElement, op); return; }
    if (tag === "mjx-container" && el.querySelector("svg")) {
      // fall through: children (the <svg>) are handled by the loop below
    }

    const clipBox = !isSheet && /hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY);
    let clipRect: DOMRect | null = null;
    if (clipBox) { clipRect = el.getBoundingClientRect(); this.pushClip(clipRect); }

    if (visible) {
      this.paintBox(el, cs, op);
      if (cs.display === "list-item") await this.paintMarker(el as HTMLElement, cs, op);
      if (tag === "input" && (el as HTMLInputElement).type === "checkbox") this.paintCheckbox(el as HTMLInputElement, op);
    }

    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 1) await this.walk(node as Element, op);
      else if (node.nodeType === 3 && visible) await this.paintText(node as Text, el, cs, op, 1, null);
    }
    if (clipBox) this.popClip();
  }

  /* ---------- boxes ---------- */
  private paintBox(el: Element, cs: CSSStyleDeclaration, op: number) {
    const bg = parseColor(cs.backgroundColor);
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map((v) => parseFloat(v) || 0);
    const bst = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    const hasBorder = bw.some((w, i) => w > 0 && bst[i] !== "none" && bst[i] !== "hidden");
    if (!(bg && bg.a > 0) && !hasBorder) return;

    const inline = cs.display === "inline";
    const rects = inline ? Array.from((el as HTMLElement).getClientRects()) : [el.getBoundingClientRect()];
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    for (const r of rects) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      const rr = Math.min(rad, r.width / 2, r.height / 2);
      if (bg && bg.a > 0) {
        this.drawClientPath(roundRectSegs(r.left, r.top, r.width, r.height, rr, rr), bg, op);
      }
      if (!hasBorder) continue;
      const cols = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map((c) => parseColor(c));
      const uniform = bw.every((w) => w === bw[0]) && bst.every((s) => s === bst[0]) && cols.every((c) => c && cols[0] && c.r === cols[0].r && c.g === cols[0].g && c.b === cols[0].b && c.a === cols[0].a);
      if (uniform && cols[0] && bst[0] !== "none") {
        const w = bw[0];
        const dash = bst[0] === "dashed" ? [w * 3, w * 3] : bst[0] === "dotted" ? [w, w * 1.5] : null;
        this.drawClientPath(roundRectSegs(r.left + w / 2, r.top + w / 2, r.width - w, r.height - w, Math.max(0, rr - w / 2), Math.max(0, rr - w / 2)),
          null, op, cols[0], w, dash, false);
        continue;
      }
      for (let i = 0; i < 4; i++) {
        const w = bw[i], c = cols[i], st = bst[i];
        if (!(w > 0) || !c || st === "none" || st === "hidden") continue;
        let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
        const collapsed = cs.borderCollapse === "collapse" && (el.tagName === "TD" || el.tagName === "TH");
        if (collapsed) {
          if (i === 0) { y1 = r.top - w / 2; y2 = r.top + w / 2; }
          else if (i === 2) { y1 = r.bottom - w / 2; y2 = r.bottom + w / 2; }
          else if (i === 3) { x1 = r.left - w / 2; x2 = r.left + w / 2; }
          else { x1 = r.right - w / 2; x2 = r.right + w / 2; }
        } else if (i === 0) y2 = r.top + w; else if (i === 2) y1 = r.bottom - w; else if (i === 3) x2 = r.left + w; else x1 = r.right - w;
        if (st === "solid" || st === "double" || st === "groove" || st === "ridge" || st === "inset" || st === "outset") {
          this.drawClientPath([["M", x1, y1], ["L", x2, y1], ["L", x2, y2], ["L", x1, y2], ["Z"]], c, op);
        } else {
          const horiz = i === 0 || i === 2;
          const mid = horiz ? (y1 + y2) / 2 : (x1 + x2) / 2;
          const seg: Seg[] = horiz ? [["M", x1, mid], ["L", x2, mid]] : [["M", mid, y1], ["L", mid, y2]];
          this.drawClientPath(seg, null, op, c, w, st === "dashed" ? [w * 3, w * 3] : [w, w * 1.5], false);
        }
      }
    }
  }

  private paintCheckbox(cb: HTMLInputElement, op: number) {
    const r = cb.getBoundingClientRect();
    if (r.width < 2) return;
    const box = roundRectSegs(r.left + 0.5, r.top + 0.5, r.width - 1, r.height - 1, 3, 3);
    if (cb.checked) {
      this.drawClientPath(box, { r: 0.17, g: 0.37, b: 0.54, a: 1 }, op);
      const w = r.width, h = r.height;
      this.drawClientPath([["M", r.left + w * 0.25, r.top + h * 0.52], ["L", r.left + w * 0.43, r.top + h * 0.7], ["L", r.left + w * 0.76, r.top + h * 0.3]],
        null, op, { r: 1, g: 1, b: 1, a: 1 }, Math.max(1.2, w * 0.13));
    } else {
      this.drawClientPath(box, null, op, { r: 0.5, g: 0.5, b: 0.5, a: 1 }, 1);
    }
  }

  private async paintMarker(li: HTMLElement, cs: CSSStyleDeclaration, op: number) {
    const type = cs.listStyleType;
    if (!type || type === "none" || li.hasAttribute("data-cont")) return;
    // first line of the item (ignoring nested lists) gives baseline and font
    const tw = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!(n.textContent || "").trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (p && p.closest("ul,ol") !== li.parentElement) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const first = tw.nextNode() as Text | null;
    const liRect = li.getBoundingClientRect();
    let size = parseFloat(cs.fontSize), baseline = liRect.top + size, fcs = cs;
    const fam = this.family(cs);
    let bold = parseInt(cs.fontWeight) >= 600, italic = false;
    if (first && first.parentElement) {
      fcs = getComputedStyle(first.parentElement);
      size = parseFloat(fcs.fontSize);
      const rg = document.createRange(); rg.selectNodeContents(first);
      const r0 = rg.getClientRects()[0];
      if (r0) {
        const f = await this.env.fonts.get(this.env.pdf, this.family(fcs), parseInt(fcs.fontWeight) >= 600, fcs.fontStyle !== "normal");
        baseline = r0.top + f.baselineOffset(size);
      }
      bold = parseInt(fcs.fontWeight) >= 600; italic = fcs.fontStyle !== "normal";
    }
    const color = parseColor(cs.color) || BLACK;
    const left = liRect.left;
    if (type === "disc" || type === "circle" || type === "square") {
      const d = size * 0.32, cx = left - size * 0.62, cy = baseline - size * 0.36;
      if (type === "square") this.drawClientPath([["M", cx - d / 2, cy - d / 2], ["L", cx + d / 2, cy - d / 2], ["L", cx + d / 2, cy + d / 2], ["L", cx - d / 2, cy + d / 2], ["Z"]], color, op);
      else if (type === "disc") this.drawClientPath(ellipseSegs(cx, cy, d / 2, d / 2), color, op);
      else this.drawClientPath(ellipseSegs(cx, cy, d / 2 - 0.5, d / 2 - 0.5), null, op, color, 1);
      return;
    }
    const parent = li.parentElement as HTMLOListElement | null;
    let n = parent && parent.tagName === "OL" ? (parent.start || 1) : 1;
    if (parent) for (const sib of Array.from(parent.children)) { if (sib === li) break; if (sib.tagName === "LI") n++; }
    const v = li.getAttribute("value"); if (v && /^-?\d+$/.test(v)) n = parseInt(v);
    let label: string;
    if (type === "lower-alpha" || type === "lower-latin") label = alpha(n);
    else if (type === "upper-alpha" || type === "upper-latin") label = alpha(n).toUpperCase();
    else if (type === "lower-roman") label = roman(n);
    else if (type === "upper-roman") label = roman(n).toUpperCase();
    else label = String(n);
    label += ".";
    const font = await this.env.fonts.get(this.env.pdf, fam, bold, italic);
    const sizePt = size * this.env.kx;
    const w = font.pdf.widthOfTextAtSize(label, sizePt) / this.env.kx;
    this.page.drawText(label, { x: this.X(left - size * 0.3 - w), y: this.Y(baseline), size: sizePt, font: font.pdf, color: rgb(color.r, color.g, color.b), opacity: op * color.a });
  }

  /* ---------- text ---------- */
  private async paintText(node: Text, el: Element, cs: CSSStyleDeclaration, op: number, scale: number, fillOverride: string | null) {
    const raw = node.data;
    if (!raw || !raw.trim()) return;
    const sizePx = (parseFloat(cs.fontSize) || 16) * scale;
    if (sizePx < 0.5) return;
    const fam = this.family(cs);
    const bold = (parseInt(cs.fontWeight) || 400) >= 600;
    const italic = cs.fontStyle === "italic" || cs.fontStyle === "oblique";
    const color = parseColor(fillOverride ?? cs.color) || BLACK;
    const ls = (parseFloat(cs.letterSpacing) || 0) * scale;
    const tt = cs.textTransform;
    const mapCh = (ch: string) => {
      if (tt === "uppercase") { const u = ch.toUpperCase(); return u.length === ch.length ? u : ch; }
      if (tt === "lowercase") { const u = ch.toLowerCase(); return u.length === ch.length ? u : ch; }
      return ch;
    };
    const deco = this.decoration(el, cs);
    const rng = document.createRange();
    const sizePt = sizePx * this.env.kx;
    const draw = (str: string, f: PFont, r: DOMRect) => {
      this.page.drawText(str, {
        x: this.X(r.left), y: this.Y(r.top + f.baselineOffset(sizePx)), size: sizePt, font: f.pdf,
        color: rgb(color.r, color.g, color.b), opacity: op * color.a,
      });
    };

    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const start = m.index, word = m[0];
      rng.setStart(node, start); rng.setEnd(node, start + word.length);
      const rects = Array.from(rng.getClientRects()).filter((r) => r.width > 0.01 && r.height > 0.01);
      if (!rects.length) continue;
      if (/[ऀ-ॿ]/.test(word)) {
        // Indic shaping (conjuncts, matras) needs the browser's shaper: draw this word as a crisp bitmap.
        const u = rects.reduce((a, r) => ({ left: Math.min(a.left, r.left), top: Math.min(a.top, r.top), right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom) }),
          { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        await this.drawBitmap(word, cs, sizePx, new DOMRect(u.left, u.top, u.right - u.left, u.bottom - u.top), op, color);
        continue;
      }
      const chars: { s: string; off: number }[] = [];
      let off = 0;
      for (const ch of Array.from(word)) { chars.push({ s: mapCh(ch), off }); off += ch.length; }
      const fonts: (PFont | null)[] = [];
      for (const c of chars) fonts.push(await this.fontFor(c.s.codePointAt(0)!, fam, bold, italic));
      const same = fonts[0] && fonts.every((f) => f === fonts[0]);
      if (rects.length === 1 && ls === 0 && same) {
        draw(chars.map((c) => c.s).join(""), fonts[0]!, rects[0]);
      } else {
        for (let i = 0; i < chars.length; i++) {
          rng.setStart(node, start + chars[i].off); rng.setEnd(node, start + chars[i].off + chars[i].s.length);
          const r = Array.from(rng.getClientRects()).find((q) => q.width > 0.01 && q.height > 0.01);
          if (!r) continue;
          const f = fonts[i];
          if (f) draw(chars[i].s, f, r);
          else await this.drawBitmap(chars[i].s, cs, sizePx, r, op, color);
        }
      }
      if (deco.underline || deco.line) {
        for (const r of rects) {
          const th = Math.max(0.6, sizePx * 0.06);
          const f = fonts[0] || (await this.env.fonts.get(this.env.pdf, fam, bold, italic));
          const base = r.top + f.baselineOffset(sizePx);
          if (deco.underline) this.drawClientPath([["M", r.left, base + sizePx * 0.1], ["L", r.right, base + sizePx * 0.1], ["L", r.right, base + sizePx * 0.1 + th], ["L", r.left, base + sizePx * 0.1 + th], ["Z"]], color, op);
          if (deco.line) this.drawClientPath([["M", r.left, base - sizePx * 0.3], ["L", r.right, base - sizePx * 0.3], ["L", r.right, base - sizePx * 0.3 + th], ["L", r.left, base - sizePx * 0.3 + th], ["Z"]], color, op);
        }
      }
    }
  }

  private decoration(el: Element, cs: CSSStyleDeclaration): { underline: boolean; line: boolean } {
    let underline = false, line = false;
    let cur: Element | null = el, c: CSSStyleDeclaration = cs;
    while (cur) {
      const t = c.textDecorationLine;
      if (t.includes("underline")) underline = true;
      if (t.includes("line-through")) line = true;
      if (!/^inline/.test(c.display) || !cur.parentElement) break;
      cur = cur.parentElement; c = getComputedStyle(cur);
    }
    return { underline, line };
  }

  /** Words/glyphs that cannot be placed as plain text (Indic scripts, emoji): crisp 4x bitmap shaped by the browser. */
  private async drawBitmap(str: string, cs: CSSStyleDeclaration, sizePx: number, r: DOMRect, op: number, color: RGBA) {
    const key = `${str}|${cs.fontFamily}|${Math.round(sizePx * 10)}|${cs.fontWeight}|${cs.fontStyle}|${color.r},${color.g},${color.b}|${Math.round(r.width)}`;
    let img = this.glyphCache.get(key);
    if (img === undefined) {
      try {
        const sc = 4, pad = 2;
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.ceil(r.width * sc) + pad * 2);
        c.height = Math.max(1, Math.ceil(r.height * sc) + pad * 2);
        const g = c.getContext("2d")!;
        g.font = `${cs.fontStyle} ${cs.fontWeight} ${sizePx * sc}px ${cs.fontFamily}`;
        g.textBaseline = "alphabetic";
        g.fillStyle = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;
        const fm = g.measureText(str);
        const asc = (fm as TextMetrics & { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent;
        g.fillText(str, pad, pad + (asc !== undefined ? Math.round(asc) : r.height * sc * 0.8));
        const dataUrl = c.toDataURL("image/png");
        const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const bin = atob(b64);
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        img = await this.env.pdf.embedPng(u);
      } catch { img = null; }
      this.glyphCache.set(key, img);
    }
    if (!img) return;
    const padPx = 2 / 4;
    this.page.drawImage(img, {
      x: this.X(r.left - padPx), y: this.Y(r.bottom + padPx),
      width: (r.width + 2 * padPx) * this.env.kx, height: (r.height + 2 * padPx) * this.env.ky, opacity: op * color.a,
    });
  }

  /* ---------- images ---------- */
  private async paintImg(img: HTMLImageElement, op: number) {
    const r = img.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const src = img.currentSrc || img.src;
    let pdfImg = this.imgCache.get(src);
    if (pdfImg === undefined) {
      pdfImg = null;
      try {
        const mm = /^data:(image\/[a-z+.-]+);base64,(.*)$/i.exec(src);
        if (mm && (mm[1] === "image/png" || mm[1] === "image/jpeg")) {
          const bin = atob(mm[2]); const u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          pdfImg = mm[1] === "image/png" ? await this.env.pdf.embedPng(u) : await this.env.pdf.embedJpg(u);
        } else if (img.naturalWidth) {
          const c = document.createElement("canvas");
          const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
          c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
          c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
          const dataUrl = c.toDataURL("image/png");
          const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          const bin = atob(b64);
          const u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          pdfImg = await this.env.pdf.embedPng(u);
        }
      } catch { pdfImg = null; }
      this.imgCache.set(src, pdfImg);
    }
    if (!pdfImg) return;
    const cs = getComputedStyle(img);
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    if (rad > 0) this.pushClipRound(r, rad);
    this.page.drawImage(pdfImg, { x: this.X(r.left), y: this.Y(r.bottom), width: r.width * this.env.kx, height: r.height * this.env.ky, opacity: op });
    if (rad > 0) this.popClip();
  }

  private pushClipRound(r: DOMRect, rad: number) {
    this.ops(pushGraphicsState(), ...this.segOps(roundRectSegs(r.left, r.top, r.width, r.height, rad, rad), (x) => this.X(x), (y) => this.Y(y)), clip(), endPath());
  }

  /* ---------- SVG ---------- */
  private ctmOf(el: Element): M6 | null {
    const m = (el as SVGGraphicsElement).getScreenCTM?.();
    return m ? [m.a, m.b, m.c, m.d, m.e, m.f] : null;
  }

  /** Map a client-space matrix to PDF space: element-local -> pdf points. */
  private pdfMatrix(m: M6): M6 {
    const { kx, ky, hPt } = this.env;
    return [kx * m[0], -ky * m[1], kx * m[2], -ky * m[3], kx * (m[4] - this.sr.left), hPt - ky * (m[5] - this.sr.top)];
  }

  private async paintSvg(svg: SVGSVGElement, op: number) {
    for (const c of Array.from(svg.children)) await this.svgNode(c, op, null);
  }

  private async svgNode(el: Element, parentOp: number, ctmOverride: M6 | null) {
    const tag = el.tagName.toLowerCase();
    if (SKIP_SVG.has(tag)) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const op = parentOp * (cs.opacity === "" ? 1 : parseFloat(cs.opacity));
    if (!(op > 0.001)) return;

    if (tag === "g" || tag === "a" || tag === "svg" || tag === "switch") {
      for (const c of Array.from(el.children)) await this.svgNode(c, op, ctmOverride);
      return;
    }
    const ctm = ctmOverride ?? this.ctmOf(el);
    if (!ctm) return;

    if (tag === "text") {
      const scale = Math.hypot(ctm[0], ctm[1]);
      await this.svgText(el, scale, op);
      return;
    }
    const segs = this.shapeSegs(el, tag);
    if (!segs) return;

    const fillC = this.paintServer(cs.fill, parseFloat(cs.fillOpacity));
    const strokeC = this.paintServer(cs.stroke, parseFloat(cs.strokeOpacity));
    const sw = parseFloat(cs.strokeWidth);
    const pm = this.pdfMatrix(ctm);
    const cm = concatTransformationMatrix(pm[0], pm[1], pm[2], pm[3], pm[4], pm[5]);
    const same = (v: number) => v;
    if (fillC && fillC.a * op > 0.001) {
      this.ops(pushGraphicsState(), setGraphicsState(this.gs(fillC.a * op)), cm, setFillingRgbColor(fillC.r, fillC.g, fillC.b),
        ...this.segOps(segs, same, same), cs.fillRule === "evenodd" ? fillEvenOdd() : fill(), popGraphicsState());
    }
    if (strokeC && strokeC.a * op > 0.001 && sw > 0) {
      const o: PDFOperator[] = [pushGraphicsState(), setGraphicsState(this.gs(strokeC.a * op)), cm, setStrokingRgbColor(strokeC.r, strokeC.g, strokeC.b), setLineWidth(sw)];
      o.push(setLineCap(cs.strokeLinecap === "round" ? LineCapStyle.Round : cs.strokeLinecap === "square" ? LineCapStyle.Projecting : LineCapStyle.Butt));
      o.push(setLineJoin(cs.strokeLinejoin === "round" ? LineJoinStyle.Round : cs.strokeLinejoin === "bevel" ? LineJoinStyle.Bevel : LineJoinStyle.Miter));
      const da = cs.strokeDasharray;
      if (da && da !== "none") {
        const arr = da.split(/[\s,]+/).map((v) => parseFloat(v)).filter((v) => isFinite(v));
        if (arr.length && arr.some((v) => v > 0)) o.push(setDashPattern(arr, 0));
      }
      o.push(...this.segOps(segs, same, same), stroke(), popGraphicsState());
      this.ops(...o);
    }
    if (tag === "path" || tag === "line" || tag === "polyline" || tag === "polygon") {
      await this.svgMarkers(el, cs, segs, ctm, op, sw);
    }
  }

  private paintServer(v: string, opacity: number): RGBA | null {
    const c = parseColor(v);
    if (!c) return null;
    return { ...c, a: c.a * (isFinite(opacity) ? opacity : 1) };
  }

  private shapeSegs(el: Element, tag: string): Seg[] | null {
    const f = (a: string) => parseFloat(el.getAttribute(a) || "0") || 0;
    switch (tag) {
      case "path": return parsePath(el.getAttribute("d") || "");
      case "rect": {
        const w = f("width"), h = f("height");
        if (w <= 0 || h <= 0) return null;
        let rx = el.hasAttribute("rx") ? f("rx") : f("ry"), ry = el.hasAttribute("ry") ? f("ry") : rx;
        if (!el.hasAttribute("rx") && !el.hasAttribute("ry")) { rx = 0; ry = 0; }
        return roundRectSegs(f("x"), f("y"), w, h, rx, ry);
      }
      case "circle": return f("r") > 0 ? ellipseSegs(f("cx"), f("cy"), f("r"), f("r")) : null;
      case "ellipse": return f("rx") > 0 && f("ry") > 0 ? ellipseSegs(f("cx"), f("cy"), f("rx"), f("ry")) : null;
      case "line": return [["M", f("x1"), f("y1")], ["L", f("x2"), f("y2")]];
      case "polyline":
      case "polygon": {
        const nums = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(parseFloat).filter((n) => isFinite(n));
        if (nums.length < 4) return null;
        const s: Seg[] = [["M", nums[0], nums[1]]];
        for (let i = 2; i + 1 < nums.length; i += 2) s.push(["L", nums[i], nums[i + 1]]);
        if (tag === "polygon") s.push(["Z"]);
        return s;
      }
      default: return null;
    }
  }

  private async svgMarkers(el: Element, cs: CSSStyleDeclaration, segs: Seg[], ctm: M6, op: number, sw: number) {
    if (el.closest("marker")) return;
    const ep = endpoints(segs);
    if (!ep) return;
    const url = (v: string) => { const m = /url\(["']?#([^"')]+)["']?\)/.exec(v); return m ? m[1] : null; };
    const root = (el as SVGElement).ownerSVGElement || el.closest("svg");
    if (!root) return;
    const visited = new Set<string>();
    const draw = async (id: string | null, p: [number, number, number]) => {
      if (!id || visited.has(id)) return;
      visited.add(id);
      const mk = (root as Element).querySelector(`[id="${CSS.escape(id)}"]`) as Element | null;
      if (!mk) return;
      const mw = parseFloat(mk.getAttribute("markerWidth") || "3"), mh = parseFloat(mk.getAttribute("markerHeight") || "3");
      const refX = parseFloat(mk.getAttribute("refX") || "0"), refY = parseFloat(mk.getAttribute("refY") || "0");
      const vb = (mk.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(parseFloat);
      const units = mk.getAttribute("markerUnits") === "userSpaceOnUse" ? 1 : (sw || 1);
      let s = units;
      let tx = -refX, ty = -refY;
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { s = units * Math.min(mw / vb[2], mh / vb[3]); tx = -refX; ty = -refY; }
      const orient = mk.getAttribute("orient");
      const ang = orient === "auto" || orient === "auto-start-reverse" ? p[2] : (parseFloat(orient || "0") * Math.PI) / 180;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const T: M6 = [c * s, sn * s, -sn * s, c * s, p[0], p[1]];
      const full = mul(ctm, mul(T, [1, 0, 0, 1, tx, ty]));
      for (const child of Array.from(mk.children)) await this.svgNode(child, op, full);
    };
    await draw(url(cs.markerStart), ep.start);
    await draw(url(cs.markerEnd), ep.end);
  }

  private async svgText(text: Element, scale: number, op: number) {
    const walkText = async (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === 3) await this.paintText(n as Text, el, cs, op, scale, cs.fill);
        else if (n.nodeType === 1) await walkText(n as Element);
      }
    };
    await walkText(text);
  }
}
