/* eslint-disable @typescript-eslint/no-explicit-any */
import { PDFDocument, PDFHexString, PDFName, PDFPage, PDFRef, PDFString } from "pdf-lib";
import { FontSet, fontkit } from "./fonts";
import { SheetPainter } from "./vector";
import { FOOTER_LABEL, FOOTER_URL } from "./constants";
import { Flow } from "./flow";
import { buildCss } from "./styles-pdf";
import { computeGeometry, ExportOptions, MM_TO_PT, MM_TO_PX } from "./options";

export type Progress = (msg: string, fraction: number) => void;

interface LinkSpec {
  sheet: number;
  rect: [number, number, number, number]; // css px, top-left origin, relative to sheet
  uri?: string;
  destSheet?: number;
  destY?: number;
}
interface HeadingInfo { level: number; text: string; id: string; }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/* ------------------------------------------------------------------ */
/* Content preparation                                                */
/* ------------------------------------------------------------------ */

async function inlineImages(root: HTMLElement, maxDim = 1600): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  for (const img of imgs) {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:")) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(src, { signal: controller.signal });
      clearTimeout(timer);
      const blob = await resp.blob();
      let url: string;
      if (blob.type.includes("svg")) {
        url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(await blob.text());
      } else {
        const bmp = await createImageBitmap(blob);
        const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * s));
        c.height = Math.max(1, Math.round(bmp.height * s));
        c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        url = c.toDataURL(blob.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9);
      }
      img.removeAttribute("srcset");
      img.src = url;
      try {
        await Promise.race([
          img.decode(),
          new Promise((r) => setTimeout(r, 1000)),
        ]);
      } catch { /* ignore */ }
    } catch {
      /* leave the original src; html2canvas may still load it */
    }
  }
}

/** html2canvas serialises inline SVG to an image, which loses page CSS. Bake in what matters. */
function prepareSvgs(root: HTMLElement): void {
  root.querySelectorAll("svg").forEach((svg) => {
    // Mermaid labels live in <foreignObject>, which taints canvases on Safari. Replace with SVG text.
    svg.querySelectorAll("foreignObject").forEach((fo) => {
      const inner = fo.firstElementChild as HTMLElement | null;
      const text = (inner?.innerText || fo.textContent || "").trim();
      const w = parseFloat(fo.getAttribute("width") || "0");
      const h = parseFloat(fo.getAttribute("height") || "0");
      const x = parseFloat(fo.getAttribute("x") || "0");
      const y = parseFloat(fo.getAttribute("y") || "0");
      const cs = inner ? getComputedStyle(inner) : null;
      const fs = cs ? parseFloat(cs.fontSize) || 14 : 14;
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", String(fs));
      t.setAttribute("fill", cs ? cs.color : "#222");
      t.setAttribute("font-family", cs ? cs.fontFamily : "sans-serif");
      const lines = text.split(/\n+/).filter(Boolean);
      const lh = fs * 1.25;
      lines.forEach((ln, i) => {
        const ts = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        ts.setAttribute("x", String(x + w / 2));
        ts.setAttribute("y", String(y + h / 2 + (i - (lines.length - 1) / 2) * lh + fs * 0.35));
        ts.textContent = ln;
        t.appendChild(ts);
      });
      fo.replaceWith(t);
    });
  });
}

