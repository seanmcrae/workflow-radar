import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSite } from "../scripts/site/build.js";
import { intervalChartSvg, niceStep } from "../scripts/site/charts.js";
import { assignLayers, flowchartSvg, parseFlowchart } from "../scripts/site/flowchart.js";
import {
  REPO_URL,
  markdownSection,
  renderMarkdown,
  siteHref,
  withoutTitle,
} from "../scripts/site/markdown.js";

const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

function readmeMermaid(): string {
  const match = /```mermaid\n([\s\S]*?)```/.exec(readme);
  if (match?.[1] === undefined) throw new Error("README has no mermaid block");
  return match[1];
}

describe("flowchart fallback", () => {
  it("parses every node and edge of the README architecture diagram", () => {
    const chart = parseFlowchart(readmeMermaid());
    expect(chart.nodes.size).toBe(11);
    expect(chart.edges).toHaveLength(10);
    expect(chart.nodes.get("parse")).toEqual(["parse: NotesProvider", "mock | anthropic | openai"]);
  });

  it("layers every edge downward and pulls inputs next to the step they feed", () => {
    const chart = parseFlowchart(readmeMermaid());
    const layers = assignLayers(chart);
    for (const { from, to } of chart.edges) {
      expect(layers.get(to)).toBeGreaterThan(layers.get(from) ?? Number.POSITIVE_INFINITY);
    }
    expect(layers.get("cfg")).toBe((layers.get("score") ?? 0) - 1);
    expect(layers.get("yaml")).toBe((layers.get("load") ?? 0) - 1);
  });

  it("renders escaped labels and one arrow per edge", () => {
    const svg = flowchartSvg(parseFlowchart('a["A & B"] --> b\nb --> c'), "t");
    expect(svg).toContain("A &amp; B");
    expect(svg.match(/marker-end/g)).toHaveLength(2);
  });

  it("rejects syntax it does not understand and cycles", () => {
    expect(() => parseFlowchart("a -.-> b")).toThrow(/unsupported flowchart line/);
    expect(() => assignLayers(parseFlowchart("a --> b\nb --> a"))).toThrow(/cycle/);
  });
});

describe("markdown rendering", () => {
  it("maps repository links to site pages or GitHub", () => {
    expect(siteHref("docs/PRODUCT.md", "")).toBe("product.html");
    expect(siteHref("docs/sample-report/", "")).toBe(`${REPO_URL}/tree/main/docs/sample-report`);
    expect(siteHref("LICENSE", "")).toBe(`${REPO_URL}/blob/main/LICENSE`);
    expect(siteHref("../README.md#data", "docs")).toBe(`${REPO_URL}/blob/main/README.md#data`);
    expect(siteHref("https://example.com/x", "")).toBe("https://example.com/x");
    expect(siteHref("#quickstart", "")).toBe("#quickstart");
  });

  it("renders GFM tables, escapes code, and replaces mermaid blocks with a diagram", () => {
    const html = renderMarkdown(
      "| a | b |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst x = a < b;\n```\n\n```mermaid\nflowchart LR\n  a --> b\n```\n",
      "",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("a &lt; b");
    expect(html).toContain('<figure class="diagram">');
    expect(html).toContain("<svg");
  });

  it("extracts README sections and ignores headings inside code fences", () => {
    expect(markdownSection("## A\none\n```\n## B\n```\n## C\ntwo", "A")).toBe(
      "one\n```\n## B\n```",
    );
    expect(() => markdownSection(readme, "No such section")).toThrow(/not found/);
    expect(withoutTitle("# Title\n\nbody")).toBe("body");
  });
});

describe("charts", () => {
  it("picks 1-2-5 tick steps", () => {
    expect(niceStep(600_000)).toBe(200_000);
    expect(niceStep(45)).toBe(10);
    expect(niceStep(0)).toBe(1);
  });

  it("refuses to draw an empty interval chart", () => {
    expect(() => intervalChartSvg([], "USD")).toThrow(/at least one/);
  });
});

describe("site build", () => {
  it("writes an offline site whose embedded report matches the committed sample", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "workflow-radar-site-")), "site");
    const site = await buildSite(out);
    for (const file of site.files) expect(existsSync(join(out, file)), file).toBe(true);

    for (const file of ["report.html", "report.md", "audit.json", "quadrant.svg"]) {
      expect(readFileSync(join(out, "report", file), "utf8"), file).toBe(
        readFileSync(join(root, "docs", "sample-report", file), "utf8"),
      );
    }

    const index = readFileSync(join(out, "index.html"), "utf8");
    expect(index).toContain('<iframe class="report" src="report/report.html"');
    expect(index).toContain("Customer support triage: Draft first response");
    expect(index).toContain("Synthetic data.");
    // Only the optional Mermaid enhancement may reach the network; no external CSS, images, or scripts.
    expect(index).not.toMatch(/<(link|img|script)[^>]+(href|src)="https?:/);
    expect(index.match(/https:\/\/cdn\./g)).toHaveLength(1);

    const product = readFileSync(join(out, "product.html"), "utf8");
    expect(product).toContain("<h2>Success metrics and evals</h2>");
  }, 60_000);
});
