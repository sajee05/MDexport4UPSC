import { loadMermaid } from "obsidian";

async function getMermaidInstance(): Promise<any> {
  try {
    if (typeof (window as any).mermaid !== "undefined") {
      return (window as any).mermaid;
    }
    if (typeof loadMermaid === "function") {
      const m = await Promise.race([
        loadMermaid(),
        new Promise<null>((r) => setTimeout(() => r(null), 800)),
      ]);
      if (m) return m;
    }
  } catch (e) {
    console.warn("loadMermaid() call failed:", e);
  }
  return (window as any).mermaid || null;
}

export async function renderRemainingMermaid(stage: HTMLElement): Promise<void> {
  const candidates: HTMLElement[] = [];

  // Match all potential mermaid elements rendered by Obsidian or markdown
  stage.querySelectorAll<HTMLElement>(
    ".mermaid, .block-language-mermaid, div[data-lang='mermaid'], pre:has(code.language-mermaid), pre > code.language-mermaid"
  ).forEach((el) => {
    const target = el.tagName === "CODE" && el.parentElement?.tagName === "PRE" ? el.parentElement : el;
    if (!candidates.includes(target)) candidates.push(target);
  });

  if (!candidates.length) return;

  let mermaid: any = null;
  try {
    mermaid = await getMermaidInstance();
  } catch {
    mermaid = null;
  }

  for (const el of candidates) {
    if (el.querySelector("svg")) {
      el.classList.remove("is-loading");
      continue;
    }

    let code = (el.textContent || "").trim();
    // Strip markdown code fences if present
    code = code.replace(/^```(?:mermaid)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    if (!code) {
      el.classList.remove("is-loading");
      continue;
    }

    let rendered = false;
    if (mermaid) {
      try {
        if (typeof mermaid.initialize === "function") {
          mermaid.initialize({
            startOnLoad: false,
            theme: "neutral",
            fontFamily: "'MDX Sans', sans-serif",
            securityLevel: "loose",
          });
        }
        const id = "mdx-mmd-" + Math.random().toString(36).slice(2, 9);
        const res = await Promise.race([
          mermaid.render(id, code),
          new Promise<null>((r) => setTimeout(() => r(null), 1200)),
        ]);
        const svg = typeof res === "string" ? res : res?.svg;
        if (svg) {
          const container = document.createElement("div");
          container.className = "mermaid block-language-mermaid";
          container.innerHTML = svg;
          el.replaceWith(container);
          rendered = true;
          continue;
        }
      } catch (err) {
        console.warn("Mermaid failed to render diagram:", err);
      }
    }

    if (!rendered) {
      // Fallback: render clean formatted code block so layout never breaks or hangs
      const fallback = document.createElement("div");
      fallback.className = "mermaid block-language-mermaid";
      const pre = document.createElement("pre");
      pre.style.cssText = "font-size:12px;text-align:left;background:#fbf9f4;padding:12px;border:1px solid #ddd3bf;border-radius:6px;margin:0;";
      const codeEl = document.createElement("code");
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      fallback.appendChild(pre);
      el.replaceWith(fallback);
    }
  }

  // Remove any remaining .is-loading anywhere in stage
  stage.querySelectorAll(".is-loading").forEach((e) => e.classList.remove("is-loading"));
}
