import { ExportOptions, Geometry, MM_TO_PX } from "./options";
import { STACK, getFontFaceCss } from "./fonts";

const FONTS = {
  serif: { body: STACK.serif, heading: STACK.serif },
  sans: { body: STACK.sans, heading: STACK.sans },
};

/** Print stylesheet: always light, book-style, independent of the user's Obsidian theme. */
export function buildCss(o: ExportOptions, g: Geometry): string {
  const f = FONTS[o.font];
  const ph = Math.floor(g.contentHmm * MM_TO_PX) - 12;
  const P = ".mdx-pbody";
  return `
${getFontFaceCss()}
.mdx-root{position:fixed;left:0;top:0;z-index:-1;pointer-events:none;}
.mdx-root *{box-sizing:border-box;}
.mdx-sheet{position:relative;overflow:hidden;background:#fff;color:#221f1a;font-size:16px;line-height:1.7;font-family:${f.body};}
.mdx-col{position:absolute;}
${P}{overflow:hidden;display:flow-root;color:#221f1a;font-family:${f.body};font-size:16px;line-height:1.7;
  ${o.justify ? "text-align:justify;hyphens:manual;" : ""}overflow-wrap:break-word;word-break:break-word;padding:0;margin:0;}
${P} p{margin:0 0 10px 0;}
${P} ul,${P} ol{margin:0 0 10px 0;padding-left:32px;list-style-position:outside;}
${P} ul ul,${P} ol ol,${P} ul ol,${P} ol ul{margin:4px 0;padding-left:28px;}
${P} li{margin:2px 0;}
${P} li[data-cont]{list-style:none;}
${P} h1,${P} h2,${P} h3,${P} h4,${P} h5,${P} h6{font-family:${f.heading};line-height:1.3;text-align:left;}
${P} h1{font-size:24px;font-weight:700;color:#1c2b3a;margin:22px 0 10px;padding-top:8px;border-top:2.5px solid #2c5f8a;}
${P} h2{font-size:19px;font-weight:700;color:#16324a;margin:18px 0 8px;padding:3px 0 6px;border-bottom:1.5px solid #ddd3bf;}
${P} h3{font-size:16px;font-weight:700;color:#3a352c;margin:14px 0 7px;}
${P} h4{font-size:13px;font-weight:700;color:#6b6154;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.6px;}
${P} h5,${P} h6{font-size:13px;font-weight:700;color:#6b6154;margin:10px 0 6px;}
${P}>*:first-child{margin-top:0 !important;}
${P} a{color:#2c5f8a;text-decoration:none;}
${P} a.internal-link{color:#6a3fbb;border-bottom:1px dotted #6a3fbb;font-weight:600;}
${P} a.tag{display:inline-block;background:#efe9dc;color:#4a4438;border-radius:10px;padding:1px 9px;font-size:.85em;font-weight:600;}
${P} hr{border:none;border-top:1px solid #ddd3bf;margin:20px 0;}
${P} strong.mdx-boxed,${P} b.mdx-boxed{background:#f5dd9a;padding:1px 6px;margin:0 1px;border-radius:4px;font-size:.95em;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
${P} mark{background:#f5dd9a;padding:0 3px;border-radius:2px;color:#221f1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
${P} del,${P} s{text-decoration:line-through !important;opacity:.65;}
${P} pre{background:#fbf9f4;border:1px solid #ddd3bf;border-radius:8px;padding:10px 14px;margin:14px 0;max-width:100%;white-space:pre-wrap;word-wrap:break-word;text-align:left;}
${P} pre code{background:transparent;padding:0;white-space:pre-wrap;color:#221f1a;}
${P} pre,${P} kbd,${P} samp{font-family:${STACK.mono};}
${P} code{font-family:${STACK.mono};font-size:13px;}
${P} p code,${P} li code,${P} td code{background:#efe9dc;padding:1px 5px;border-radius:3px;color:#8a3222;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
${P} kbd{background:#f4efe6;border:1px solid #c8bead;border-bottom:2px solid #a89e8d;border-radius:4px;padding:1px 5px;font-size:.85em;color:#221f1a;}
${P} abbr{text-decoration:underline dotted #6b6154;cursor:help;}
${P} table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px;table-layout:fixed;}
${P} th,${P} td{border:1px solid #ddd3bf;padding:9px 11px;text-align:left;overflow-wrap:break-word;word-break:break-word;vertical-align:top;}
${P} th[align="center"],${P} td[align="center"]{text-align:center;}
${P} th[align="right"],${P} td[align="right"]{text-align:right;}
${P} th[align="left"],${P} td[align="left"]{text-align:left;}
${P} th{background:#f1ece0;font-weight:700;color:#16324a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
${P} tbody tr:nth-child(even) td{background:#faf8f2;}
${P} img{max-width:100%;max-height:${ph}px;height:auto;object-fit:contain;border-radius:4px;}
${P} svg{max-width:100%;}
${P} blockquote{border-left:3.5px solid #cabfa4;margin:12px 0;padding:6px 18px;color:#5a5346;font-style:italic;background:#f6f2e9;border-radius:0 4px 4px 0;}
${P} blockquote blockquote{border-left-color:#b0a385;background:#eee8dc;margin:10px 0;}
${P} blockquote blockquote blockquote{border-left-color:#968867;background:#e6dfd1;margin:8px 0;}
${P} details{border:1px solid #ddd3bf;border-radius:8px;padding:10px 14px;margin:12px 0;background:#fbf9f4;}
${P} details summary{font-weight:700;cursor:default;margin-bottom:8px;color:#16324a;outline:none;list-style:none;}
${P} details summary::-webkit-details-marker{display:none;}
${P} details[open]{background:#fdfcf9;}
${P} .mermaid,${P} .block-language-mermaid{background:#fffdf9;border:1px solid #ddd3bf;border-radius:8px;padding:10px;margin:12px 0;text-align:center;}
${P} .mermaid svg{max-width:100% !important;max-height:${ph - 40}px;height:auto !important;display:block;margin:0 auto;}
/* callouts */
${P} .callout{--callout-color:68,138,255;border:1px solid rgba(var(--callout-color),.40);background:rgba(var(--callout-color),.09);
  border-radius:9px;padding:10px 14px;margin:14px 0;mix-blend-mode:normal;}
${P} .callout[data-callout="note"]{--callout-color:68,138,255;}
${P} .callout[data-callout="tip"],${P} .callout[data-callout="hint"]{--callout-color:0,191,165;}
${P} .callout[data-callout="warning"],${P} .callout[data-callout="caution"],${P} .callout[data-callout="attention"]{--callout-color:245,158,11;}
${P} .callout[data-callout="danger"],${P} .callout[data-callout="error"],${P} .callout[data-callout="bug"]{--callout-color:239,68,68;}
${P} .callout[data-callout="question"],${P} .callout[data-callout="help"],${P} .callout[data-callout="faq"]{--callout-color:217,119,6;}
${P} .callout[data-callout="example"]{--callout-color:139,92,246;}
${P} .callout[data-callout="abstract"],${P} .callout[data-callout="summary"],${P} .callout[data-callout="tldr"]{--callout-color:14,165,233;}
${P} .callout[data-callout="todo"]{--callout-color:68,138,255;}
${P} .callout[data-callout="success"],${P} .callout[data-callout="check"],${P} .callout[data-callout="done"]{--callout-color:16,185,129;}
${P} .callout[data-callout="info"]{--callout-color:2,136,209;}
${P} .callout[data-callout="quote"],${P} .callout[data-callout="cite"]{--callout-color:120,110,100;}
${P} .callout-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px;margin-bottom:6px;color:rgb(var(--callout-color));}
${P} .callout-icon{display:flex;flex:none;}
${P} .callout-icon svg{width:16px;height:16px;stroke:rgb(var(--callout-color));}
${P} .callout-fold{display:none !important;}
${P} .callout-content{padding:0;display:block !important;}
${P} .callout.is-collapsed .callout-content{display:block !important;}
${P} .callout-content>*:last-child{margin-bottom:0;}
${P} .markdown-embed{border:none;padding:0;margin:0;}
${P} .markdown-embed-title,${P} .markdown-embed-link{display:none;}
${P} .task-list-item,${P} li[data-task]{list-style:none !important;margin-left:-20px;}
${P} .task-list-item input[type=checkbox],${P} li[data-task] input[type=checkbox]{
  width:14px !important;
  height:14px !important;
  min-width:14px !important;
  min-height:14px !important;
  margin:0 8px 0 0 !important;
  vertical-align:middle !important;
  position:relative;
  top:-1px;
  background:transparent !important;
  border:none !important;
}
${P} .footnotes{font-size:12.5px;color:#6b6154;border-top:1px solid #ddd3bf;margin-top:20px;padding-top:10px;}
${P} .footnotes ol{padding-left:20px;}
${P} .footnotes li{margin-bottom:4px;}
${P} .footnote-link,${P} .footnote-ref{font-size:0.8em;vertical-align:super;text-decoration:none;color:#2c5f8a;font-weight:600;padding:0 1px;}
${P} .footnote-backref{text-decoration:none;font-size:0.8em;color:#888;margin-left:4px;}
${P} sup{font-size:0.75em;vertical-align:super;line-height:0;}
${P} sub{font-size:0.75em;vertical-align:sub;line-height:0;}
${P} *{font-family:inherit;}
${P} pre,${P} pre *,${P} code,${P} kbd,${P} samp{font-family:${STACK.mono} !important;}
${P} svg text,${P} svg tspan{font-family:${STACK.sans} !important;}
${P} button,${P} .copy-code-button,${P} .edit-block-button,${P} .heading-collapse-indicator,${P} .collapse-indicator{display:none !important;}
/* MathJax SVG containers — reset font-size to prevent inherited-size blowups on iOS */
${P} mjx-container{display:inline-block;direction:ltr;text-indent:0;text-align:left;line-height:0;font-size:1rem;}
${P} mjx-container[display="true"]{display:block;text-align:center;margin:10px 0;line-height:0;}
${P} mjx-container svg{overflow:visible;max-width:100%;vertical-align:middle;}
${P} mjx-container[display="true"] svg{height:auto;display:block;margin:0 auto;}
${P} .mdx-math-fallback{font-family:${STACK.mono};font-size:12px;color:#8a3222;background:#efe9dc;padding:2px 6px;border-radius:3px;display:inline-block;white-space:pre-wrap;}
/* title page + index */
.mdx-title-page{text-align:center;padding:70px 20px 46px;}
.mdx-title{font-family:${f.heading};font-size:32px;font-weight:700;color:#221f1a;letter-spacing:.3px;margin-bottom:10px;text-align:center;}
.mdx-subtitle{font-size:15px;color:#7a7264;font-style:italic;text-align:center;}
.mdx-title-rule{width:56px;height:2px;background:#b8934a;margin:24px auto;border-radius:1px;}
.mdx-toc{border-top:1.5px solid #2c3e50;border-bottom:1.5px solid #2c3e50;padding:16px 20px;margin-bottom:10px;background:#fff;text-align:left;}
.mdx-toc .toctitle{display:block;text-align:center;font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;color:#2c3e50;}
.mdx-toc ul{list-style:none;padding:0;margin:0;}
.mdx-toc li{margin:0 0 3px;line-height:1.35;}
.mdx-toc a{display:flex;align-items:baseline;text-decoration:none;color:#2980b9;font-weight:700;font-size:13.5px;border:none;}
.mdx-toc li.l2 a{font-weight:500;color:#555;font-size:12.5px;margin-left:18px;}
.mdx-toc li.l3 a{font-weight:500;color:#666;font-size:12px;margin-left:36px;}
.mdx-toc .t{flex:0 1 auto;}
.mdx-toc .lead{flex:1 1 auto;min-width:12px;margin:0 6px;border-bottom:1px dotted #b7ac96;transform:translateY(-3px);}
.mdx-toc .pn{flex:none;min-width:2.4em;text-align:right;color:#555;font-weight:600;}
/* sheet furniture */
.mdx-scratch-line{position:absolute;border-left:1.5px dashed #ccc;}
.mdx-scratch-label{position:absolute;text-align:center;font:12px ${STACK.sans};color:#999;}
.mdx-footer{position:absolute;left:40px;right:40px;bottom:22px;display:grid;grid-template-columns:1fr auto 1fr;align-items:baseline;
  font:700 13px ${STACK.sans};color:#666;}
.mdx-footer .l{text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-right:12px;}
.mdx-footer .c{text-align:center;}
.mdx-footer .r{text-align:right;font-weight:600;}
.mdx-footer .r a{color:#666;text-decoration:none;}
`;
}
