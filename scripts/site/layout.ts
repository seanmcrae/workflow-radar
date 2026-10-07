import { escapeXml } from "../../src/report/format.js";
import { VERSION } from "../../src/version.js";
import { REPO_URL } from "./markdown.js";

const CSS = `
:root { color-scheme: light; --ink: #111827; --muted: #6b7280; --line: #e5e7eb; --accent: #4f46e5; --soft: #f9fafb; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: var(--ink); background: #fff; }
a { color: var(--accent); }
header.top { position: sticky; top: 0; z-index: 2; background: rgba(255,255,255,.95); border-bottom: 1px solid var(--line); }
header.top nav { max-width: 1080px; margin: 0 auto; padding: 10px 24px; display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; font-size: 14px; }
header.top a { color: var(--ink); text-decoration: none; } header.top a:hover, header.top a.active { color: var(--accent); }
header.top .brand { font-weight: 700; margin-right: auto; }
main { max-width: 1080px; margin: 0 auto; padding: 0 24px 64px; }
section { padding-top: 24px; }
h1 { font-size: 40px; line-height: 1.15; margin: 40px 0 12px; letter-spacing: -0.02em; }
h2 { font-size: 26px; margin: 40px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 19px; margin: 28px 0 8px; }
.lede { font-size: 20px; color: #374151; max-width: 760px; margin: 0 0 16px; }
.muted { color: var(--muted); font-size: 14px; }
.banner { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 14px; font-size: 15px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0 8px; }
.button { display: inline-block; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--accent); text-decoration: none; font-weight: 600; font-size: 15px; }
.button.primary { background: var(--accent); color: #fff; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 20px 0; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; background: var(--soft); font-size: 14px; color: #374151; }
.card b { display: block; font-size: 26px; color: var(--ink); }
figure { margin: 20px 0; } figcaption { color: var(--muted); font-size: 14px; margin-top: 6px; }
svg { max-width: 100%; height: auto; display: block; }
.diagram { border: 1px solid var(--line); border-radius: 10px; padding: 16px; overflow-x: auto; }
.diagram svg { margin: 0 auto; }
pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.45; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
:not(pre) > code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 14px; display: block; overflow-x: auto; }
th, td { border-bottom: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
th { background: #f3f4f6; font-weight: 600; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; padding: 0; list-style: none; }
.features li { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.features b { display: block; }
iframe.report { width: 100%; height: 900px; border: 1px solid var(--line); border-radius: 10px; }
details { margin: 12px 0; } summary { cursor: pointer; font-weight: 600; }
footer { border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
footer div { max-width: 1080px; margin: 0 auto; padding: 18px 24px; }
article.doc { max-width: 900px; }
`;

/**
 * Progressive enhancement: replace the offline SVG with Mermaid's own rendering when the CDN is
 * reachable. Any failure (offline, blocked, parse error) leaves the fallback in place.
 */
const MERMAID_SCRIPT = `<script type="module">
const figures = document.querySelectorAll("figure.diagram");
if (figures.length > 0) {
  try {
    const { default: mermaid } = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
    let n = 0;
    for (const figure of figures) {
      const source = figure.querySelector(".mermaid-source");
      const target = figure.querySelector(".diagram-render");
      if (!source || !target) continue;
      const { svg } = await mermaid.render("mermaid-" + n++, source.textContent);
      target.innerHTML = svg;
    }
  } catch (error) {
    console.info("Mermaid unavailable; showing the pre-rendered diagram.", error);
  }
}
</script>`;

export interface NavItem {
  href: string;
  label: string;
}

export const NAV: NavItem[] = [
  { href: "index.html#quickstart", label: "Quickstart" },
  { href: "index.html#results", label: "Results" },
  { href: "index.html#sample-report", label: "Sample report" },
  { href: "index.html#architecture", label: "Architecture" },
  { href: "index.html#limitations", label: "Limitations" },
  { href: "product.html", label: "Product brief" },
];

export function page(opts: {
  title: string;
  description: string;
  body: string;
  active?: string;
  diagrams?: boolean;
}): string {
  const nav = NAV.map(
    (item) =>
      `<a href="${item.href}"${item.href === opts.active ? ' class="active"' : ""}>${escapeXml(item.label)}</a>`,
  ).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(opts.title)}</title>
<meta name="description" content="${escapeXml(opts.description)}">
<style>${CSS}</style>
</head>
<body>
<header class="top"><nav>
<a class="brand" href="index.html">workflow-radar</a>
${nav}
<a href="${REPO_URL}">GitHub</a>
</nav></header>
<main>
${opts.body}
</main>
<footer><div>workflow-radar ${VERSION} · MIT License · Sean McRae · <a href="${REPO_URL}">${REPO_URL.replace("https://", "")}</a> · This site is generated by <code>npm run site</code> from the code and the bundled synthetic examples.</div></footer>
${opts.diagrams === true ? MERMAID_SCRIPT : ""}
</body>
</html>
`;
}