function boxShortBold(root: HTMLElement): void {
  root.querySelectorAll("strong, b").forEach((b) => {
    const t = (b.textContent || "").trim();
    if (!t || t.split(/\s+/).length > 2) return;
    if (b.closest("h1,h2,h3,h4,h5,h6,table,.callout-title")) return;
    b.classList.add("mdx-boxed");
  });
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

export async function exportPdf(content: HTMLElement, opts: ExportOptions, progress: Progress = () => {}): Promise<Uint8Array> {
  const g = computeGeometry(opts);
  const sheetW = Math.round(g.sheetWmm * MM_TO_PX);
  const sheetH = Math.round(g.sheetHmm * MM_TO_PX);
  const contentW = Math.round(g.contentWmm * MM_TO_PX);
  const contentH = Math.round(g.contentHmm * MM_TO_PX);
  const kx = (g.sheetWmm * MM_TO_PT) / sheetW; // css px -> pt
  const ky = (g.sheetHmm * MM_TO_PT) / sheetH;

  const fonts = new FontSet();
  await fonts.loadIntoDocument();
  const root = el("div", "mdx-root theme-light");
  const style = el("style");
  style.textContent = buildCss(opts, g);
  root.appendChild(style);
  document.body.appendChild(root);

  try {
    progress("Preparing content…", 0.02);
    // Expand collapsible callouts and HTML disclosure elements so their contents appear in the PDF
    content.querySelectorAll(".callout.is-collapsed").forEach((c) => c.classList.remove("is-collapsed"));
    content.querySelectorAll("details").forEach((d) => d.setAttribute("open", "true"));

    await inlineImages(content);
    prepareSvgs(content);
    boxShortBold(content);

    // headings + ids
    const headings: HeadingInfo[] = [];
    content.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h, i) => {
      if (!h.id) h.id = `mdx-h-${i}`;
      headings.push({ level: Number(h.tagName[1]), text: (h.textContent || "").trim(), id: h.id });
    });

    // link annotation sources inside content
    const byText = new Map<string, string>();
    headings.forEach((h) => { const k = normalize(h.text); if (k && !byText.has(k)) byText.set(k, h.id); });
    content.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const dh = a.getAttribute("data-href") || "";
      if (/^(https?:|mailto:)/i.test(href)) { a.setAttribute("data-pdf-uri", href); return; }
      if (href.startsWith("#") && href.length > 1) {
        const id = decodeURIComponent(href.slice(1));
        if (content.querySelector(`[id="${CSS.escape(id)}"]`)) { a.setAttribute("data-pdf-goto", id); return; }
      }
      const frag = dh.startsWith("#") ? dh : "";
      if (frag) {
        const last = frag.split("#").filter(Boolean).pop() || "";
        const id = byText.get(normalize(last));
        if (id) a.setAttribute("data-pdf-goto", id);
      }
    });

    // front blocks
    const front: HTMLElement[] = [];
    if (opts.titlePage && opts.title) {
      const tp = el("div", "mdx-title-page");
      tp.appendChild(el("div", "mdx-title", opts.title));
      if (opts.subtitle) tp.appendChild(el("div", "mdx-subtitle", opts.subtitle));
      tp.appendChild(el("div", "mdx-title-rule"));
      tp.setAttribute("data-break-after", "1");
      front.push(tp);
    }
    const tocPn: { span: HTMLElement; id: string }[] = [];
    if (opts.toc) {
      const tocHeads = headings.filter((h) => h.level <= opts.tocDepth && h.text);
      if (tocHeads.length) {
        const toc = el("div", "mdx-toc");
        toc.appendChild(el("span", "toctitle", "Contents"));
        const ul = el("ul");
        const minLevel = Math.min(...tocHeads.map((h) => h.level));
        tocHeads.forEach((h) => {
          const li = el("li", "l" + Math.min(3, h.level - minLevel + 1));
          const a = el("a");
          a.setAttribute("data-pdf-goto", h.id);
          a.appendChild(el("span", "t", h.text));
          a.appendChild(el("span", "lead"));
          const pn = el("span", "pn", "00");
          pn.style.visibility = "hidden";
          a.appendChild(pn);
          tocPn.push({ span: pn, id: h.id });
          li.appendChild(a);
          ul.appendChild(li);
        });
        toc.appendChild(ul);
        toc.setAttribute("data-break-after", "1");
        front.push(toc);
      }
    }

    // paginate
    progress("Laying out pages…", 0.1);
    const stage = el("div");
    stage.style.cssText = `position:absolute;left:0;top:0;`;
    root.appendChild(stage);
    const makeBody = () => {
      const b = el("div", "mdx-pbody markdown-rendered theme-light");
      b.style.width = contentW + "px";
      b.style.height = contentH + "px";
      stage.appendChild(b);
      return b;
    };
    const flow = new Flow(makeBody, opts.chapterBreak);
    const nodes = [...front, ...Array.from(content.childNodes)];
    for (const n of nodes) {
      if (n.nodeType === 3 && !(n.textContent || "").trim()) continue;
      flow.add(n);
    }
    const bodies = flow.finish();
    await tick();

    // sheets
    root.removeChild(stage);
    const sheets: HTMLElement[] = [];
    const perSheet = g.cols;
    const total = Math.ceil(bodies.length / perSheet);
    for (let s = 0; s < total; s++) {
      const sheet = el("div", "mdx-sheet theme-light");
      sheet.style.width = sheetW + "px";
      sheet.style.height = sheetH + "px";
      sheet.dataset.index = String(s);
      for (let c = 0; c < perSheet; c++) {
        const b = bodies[s * perSheet + c];
        if (!b) break;
        const col = el("div", "mdx-col");
        col.style.left = Math.round(g.colX0mm[c] * MM_TO_PX) + "px";
        col.style.top = Math.round(g.topMm * MM_TO_PX) + "px";
        col.appendChild(b);
        sheet.appendChild(col);
      }
      if (opts.scratchpad) {
        const x = Math.round(sheetW * 0.8);
        const line = el("div", "mdx-scratch-line");
        line.style.cssText = `left:${x}px;top:40px;height:${sheetH - 80}px;`;
        const lab = el("div", "mdx-scratch-label", "scratchpad");
        lab.style.cssText = `left:${x}px;width:${sheetW - x}px;top:46px;`;
        sheet.append(line, lab);
      }
      // footer: title (left) | page (centre) | hard-coded link (right)
      const foot = el("div", "mdx-footer");
      foot.appendChild(el("div", "l", opts.title));
      foot.appendChild(el("div", "c", `${s + 1}/${total}`));
      const r = el("div", "r");
      const fa = el("a", "", FOOTER_LABEL);
      fa.setAttribute("data-pdf-uri", FOOTER_URL);
      r.appendChild(fa);
      foot.appendChild(r);
      sheet.appendChild(foot);
      root.appendChild(sheet);
      sheets.push(sheet);
    }

    // TOC page numbers (width was reserved, so no reflow)
    const sheetOf = (e: Element): number => {
      const sh = e.closest(".mdx-sheet") as HTMLElement | null;
      return sh ? Number(sh.dataset.index) : 0;
    };
    const byId = (id: string) => root.querySelector(`[id="${CSS.escape(id)}"]`);
    tocPn.forEach(({ span, id }) => {
      const t = byId(id);
      span.textContent = t ? String(sheetOf(t) + 1) : "";
      span.style.visibility = "visible";
    });
    await tick();
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    }

    // collect links + outline geometry before rasterising
    const links: LinkSpec[] = [];
    const posOf = (t: Element) => {
      const sh = t.closest(".mdx-sheet") as HTMLElement;
      return { sheet: Number(sh.dataset.index), y: t.getBoundingClientRect().top - sh.getBoundingClientRect().top };
    };
    sheets.forEach((sh, si) => {
      const sr = sh.getBoundingClientRect();
      sh.querySelectorAll("a[data-pdf-uri],a[data-pdf-goto]").forEach((a) => {
        const uri = a.getAttribute("data-pdf-uri") || undefined;
        const gid = a.getAttribute("data-pdf-goto") || undefined;
        let dest: { sheet: number; y: number } | undefined;
        if (gid) { const t = byId(gid); if (t) dest = posOf(t); else return; }
        const rects = (a as HTMLElement).getClientRects();
        for (const r of Array.from(rects)) {
          if (r.width < 1 || r.height < 1) continue;
          links.push({
            sheet: si, uri,
            rect: [r.left - sr.left, r.top - sr.top, r.right - sr.left, r.bottom - sr.top],
            destSheet: dest?.sheet, destY: dest?.y,
          });
        }
      });
    });
    const outline = headings
      .filter((h) => h.text)
      .map((h) => { const t = byId(h.id); if (!t) return null; const p = posOf(t); return { ...h, sheet: p.sheet, y: p.y }; })
      .filter((x): x is HeadingInfo & { sheet: number; y: number } => !!x);

    // paint -> PDF (real text + vectors)
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit as never);
    pdf.setCreator("MD Export for UPSC");
    if (opts.title) pdf.setTitle(opts.title);
    const pages: PDFPage[] = [];
    const wPt = g.sheetWmm * MM_TO_PT, hPt = g.sheetHmm * MM_TO_PT;
    const env = { pdf, fonts, hPt, kx, ky };
    const wm = opts.watermark.trim() ? { text: opts.watermark, size: opts.wmSize, opacity: opts.wmOpacity } : null;

    for (let i = 0; i < sheets.length; i++) {
      progress(`Writing page ${i + 1} of ${sheets.length}…`, 0.15 + 0.8 * (i / sheets.length));
      const page = pdf.addPage([wPt, hPt]);
      try {
        await new SheetPainter(env, page).paint(sheets[i], wm);
      } catch (err) {
        console.warn(`Error painting page ${i + 1}:`, err);
      }
      pages.push(page);
      sheets[i].remove();
      await tick();
    }

    // link annotations
    const ctx = pdf.context;
    const annots = new Map<number, PDFRef[]>();
    for (const l of links) {
      const [x1, y1, x2, y2] = l.rect;
      const rect = [x1 * kx, hPt - y2 * ky, x2 * kx, hPt - y1 * ky];
      const d: Record<string, any> = { Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0] };
      if (l.uri) {
        d.A = ctx.obj({ Type: "Action", S: "URI", URI: PDFString.of(l.uri) });
      } else if (l.destSheet !== undefined && pages[l.destSheet]) {
        d.Dest = ctx.obj([pages[l.destSheet].ref, PDFName.of("XYZ"), null, hPt - (l.destY || 0) * ky, null]);
      } else continue;
      const ref = ctx.register(ctx.obj(d));
      (annots.get(l.sheet) || annots.set(l.sheet, []).get(l.sheet)!).push(ref);
    }
    annots.forEach((refs, si) => pages[si].node.set(PDFName.of("Annots"), ctx.obj(refs)));

    addOutline(pdf, pages, outline, hPt, ky);
    progress("Saving PDF…", 0.97);
    return await pdf.save();
  } finally {
    root.remove();
    fonts.unloadFromDocument();
  }
}

