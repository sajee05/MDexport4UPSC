# MD Export for UPSC

Export any Obsidian note to a clean, book-style **PDF that works on iPad, iPhone and desktop** — with math, tables, callouts and diagrams that stay exactly as they look in Obsidian. Built for study notes you want to annotate in GoodNotes.

This is the mobile-friendly successor to a desktop Markdown→PDF script. It needs no Python, browser or server: everything runs inside Obsidian.

## Features

- **Real PDF, not screenshots** – text is selectable and searchable, math and diagrams are vector graphics, and files stay small and sharp at any zoom.
- **LaTeX / MathJax** – `$inline$`, `$$display$$`, `\(inline\)` and `\[display\]` math is typeset by a bundled MathJax engine (AMS, matrices, determinants, cases, aligned equations, Greek notation, blackboard bold, physics/economics notation, chemistry, `\cancel`, `\boxed`, etc.). Invalid formulas are left as source instead of breaking the export.
- **Obsidian & HTML rendering for everything else** – Mermaid flowcharts and sequence diagrams (rendered via built-in engine even if Obsidian doesn't render them in source mode), tables with column alignment, all Obsidian callout styles (note, tip, warning, danger, question, example, abstract, todo, success, info, quote), auto-expanded collapsible callouts and `<details>`, task lists, footnotes, highlights (`==text==` and `<mark>`), `<kbd>`, `<sup>`, `<sub>`, `<abbr>`, nested blockquotes, and code blocks.
- **Bundled fonts** (Noto Serif/Sans/Mono, plus Devanagari) so output is identical on every device.
- **Always light and print-ready**, whatever theme you use.
- **Title page and clickable index** with dotted leaders and page numbers.
- **PDF bookmarks** (outline) and working internal/external links.
- **Scratchpad margin (1:5)** for handwritten notes, **1-up or 2-up** sheets.
- **Optional diagonal watermark** (text, opacity and size are yours to set; empty by default).
- Paper sizes: A4, A3, A5, Letter, Legal. Book (serif) or Modern (sans) fonts, justified text, optional page break per chapter.
- Short bold terms get a soft highlight box, as in the original script.
- Long lists, tables and callouts split cleanly across pages (table headers repeat).

## Use

1. Open any note on iPhone, iPad, or desktop.
2. Tap the note's three-dot menu (`...`) and choose **print UPSC - MD to PDF**, or use the command palette (`print UPSC - MD to PDF`), ribbon icon, or right-click file/editor menu.
3. Adjust options if desired → **Export PDF**.
4. The PDF is saved next to the note (or in the folder set in plugin settings) and opened. On iPad/iPhone, tap **Share** and send it directly to GoodNotes or Files.

## Install

**Once listed in Community plugins:** Settings → Community plugins → Browse → *MD Export for UPSC*.

**Before that (BRAT):** install the *BRAT* plugin, then *Add beta plugin* → `sajee05/MDexport4UPSC`.

**Manual (works on iPad via the Files app):** download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/sajee05/MDexport4UPSC/releases/latest) into `<vault>/.obsidian/plugins/md-export-for-upsc/`, then enable the plugin.

## Notes and limits

- Layout comes from the device's own browser engine; fonts are bundled so it is consistent across iPad and desktop.
- Hindi (Devanagari) words are embedded as sharp images, because complex-script shaping can't be reproduced reliably in PDF text. They are not selectable. Emoji are handled the same way. Latin, Greek, Cyrillic, symbols and math are real text/vectors.
- Mermaid diagram labels are converted to plain SVG text for reliable rendering, so very long labels may not wrap.
- A single code block taller than one page is clipped.
- The plugin is about 5 MB because it bundles MathJax and fonts.

## Footer

The footer shows your title (left), page number (centre) and a fixed link to [pyq-project.in](https://pyq-project.in) (right). The link is built in and is not configurable; every other mark (title, watermark) is yours to fill.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production bundle
```

Releases are created by pushing a version tag (`npm version patch && git push --follow-tags`); the workflow attaches `main.js`, `manifest.json` and `styles.css`.

## License

MIT
