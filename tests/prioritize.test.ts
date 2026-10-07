import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../src/config.js";
import { assessStep, quadrantFor, runAudit } from "../src/prioritize/audit.js";
import { effortScore } from "../src/prioritize/effort.js";
import { guardrailNotes } from "../src/prioritize/guardrails.js";
import { recommendPattern } from "../src/prioritize/pattern.js";
import { suitabilityScore } from "../src/scoring/suitability.js";
import { makeStep, makeWorkflow, workflowWith } from "./helpers.js";
import { parseWorkflow } from "../src/domain/load.js";

function patternFor(overrides: Record<string, unknown>) {
  const step = makeStep(overrides);
  return recommendPattern(step, suitabilityScore(step, DEFAULT_CONFIG.suitability), DEFAULT_CONFIG);
}

describe("recommendPattern", () => {
  it("does not recommend steps with no AI-shaped task", () => {
    expect(patternFor({ name: "Ship laptop", taskType: "other" }).pattern).toBe("not_recommended");
  });

  it("does not recommend low-suitability steps", () => {
    const rec = patternFor({
      taskType: "decision",
      judgmentLevel: "high",
      regulatorySensitivity: "high",
      dataReadiness: "low",
    });
    expect(rec.pattern).toBe("not_recommended");
    expect(rec.rationale).toMatch(/below the 45 minimum/);
  });

  it("keeps a person in the loop for regulated, high-judgment, or decision steps", () => {
    expect(patternFor({ regulatorySensitivity: "high" }).pattern).toBe("copilot");
    expect(patternFor({ judgmentLevel: "high" }).pattern).toBe("copilot");
    expect(patternFor({ name: "Approve refunds" }).pattern).toBe("copilot");
  });

  it("recommends an agent only for low-risk multi-system steps with handoffs", () => {
    const agentish = { name: "Route access requests", systems: ["Okta", "Jira"], handoffs: 2 };
    expect(patternFor(agentish).pattern).toBe("agent");
    expect(patternFor({ ...agentish, handoffs: 0 }).pattern).toBe("automation_with_review");
    expect(patternFor({ ...agentish, regulatorySensitivity: "medium" }).pattern).toBe(
      "automation_with_review",
    );
  });

  it("falls back to copilot for moderate suitability", () => {
    const rec = patternFor({ name: "Draft memo", judgmentLevel: "medium", dataReadiness: "low" });
    expect(rec.pattern).toBe("copilot");
  });
});

describe("guardrailNotes", () => {
  it("adds controls for regulated and agentic steps", () => {
    const regulated = makeStep({ regulatorySensitivity: "high", errorRate: 0.2 });
    const notes = guardrailNotes(regulated, "copilot", "extraction");
    expect(notes.some((n) => n.startsWith("Human sign-off"))).toBe(true);
    expect(notes.some((n) => n.includes("redact"))).toBe(true);
    expect(notes.some((n) => n.includes("shadow mode"))).toBe(true);
    expect(guardrailNotes(makeStep(), "agent", "classification").join(" ")).toMatch(/kill switch/);
  });

  it("returns nothing for low-risk copilots and not-recommended steps", () => {
    expect(guardrailNotes(makeStep(), "copilot", "extraction")).toEqual([]);
    expect(
      guardrailNotes(makeStep({ regulatorySensitivity: "high" }), "not_recommended", "other"),
    ).toEqual([]);
  });
});

describe("effortScore", () => {
  it("adds pattern base and penalties", () => {
    const step = makeStep({
      dataReadiness: "low",
      regulatorySensitivity: "medium",
      systems: ["A", "B", "C"],
    });
    const effort = effortScore(step, "automation_with_review", DEFAULT_CONFIG);
    expect(effort.score).toBe(40 + 20 + 6 + 2 * 4);
    expect(effort.components.map((c) => c.factor)).toEqual([
      "pattern",
      "dataReadiness",
      "regulatory",
      "integrations",
    ]);
  });

  it("caps effort at 100", () => {
    const config = resolveConfig({ effort: { perExtraSystemPenalty: 50 } });
    const step = makeStep({ systems: ["A", "B", "C"] });
    expect(effortScore(step, "agent", config).score).toBe(100);
  });
});

describe("quadrantFor", () => {
  it.each([
    [80, 20, "quick_win"],
    [80, 70, "big_bet"],
    [20, 20, "fill_in"],
    [20, 70, "deprioritize"],
    [50, 50, "big_bet"],
  ] as const)("value %d, effort %d -> %s", (value, effort, expected) => {
    expect(quadrantFor(value, effort, 6, DEFAULT_CONFIG)).toBe(expected);
  });

  it("parks opportunities whose median payback exceeds the horizon", () => {
    expect(quadrantFor(90, 10, 18, DEFAULT_CONFIG)).toBe("quick_win");
    expect(quadrantFor(90, 10, 18.5, DEFAULT_CONFIG)).toBe("deprioritize");
    expect(quadrantFor(90, 10, Infinity, DEFAULT_CONFIG)).toBe("deprioritize");
    expect(quadrantFor(90, 10, NaN, DEFAULT_CONFIG)).toBe("deprioritize");
  });
});

describe("runAudit", () => {
  const workflow = parseWorkflow(
    makeWorkflow({
      volumePerMonth: 5000,
      steps: [
        {
          id: "extract",
          name: "Extract fields from form",
          actor: "Clerk",
          durationMinutes: 10,
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
        {
          id: "tag",
          name: "Tag request",
          actor: "Clerk",
          durationMinutes: 0.5,
          judgmentLevel: "low",
          dataReadiness: "high",
        },
        {
          id: "batch",
          name: "Nightly sync",
          actor: "ETL",
          actorType: "system",
          durationMinutes: 1,
          judgmentLevel: "low",
          dataReadiness: "high",
        },
      ],
    }),
  );

  it("ranks recommended opportunities first and skips system steps", () => {
    const result = runAudit([workflow], DEFAULT_CONFIG);
    expect(result.opportunities.map((o) => o.stepId)).toEqual(["extract", "tag", "ship"]);
    expect(result.opportunities.map((o) => o.rank)).toEqual([1, 2, null]);
    expect(result.workflows[0]?.systemSteps).toBe(1);
    expect(result.opportunities[0]?.economics?.quadrant).toBe("quick_win");
  });

  it("is deterministic and independent of workflow order", () => {
    const other = workflowWith({ id: "other-workflow" });
    const a = runAudit([workflow, other], DEFAULT_CONFIG);
    const b = runAudit([other, workflow], DEFAULT_CONFIG);
    const pick = (r: typeof a) => r.opportunities.find((o) => o.id === "test-workflow/extract");
    expect(pick(a)?.economics?.simulation).toEqual(pick(b)?.economics?.simulation);
  });

  it("rejects duplicate workflow ids", () => {
    expect(() => runAudit([workflow, workflow], DEFAULT_CONFIG)).toThrow(/duplicate workflow id/);
  });

  it("scales value against the configured cap", () => {
    const step = workflow.steps[0];
    if (!step) throw new Error("missing step");
    const capped = assessStep(
      workflow,
      step,
      resolveConfig({ prioritization: { valueCapAnnual: 1 } }),
    );
    expect(capped.economics?.value).toBe(100);
  });
});