/* ------------------------------------------------------------------ */
/* Outline (bookmarks)                                                */
/* ------------------------------------------------------------------ */

interface ONode { title: string; sheet: number; y: number; kids: ONode[]; ref: PDFRef; }

function addOutline(pdf: PDFDocument, pages: PDFPage[], items: { level: number; text: string; sheet: number; y: number }[], hPt: number, ky: number): void {
  if (!items.length) return;
  const ctx = pdf.context;
  const rootNode: ONode = { title: "", sheet: 0, y: 0, kids: [], ref: ctx.nextRef() };
  const stack: { level: number; node: ONode }[] = [{ level: 0, node: rootNode }];
  let prev = 0;
  for (const it of items) {
    const lvl = Math.max(1, Math.min(it.level, prev + 1));
    prev = lvl;
    while (stack[stack.length - 1].level >= lvl) stack.pop();
    const node: ONode = { title: it.text, sheet: it.sheet, y: it.y, kids: [], ref: ctx.nextRef() };
    stack[stack.length - 1].node.kids.push(node);
    stack.push({ level: lvl, node });
  }
  const count = (n: ONode): number => n.kids.reduce((a, k) => a + 1 + count(k), 0);
  const emit = (n: ONode, parent: ONode) => {
    n.kids.forEach((k, i) => {
      const d: Record<string, any> = {
        Title: PDFHexString.fromText(k.title),
        Parent: n.ref,
        Dest: [pages[k.sheet].ref, PDFName.of("XYZ"), null, hPt - k.y * ky, null],
      };
      if (i > 0) d.Prev = n.kids[i - 1].ref;
      if (i < n.kids.length - 1) d.Next = n.kids[i + 1].ref;
      if (k.kids.length) { d.First = k.kids[0].ref; d.Last = k.kids[k.kids.length - 1].ref; d.Count = count(k); }
      ctx.assign(k.ref, ctx.obj(d));
      emit(k, n);
    });
    void parent;
  };
  emit(rootNode, rootNode);
  ctx.assign(rootNode.ref, ctx.obj({
    Type: "Outlines", First: rootNode.kids[0].ref, Last: rootNode.kids[rootNode.kids.length - 1].ref, Count: count(rootNode),
  }));
  pdf.catalog.set(PDFName.of("Outlines"), rootNode.ref);
  pdf.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}
