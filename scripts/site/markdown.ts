import { Marked, type Tokens } from "marked";
import { escapeXml } from "../../src/report/format.js";
import { flowchartSvg, parseFlowchart } from "./flowchart.js";

export const REPO_URL = "https://github.com/seanmcrae/workflow-radar";

/** Repository files that have their own page on the site; everything else links to GitHub. */
const SITE_PAGES: Record<string, string> = {
  "docs/PRODUCT.md": "product.html",
  "docs/sample-report/report.html": "report/report.html",
};

/**
 * Resolves a link written relative to the repository root (README) or to `docs/` (PRODUCT.md)
 * into a link that works from the site root.
 */
export function siteHref(href: string, fromDir: "" | "docs"): string {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return href;
  const [path = "", anchor] = href.split("#", 2);
  const segments: string[] = [...(fromDir === "" ? [] : [fromDir]), ...path.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  const repoPath = resolved.join("/");
  const suffix = anchor === undefined ? "" : `#${anchor}`;
  const page = SITE_PAGES[repoPath];
  if (page !== undefined) return page + suffix;
  const kind = path.endsWith("/") || repoPath === "" ? "tree" : "blob";
  return `${REPO_URL}/${kind}/main/${repoPath}${suffix}`;
}

/** A Mermaid diagram with an offline SVG fallback; the page script swaps in Mermaid's render. */
export function diagramHtml(source: string, title: string): string {
  return `<figure class="diagram">
<div class="diagram-render">${flowchartSvg(parseFlowchart(source), title)}</div>
<pre class="mermaid-source" hidden>${escapeXml(source.trim())}</pre>
</figure>`;
}

/** GitHub-style heading anchor, so `PRODUCT.md#section` links keep working on the site. */
export function slug(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");
}

export function renderMarkdown(markdown: string, fromDir: "" | "docs"): string {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === "link" || token.type === "image") {
        const link = token as Tokens.Link | Tokens.Image;
        link.href = siteHref(link.href, fromDir);
      }
    },
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug(text)}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        if (lang === "mermaid") return diagramHtml(text, "Architecture diagram");
        const cls = lang === undefined || lang === "" ? "" : ` class="language-${escapeXml(lang)}"`;
        return `<pre><code${cls}>${escapeXml(text)}</code></pre>\n`;
      },
    },
  });
  return marked.parse(markdown, { async: false });
}

/**
 * Returns the body of a `## heading` section (without the heading line), up to the next
 * heading of the same or higher level. Throws if the section is missing so a renamed README
 * heading fails the site build instead of silently dropping content.
 */
export function markdownSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  let inFence = false;
  let start = -1;
  let end = lines.length;
  for (const [i, line] of lines.entries()) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const match = /^(#{1,2}) (.+)$/.exec(line);
    if (match === null) continue;
    if (start === -1 && match[1] === "##" && match[2]?.trim() === heading) {
      start = i + 1;
    } else if (start !== -1) {
      end = i;
      break;
    }
  }
  if (start === -1) throw new Error(`README section not found: ${heading}`);
  return lines.slice(start, end).join("\n").trim();
}

/** Drops the leading `# title` line so a page can supply its own heading. */
export function withoutTitle(markdown: string): string {
  return markdown.replace(/^# .*\n+/, "");
}
