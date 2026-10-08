import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { loadWorkflowFile } from "../src/domain/load.js";
import { runAudit, type Opportunity } from "../src/prioritize/audit.js";
import { money, num } from "../src/report/format.js";
import { summarize } from "../src/report/summary.js";

/**
 * The README's Numbers card and "Where it fails" section quote figures from the audit of the
 * bundled synthetic examples. Recompute them here so the README cannot drift from the code.
 */
const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const product = readFileSync(join(root, "docs", "PRODUCT.md"), "utf8");
const examplesDir = join(root, "examples");
const files = readdirSync(examplesDir)
  .filter((f) => f.endsWith(".yaml"))
  .sort()
  .map((f) => join(examplesDir, f));

const netP50 = (o: Opportunity): number => o.economics?.simulation.firstYearNet.p50 ?? 0;
const sum = (ops: Opportunity[]): number => ops.reduce((s, o) => s + netP50(o), 0);

async function audit() {
  const workflows = await Promise.all(files.map((f) => loadWorkflowFile(f)));
  const result = runAudit(workflows, DEFAULT_CONFIG);
  return { result, summary: summarize(result) };
}

describe("README numbers card", () => {
  it("quotes the radar's Now + Next value and the friction-only baseline", async () => {
    const { result, summary } = await audit();
    const nowNext = result.opportunities.filter(
      (o) => o.economics?.quadrant === "quick_win" || o.economics?.quadrant === "big_bet",
    );
    // Baseline: fund the same number of steps, picked by friction score alone.
    const byFriction = [...result.opportunities]
      .sort((a, b) => b.friction.score - a.friction.score)
      .slice(0, nowNext.length);
    const overlap = byFriction.filter((o) => nowNext.includes(o)).length;
    const losing = byFriction.filter((o) => o.economics === null || netP50(o) <= 0).length;

    expect(readme).toContain(
      `Top ${num(nowNext.length)} by workflow-radar (Now + Next): **${money(summary.nowNextFirstYearNetP50, summary.currency)}**`,
    );
    expect(readme).toContain(
      `Top ${num(byFriction.length)} by friction score alone: **${money(sum(byFriction), summary.currency)}**`,
    );
    expect(readme).toContain(
      `${num(losing)} of those ${num(byFriction.length)} lose money at P50 or are not recommended at all, and ${num(overlap)} overlaps`,
    );
    const ratio = summary.nowNextFirstYearNetP50 / sum(byFriction);
    expect(readme).toContain(`${num(ratio, 1)}x the baseline`);
    expect(product).toContain(`(${num(ratio, 1)}x on the bundled synthetic workflows today)`);
  });

  it("states the eval set size", async () => {
    const { result, summary } = await audit();
    const systemSteps = result.workflows.reduce((s, w) => s + w.systemSteps, 0);
    expect(readme).toContain(
      `${num(summary.syntheticWorkflows)} synthetic workflows, ${num(summary.stepsAssessed)} human steps (${num(systemSteps)} system steps skipped)`,
    );
    expect(readme).toContain(
      `${num(DEFAULT_CONFIG.simulation.iterations)} Monte Carlo iterations per step, seed ${num(DEFAULT_CONFIG.simulation.seed)}`,
    );
  });
});

describe("PRODUCT.md cost estimate", () => {
  it("multiplies the config cost bands by the Now + Next patterns", async () => {
    const { result } = await audit();
    const nowNext = result.opportunities.filter(
      (o) => o.economics?.quadrant === "quick_win" || o.economics?.quadrant === "big_bet",
    );
    const patterns = nowNext.map((o) => o.pattern);
    expect(new Set(patterns)).toEqual(new Set(["automation_with_review"]));
    const band = (b: { low: number; likely: number; high: number }) =>
      [b.low, b.likely, b.high].map((x) => money(x * nowNext.length, "USD")).join(" / ");
    const { monthlyRunCost, implementationCost } = DEFAULT_CONFIG.patterns;
    expect(product).toContain(`| ${band(monthlyRunCost.automation_with_review)} `);
    expect(product).toContain(`| ${band(implementationCost.automation_with_review)} `);
  });
});

describe("README failure analysis", () => {
  it("quotes the low-volume onboarding slice", async () => {
    const { result } = await audit();
    const onboarding = result.opportunities.filter((o) => o.workflowId === "employee-onboarding");
    const parked = onboarding.filter((o) => o.economics?.quadrant === "deprioritize").length;
    const notRecommended = onboarding.filter((o) => o.economics === null).length;
    const nowNext = onboarding.filter(
      (o) => o.economics?.quadrant === "quick_win" || o.economics?.quadrant === "big_bet",
    ).length;
    expect(readme).toContain(
      `${num(nowNext)} of ${num(onboarding.length)} steps reach Now or Next; ${num(parked)} parked, ${num(notRecommended)} not recommended`,
    );
  });

  it("quotes the misclassified provisioning step", async () => {
    const { result } = await audit();
    const step = result.opportunities.find((o) => o.id === "employee-onboarding/provision-access");
    expect(step?.suitability.task.taskType).toBe("classification");
    expect(step?.pattern).toBe("agent");
    expect(readme).toContain(`suitability ${num(step?.suitability.score ?? 0)}`);
    expect(readme).toContain(
      `P50 first-year net ${money(step === undefined ? 0 : netP50(step), "USD")}`,
    );
  });
});
