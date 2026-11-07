/**
 * LaTeX support. Math is typeset with a bundled MathJax (TeX -> SVG) instead of
 * Obsidian's web-font renderer, so every glyph becomes a real vector path in the PDF.
 *
 * Flow: preprocessMath() swaps $...$ / $$...$$ in the Markdown for inert
 * placeholders before Obsidian renders the note; injectMath() then replaces the
 * placeholders with SVG.
 */
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

type Doc = { convert(tex: string, opts: Record<string, unknown>): unknown };
let adaptor: ReturnType<typeof liteAdaptor> | null = null;
let doc: Doc | null = null;

function engine() {
  if (!doc) {
    adaptor = liteAdaptor({ fontSize: 16 });
    RegisterHTMLHandler(adaptor);
    const packages = AllPackages.filter((p: string) => p !== "bussproofs");
    const input = new TeX({ packages, formatError: (_j: unknown, err: Error) => { throw err; } });
    const output = new SVG({ fontCache: "none" });
    doc = mathjax.document("", { InputJax: input, OutputJax: output }) as unknown as Doc;
  }
  return { adaptor: adaptor!, doc: doc! };
}

/** Typeset one TeX string to an <mjx-container><svg/></mjx-container> HTML string. Throws on invalid TeX. */
export function texToSvgHtml(tex: string, display: boolean): string {
  const { adaptor: a, doc: d } = engine();
  const node = d.convert(tex, { display, em: 16, ex: 8, containerWidth: 1280 });
  return a.outerHTML(node as never);
}

const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (s: string) => decodeURIComponent(escape(atob(s)));

function placeholder(tex: string, display: boolean): string {
  return `<span data-mdx-math="${enc(tex)}" data-display="${display ? 1 : 0}"></span>`;
}

/** Replace math in Markdown with placeholders. Code blocks and inline code are left alone. */
export function preprocessMath(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let buf: string[] = [];
  const flush = () => { if (buf.length) { out.push(convertBlock(buf.join("\n"))); buf = []; } };
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
    } else if (m) {
      flush();
      fence = m[1];
      out.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  return out.join("\n");
}

function convertBlock(text: string): string {
  let res = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];

    // Inline code: `...`
    if (c === "`") {
      let j = i; while (j < n && text[j] === "`") j++;
      const run = text.slice(i, j);
      const close = text.indexOf(run, j);
      if (close === -1) { res += run; i = j; continue; }
      res += text.slice(i, close + run.length);
      i = close + run.length;
      continue;
    }

    // Display math: \[ ... \]
    if (c === "\\" && text[i + 1] === "[") {
      let j = i + 2, end = -1;
      while (j < n - 1) {
        if (text[j] === "\\") {
          if (text[j + 1] === "]") { end = j; break; }
          j += 2;
          continue;
        }
        j++;
      }
      if (end !== -1) {
        let tex = text.slice(i + 2, end);
        const lineStart = text.lastIndexOf("\n", i - 1) + 1;
        if (/^\s*>/.test(text.slice(lineStart, i))) tex = tex.replace(/\n\s*(>\s?)+/g, "\n");
        res += placeholder(tex.trim(), true);
        i = end + 2;
        continue;
      }
    }

    // Inline math: \( ... \)
    if (c === "\\" && text[i + 1] === "(") {
      let j = i + 2, end = -1;
      while (j < n - 1) {
        if (text[j] === "\\") {
          if (text[j + 1] === ")") { end = j; break; }
          j += 2;
          continue;
        }
        j++;
      }
      if (end !== -1) {
        let tex = text.slice(i + 2, end);
        const lineStart = text.lastIndexOf("\n", i - 1) + 1;
        if (/^\s*>/.test(text.slice(lineStart, i))) tex = tex.replace(/\n\s*(>\s?)+/g, "\n");
        res += placeholder(tex.trim(), false);
        i = end + 2;
        continue;
      }
    }

    // Escaped characters (e.g. \$)
    if (c === "\\" && i + 1 < n) {
      res += c + text[i + 1];
      i += 2;
      continue;
    }

    // MathJax $$ ... $$
    if (c === "$") {
      if (text[i + 1] === "$") {
        let j = i + 2, end = -1;
        while (j < n - 1) {
          if (text[j] === "\\") { j += 2; continue; }
          if (text[j] === "$" && text[j + 1] === "$") { end = j; break; }
          j++;
        }
        if (end > i + 2) {
          let tex = text.slice(i + 2, end);
          const lineStart = text.lastIndexOf("\n", i - 1) + 1;
          if (/^\s*>/.test(text.slice(lineStart, i))) tex = tex.replace(/\n\s*(>\s?)+/g, "\n");
          res += placeholder(tex.trim(), true);
          i = end + 2;
          continue;
        }
        res += "$$"; i += 2; continue;
      }
      // Inline math: $ ... $ with non-space inside delimiters
      if (i + 1 < n && !/\s/.test(text[i + 1])) {
        let j = i + 1, end = -1;
        while (j < n) {
          const d = text[j];
          if (d === "\n") break;
          if (d === "\\") { j += 2; continue; }
          if (d === "$" && !/\s/.test(text[j - 1]) && !/\d/.test(text[j + 1] || "")) { end = j; break; }
          j++;
        }
        if (end > i + 1) {
          res += placeholder(text.slice(i + 1, end), false);
          i = end + 1;
          continue;
        }
      }
    }
    res += c;
    i++;
  }
  return res;
}

/** Swap placeholders for typeset SVG. Invalid TeX is shown as monospace source instead of failing the export. */
export function injectMath(root: HTMLElement): number {
  let failed = 0;
  root.querySelectorAll<HTMLElement>("[data-mdx-math]").forEach((ph) => {
    const display = ph.getAttribute("data-display") === "1";
    const tex = dec(ph.getAttribute("data-mdx-math") || "");
    let el: HTMLElement;
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = texToSvgHtml(tex, display);
      el = tmp.firstElementChild as HTMLElement;
    } catch (e) {
      failed++;
      console.warn("MathJax failed to typeset formula:", tex, e);
      el = document.createElement("code");
      el.className = "mdx-math-fallback";
      el.textContent = display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
    }
    const parent = ph.parentElement;
    if (display && parent && parent.tagName === "P" && parent.childNodes.length === 1) parent.replaceWith(el);
    else ph.replaceWith(el);
  });
  return failed;
}
