import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { parseWorkflow } from "../src/domain/load.js";
import { runAudit, type AuditResult } from "../src/prioritize/audit.js";
import { money, months, rangeText } from "../src/report/format.js";
import { renderHtml } from "../src/report/html.js";
import { renderMarkdown, type ReportMeta } from "../src/report/markdown.js";
import { roadmap, summarize } from "../src/report/summary.js";
import { quadrantSvg } from "../src/report/svg.js";
import { toJson } from "../src/report/write.js";
import { makeWorkflow } from "./helpers.js";

const meta: ReportMeta = {
  title: "Test audit",
  generator: "workflow-radar test",
  sources: ["a.yaml"],
  quadrantImage: "quadrant.svg",
};

function audit(overrides: Record<string, unknown> = {}): AuditResult {
  const workflow = parseWorkflow(
    makeWorkflow({
      synthetic: true,
      volumePerMonth: 4000,
      steps: [
        {
          id: "extract",
          name: "Extract <PO> & totals | lines",
          actor: "Clerk",
          durationMinutes: 8,
          judgmentLevel: "low",
          dataReadiness: "high",
        },
        {
          id: "tag",
          name: "Tag request",
          actor: "Clerk",
          durationMinutes: 1,
          judgmentLevel: "low",
          dataReadiness: "high",
        },
        {
          id: "ship",
          name: "Ship box",
          actor: "Clerk",
          durationMinutes: 5,
          taskType: "other",
          judgmentLevel: "low",
          dataReadiness: "high",
        },
      ],
      ...overrides,
    }),
  );
  return runAudit([workflow], { ...DEFAULT_CONFIG, simulation: { iterations: 500, seed: 1 } });
}

describe("formatting", () => {
  it("formats money, payback, and ranges", () => {
    expect(money(1234.6, "USD")).toBe("$1,235");
    expect(money(-50, "EUR")).toBe("-€50");
    expect(months(Infinity)).toBe("no payback");
    expect(months(500)).toBe("> 120 mo");
    expect(months(3.25)).toBe("3.3 mo");
    expect(rangeText({ low: 5, likely: 5, high: 5 })).toBe("5");
    expect(rangeText({ low: 1000, likely: 1500, high: 2000 })).toBe("1,500 (1,000–2,000)");
  });
});

describe("summary and roadmap", () => {
  it("groups recommended opportunities into phases and lists the rest", () => {
    const result = audit();
    const phases = roadmap(result);
    expect(phases.map((p) => p.key)).toEqual(["now", "next", "later", "park"]);
    const placed = phases.flatMap((p) => p.opportunities.map((o) => o.stepId));
    expect(placed.sort()).toEqual(["extract", "tag"]);
    const summary = summarize(result);
    expect(summary.recommended).toBe(2);
    expect(summary.notRecommended.map((o) => o.stepId)).toEqual(["ship"]);
    expect(summary.syntheticWorkflows).toBe(1);
  });

  it("refuses to sum across currencies", () => {
    const usd = parseWorkflow(makeWorkflow());
    const eur = parseWorkflow(makeWorkflow({ id: "eur-workflow", currency: "EUR" }));
    const result = runAudit([usd, eur], DEFAULT_CONFIG);
    expect(() => summarize(result)).toThrow(/one currency; found USD, EUR/);
  });
});

describe("quadrantSvg", () => {
  const svg = quadrantSvg(audit());

  it("draws one marker per recommended opportunity", () => {
    expect(svg.match(/<g class="opportunity">/g)).toHaveLength(2);
    expect(svg).toContain("Quick wins");
  });

  it("escapes step names and references no external resources", () => {
    expect(svg).toContain("Extract &lt;PO&gt; &amp; totals");
    expect(svg).not.toMatch(/<(?:image|script|link)\b/);
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:\/\//);
  });

  it("is deterministic", () => {
    expect(quadrantSvg(audit())).toBe(svg);
  });
});

describe("renderMarkdown", () => {
  const md = renderMarkdown(audit(), meta);

  it("labels synthetic inputs and includes each section", () => {
    expect(md).toContain("> **Synthetic data.**");
    for (const heading of [
      "## Summary",
      "## Roadmap",
      "### Not recommended",
      "## Value vs effort",
      "## Opportunity details",
      "## Method",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("![Value vs effort quadrant](quadrant.svg)");
  });

  it("escapes pipes inside table cells", () => {
    expect(md).toContain("Extract <PO> & totals \\| lines");
  });

  it("omits the banner when nothing is synthetic", () => {
    expect(renderMarkdown(audit({ synthetic: false }), meta)).not.toContain("Synthetic data");
  });
});

describe("renderHtml", () => {
  const html = renderHtml(audit(), meta);

  it("is self-contained: inline SVG, no scripts or external URLs", () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/<script\b/);
    expect(html).not.toMatch(/\b(?:src|href)=/);
    expect(html.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "")).not.toMatch(
      /https?:\/\//,
    );
  });

  it("escapes user-provided text", () => {
    expect(html).toContain("Extract &lt;PO&gt; &amp; totals | lines");
    expect(html).not.toContain("<PO>");
  });
});

describe("toJson", () => {
  it("serializes non-finite payback as null", () => {
    const result = audit({ volumePerMonth: 1 });
    const parsed = JSON.parse(toJson(result)) as {
      opportunities: { economics: { point: { paybackMonths: number | null } } | null }[];
    };
    const paybacks = parsed.opportunities.flatMap((o) =>
      o.economics ? [o.economics.point.paybackMonths] : [],
    );
    expect(paybacks).toContain(null);
  });
});
