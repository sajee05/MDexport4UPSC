/**
 * Paginates rendered DOM into fixed-height page bodies. Blocks are kept whole
 * where possible; blocks taller than a page (long lists, tables, callouts) are
 * split across pages by cloning their wrapper ("shell") on each page.
 */
interface Level {
  tpl: Element;
  el: Element | null;
  done: number;
  started: boolean;
  head: Element | null;
}

const SPLITTABLE = new Set(["UL", "OL", "TABLE", "TBODY", "LI", "DIV", "BLOCKQUOTE", "SECTION", "DETAILS"]);
const HEADING = /^H[1-6]$/;

function splittable(n: Node): n is Element {
  if (n.nodeType !== 1) return false;
  const e = n as Element;
  if (!SPLITTABLE.has(e.tagName)) return false;
  if (e.matches(".mermaid, .block-language-mermaid, .math, mjx-container, .mdx-title-page")) return false;
  return e.childNodes.length > 0;
}

export class Flow {
  pages: HTMLElement[] = [];
  private stack: Level[] = [];
  private body!: HTMLElement;
  private placed = 0;

  constructor(private makeBody: () => HTMLElement, private chapterBreak: boolean) {
    this.newBody();
  }

  private newBody(): void {
    this.body = this.makeBody();
    this.pages.push(this.body);
    this.placed = 0;
  }

  private fits(): boolean {
    return this.body.scrollHeight <= this.body.clientHeight + 1;
  }

  private parent(): Element {
    return this.stack.length ? (this.stack[this.stack.length - 1].el as Element) : this.body;
  }

  private instantiate(lvl: Level): void {
    const el = lvl.tpl.cloneNode(false) as Element;
    if (lvl.started) {
      el.removeAttribute("id");
      if (lvl.tpl.tagName === "LI") el.setAttribute("data-cont", "1");
      if (lvl.tpl.tagName === "OL") (el as HTMLOListElement).start = ((lvl.tpl as HTMLOListElement).start || 1) + lvl.done;
    }
    lvl.started = true;
    lvl.el = el;
    this.parent().appendChild(el);
    if (lvl.head) el.appendChild(lvl.head.cloneNode(true));
  }

  /** Start a new page, re-opening every wrapper that is mid-split. */
  breakPage(keepHeading: boolean): void {
    const prev = this.body;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const lvl = this.stack[i];
      const el = lvl.el;
      if (el && el.childNodes.length <= (lvl.head ? 1 : 0)) el.remove();
    }
    let moved: Element | null = null;
    if (keepHeading && this.placed > 1) {
      const last = prev.lastElementChild;
      if (last && HEADING.test(last.tagName)) {
        moved = last;
        last.remove();
      }
    }
    this.newBody();
    const saved = this.stack;
    this.stack = [];
    for (const lvl of saved) {
      this.instantiate(lvl);
      this.stack.push(lvl);
    }
    if (moved) {
      this.body.insertBefore(moved, this.body.firstChild);
      this.placed = 1;
    }
  }

  /** Place one top-level node (may recurse for splitting). */
  add(node: Node): void {
    const top = this.stack.length === 0;
    const el = node.nodeType === 1 ? (node as Element) : null;
    if (top && this.chapterBreak && el && el.tagName === "H1" && this.placed > 0) this.breakPage(false);
    this.place(node);
    if (top && el && el.hasAttribute("data-break-after")) this.breakPage(false);
  }

  private place(node: Node): void {
    const par = this.parent();
    par.appendChild(node);
    if (this.fits()) { this.placed++; return; }
    par.removeChild(node);

    // If it's a splittable container (list, table, blockquote, div), split its children across pages
    if (splittable(node)) {
      this.split(node);
      return;
    }

    if (this.placed > 0) {
      this.breakPage(true);
      this.parent().appendChild(node);
      if (this.fits()) { this.placed++; return; }
      this.parent().removeChild(node);
    }

    // Atomic and taller than a page: keep it, the page clips it.
    this.parent().appendChild(node);
    this.placed++;
  }

  private split(node: Element): void {
    const lvl: Level = {
      tpl: node, el: null, done: 0, started: false,
      head: node.tagName === "TABLE" ? node.querySelector(":scope > thead") : null,
    };
    this.instantiate(lvl);
    this.stack.push(lvl);
    const kids = Array.from(node.childNodes);
    for (const c of kids) {
      if (lvl.head && c === lvl.head) continue;
      if (c.nodeType === 3 && !(c.textContent || "").trim()) continue;
      this.place(c);
      if (c.nodeType === 1 && (c as Element).tagName === "LI") lvl.done++;
    }
    this.stack.pop();
    if (lvl.el && lvl.el.childNodes.length <= (lvl.head ? 1 : 0)) lvl.el.remove();
  }

  /** Drop any empty or blank pages. */
  finish(): HTMLElement[] {
    const validPages: HTMLElement[] = [];
    for (const p of this.pages) {
      const hasContent = (p.textContent || "").trim().length > 0 || p.querySelector("svg, img, input, table, hr") !== null;
      if (hasContent) {
        validPages.push(p);
      } else {
        p.remove();
      }
    }
    this.pages = validPages;
    return this.pages;
  }
}
