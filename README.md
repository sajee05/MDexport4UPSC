# MD Export for UPSC

Export any Obsidian note to a clean, book-style **PDF that works on iPad, iPhone and desktop** — with math, tables, callouts and diagrams that stay exactly as they look in Obsidian. Built for study notes you want to annotate in GoodNotes.

This is the mobile-friendly successor to a desktop Markdown→PDF script. It needs no Python, browser or server: everything runs inside Obsidian.

## Features

- **Faithful rendering** – uses Obsidian's own renderer, so LaTeX math, sub/superscripts, arrows, tables, callouts, task lists, footnotes, highlights, code blocks and Mermaid flowcharts match your note.
- **Always light and print-ready**, whatever theme you use.
- **Title page and clickable index** with dotted leaders and page numbers.
- **PDF bookmarks** (outline) and working internal/external links.
- **Scratchpad margin (1:5)** for handwritten notes, **1-up or 2-up** sheets.
- **Optional diagonal watermark** (text, opacity and size are yours to set; empty by default).
- Paper sizes: A4, A3, A5, Letter, Legal. Book (serif) or Modern (sans) fonts, justified text, optional page break per chapter.
- Short bold terms get a soft highlight box, as in the original script.
- Long lists, tables and callouts split cleanly across pages (table headers repeat).

## Use

1. Open a note → ribbon icon **Export note to PDF**, or command palette → *Export current note to PDF*, or the file's context menu.
2. Adjust options → **Export PDF**.
3. The PDF is saved next to the note (or in the folder set in plugin settings) and opened. On iPad, open the file, tap **Share** and send it to GoodNotes.

## Install

**Once listed in Community plugins:** Settings → Community plugins → Browse → *MD Export for UPSC*.

**Before that (BRAT):** install the *BRAT* plugin, then *Add beta plugin* → `sajee05/MDexport4UPSC`.

**Manual (works on iPad via the Files app):** download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/sajee05/MDexport4UPSC/releases/latest) into `<vault>/.obsidian/plugins/md-export-for-upsc/`, then enable the plugin.

## Notes and limits

- Pages are rendered as high-resolution images (Quality setting) so layout is identical on every device. Text in the PDF is therefore **not selectable/searchable**; links and bookmarks are real.
- Very large documents on iPad use a lot of memory. If an export fails, lower *Quality* or export fewer chapters at a time.
- Mermaid diagram labels are converted to plain SVG text for reliable rendering on Safari, so very long labels may not wrap.
- A single code block taller than one page is clipped.

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
