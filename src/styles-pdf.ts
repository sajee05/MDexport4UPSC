import { ExportOptions, Geometry, MM_TO_PX } from "./options";

const FONTS = {
  serif: {
    body: "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Times New Roman',serif",
    heading: "Georgia,'Times New Roman',serif",
  },
  sans: {
    body: "-apple-system,'Segoe UI','Helvetica Neue',Arial,sans-serif",
    heading: "-apple-system,'Segoe UI',Arial,sans-serif",
  },
};

/** Print stylesheet: always light, book-style, independent of the user's Obsidian theme. */
export function buildCss(o: ExportOptions, g: Geometry): string {
  const f = FONTS[o.font];
  const ph = Math.floor(g.contentHmm * MM_TO_PX) - 12;
  const P = ".mdx-pbody";
  return `
.mdx-root{position:fixed;left:0;top:0;z-index:-1;pointer-events:none;}
.mdx-root *{box-sizing:border-box;}
.mdx-sheet{position:relative;overflow:hidden;background:#fff;color:#221f1a;font-size:16px;line-height:1.7;font-family:${f.body};}
.mdx-col{position:absolute;}
${P}{overflow:hidden;display:flow-root;color:#221f1a;font-family:${f.body};font-size:16px;line-height:1.7;
  ${o.justify ? "text-align:justify;hyphens:auto;-webkit-hyphens:auto;" : ""}overflow-wrap:break-word;word-break:break-word;padding:0;margin:0;}
${P} p{margin:0 0 14px 0;}
${P} ul,${P} ol{margin:0 0 14px 0;padding-left:32px;list-style-position:outside;}
${P} ul ul,${P} ol ol,${P} ul ol,${P} ol ul{margin:4px 0;padding-left:28px;}
${P} li{margin:3px 0;}
${P} li[data-cont]{list-style:none;}
${P} h1,${P} h2,${P} h3,${P} h4,${P} h5,${P} h6{font-family:${f.heading};line-height:1.3;text-align:left;}
${P} h1{font-size:24px;font-weight:700;color:#1c2b3a;margin:32px 0 14px;padding-top:14px;border-top:2.5px solid #2c5f8a;}
${P} h2{font-size:19px;font-weight:700;color:#16324a;margin:28px 0 12px;padding:4px 0 8px;border-bottom:1.5px solid #ddd3bf;}
${P} h3{font-size:16px;font-weight:700;color:#3a352c;margin:22px 0 10px;}
${P} h4{font-size:13px;font-weight:700;color:#6b6154;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.6px;}
${P} h5,${P} h6{font-size:13px;font-weight:700;color:#6b6154;margin:14px 0 8px;}
${P}>*:first-child{margin-top:0 !important;}
${P} a{color:#2c5f8a;text-decoration:none;}
${P} a.internal-link{color:#6a3fbb;border-bottom:1px dotted #6a3fbb;font-weight:600;}
${P} a.tag{display:inline-block;background:#efe9dc;color:#4a4438;border-radius:10px;padding:1px 9px;font-size:.85em;font-weight:600;}
${P} hr{border:none;border-top:1px solid #ddd3bf;margin:30px 0;}
${P} strong.mdx-boxed,${P} b.mdx-boxed{background:#f5dd9a;padding:1px 6px;margin:0 1px;border-radius:4px;font-size:.95em;font-weight:800;}
${P} mark{background:#f5dd9a;padding:0 2px;border-radius:2px;color:#221f1a;}
${P} del{opacity:.65;}
${P} pre{background:#fbf9f4;border:1px solid #ddd3bf;border-radius:8px;padding:14px 16px;margin:20px 0;max-width:100%;white-space:pre-wrap;word-wrap:break-word;text-align:left;}
${P} pre code{background:transparent;padding:0;white-space:pre-wrap;color:#221f1a;}
${P} code{font-family:'SF Mono',Menlo,Consolas,monospace;font-size:13px;}
${P} p code,${P} li code,${P} td code{background:#efe9dc;padding:1px 5px;border-radius:3px;color:#8a3222;}
${P} table{width:100%;border-collapse:collapse;margin:22px 0;font-size:13.5px;table-layout:fixed;}
${P} th,${P} td{border:1px solid #ddd3bf;padding:9px 11px;text-align:left;overflow-wrap:break-word;word-break:break-word;vertical-align:top;}
${P} th{background:#f1ece0;font-weight:700;color:#16324a;}
${P} tbody tr:nth-child(even) td{background:#faf8f2;}
${P} img{max-width:100%;max-height:${ph}px;height:auto;object-fit:contain;border-radius:4px;}
${P} svg{max-width:100%;}
${P} blockquote{border-left:3px solid #cabfa4;margin:18px 0;padding:4px 18px;color:#5a5346;font-style:italic;background:#f6f2e9;}
${P} .math-block,${P} mjx-container[display="true"]{text-align:center;margin:12px 0;overflow:hidden;}
${P} mjx-container{font-size:105%;}
${P} .mermaid,${P} .block-language-mermaid{background:#fffdf9;border:1px solid #ddd3bf;border-radius:8px;padding:16px;margin:20px 0;text-align:center;}
${P} .mermaid svg{max-width:100% !important;max-height:${ph - 40}px;height:auto !important;display:block;margin:0 auto;}
${P} .callout{border:1px solid rgba(var(--callout-color,68,138,255),.40);background:rgba(var(--callout-color,68,138,255),.09);
  border-radius:9px;padding:13px 18px;margin:22px 0;mix-blend-mode:normal;}
${P} .callout-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px;margin-bottom:6px;color:rgb(var(--callout-color,68,138,255));}
${P} .callout-icon{display:flex;flex:none;}
${P} .callout-icon svg{width:16px;height:16px;}
${P} .callout-fold{display:none;}
${P} .callout-content{padding:0;}
${P} .callout-content>*:last-child{margin-bottom:0;}
${P} .markdown-embed{border:none;padding:0;margin:0;}
${P} .markdown-embed-title,${P} .markdown-embed-link{display:none;}
${P} .task-list-item{list-style:none;margin-left:-22px;}
${P} .task-list-item input[type=checkbox]{margin-right:8px;}
${P} .footnotes{font-size:12.5px;color:#6b6154;border-top:1px solid #ddd3bf;margin-top:30px;padding-top:10px;}
${P} sup,${P} sub{line-height:0;}
/* title page + index */
.mdx-title-page{text-align:center;padding:70px 20px 46px;}
.mdx-title{font-family:${f.heading};font-size:32px;font-weight:700;color:#221f1a;letter-spacing:.3px;margin-bottom:10px;text-align:center;}
.mdx-subtitle{font-size:15px;color:#7a7264;font-style:italic;text-align:center;}
.mdx-title-rule{width:56px;height:2px;background:#b8934a;margin:24px auto;border-radius:1px;}
.mdx-toc{border-top:2px solid #2c3e50;border-bottom:2px solid #2c3e50;padding:25px;margin-bottom:10px;background:#fff;text-align:left;}
.mdx-toc .toctitle{display:block;text-align:center;font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:3px;margin-bottom:20px;color:#2c3e50;}
.mdx-toc ul{list-style:none;padding:0;margin:0;}
.mdx-toc li{margin:0 0 7px;line-height:1.5;}
.mdx-toc a{display:flex;align-items:baseline;text-decoration:none;color:#2980b9;font-weight:700;font-size:15px;border:none;}
.mdx-toc li.l2 a{font-weight:500;color:#555;font-size:13.5px;margin-left:22px;}
.mdx-toc li.l3 a{font-weight:500;color:#666;font-size:13px;margin-left:44px;}
.mdx-toc .t{flex:0 1 auto;}
.mdx-toc .lead{flex:1 1 auto;min-width:12px;margin:0 6px;border-bottom:1px dotted #b7ac96;transform:translateY(-3px);}
.mdx-toc .pn{flex:none;min-width:2.4em;text-align:right;color:#555;font-weight:600;}
/* sheet furniture */
.mdx-scratch-line{position:absolute;border-left:1.5px dashed #ccc;}
.mdx-scratch-label{position:absolute;text-align:center;font:12px Helvetica,Arial,sans-serif;color:#999;}
.mdx-wm{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.mdx-wm span{display:block;white-space:nowrap;transform:rotate(-45deg);font:700 ${o.wmSize}px Helvetica,Arial,sans-serif;color:rgb(128,128,128);opacity:${Math.max(1, Math.min(100, o.wmOpacity)) / 100};}
.mdx-footer{position:absolute;left:40px;right:40px;bottom:22px;display:grid;grid-template-columns:1fr auto 1fr;align-items:baseline;
  font:700 13px Helvetica,Arial,sans-serif;color:#666;}
.mdx-footer .l{text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-right:12px;}
.mdx-footer .c{text-align:center;}
.mdx-footer .r{text-align:right;font-weight:600;}
.mdx-footer .r a{color:#666;text-decoration:none;}
`;
}
