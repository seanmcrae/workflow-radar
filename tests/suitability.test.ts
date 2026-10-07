import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { suitabilityScore } from "../src/scoring/suitability.js";
import { makeStep } from "./helpers.js";

const cfg = DEFAULT_CONFIG.suitability;

describe("suitabilityScore", () => {
  it("combines task fit, readiness, judgment, and risk", () => {
    const step = makeStep({
      taskType: "extraction",
      dataReadiness: "medium",
      judgmentLevel: "low",
      regulatorySensitivity: "low",
    });
    const expected = 100 * (0.35 * 0.9 + 0.25 * 0.6 + 0.2 * 1 + 0.2 * 0.85);
    expect(suitabilityScore(step, cfg).score).toBeCloseTo(expected, 10);
  });

  it("scores high-judgment regulated decisions low", () => {
    const decision = makeStep({
      name: "Approve credit limit",
      judgmentLevel: "high",
      regulatorySensitivity: "high",
      dataReadiness: "high",
    });
    const extraction = makeStep({ name: "Extract fields from form", dataReadiness: "high" });
    const low = suitabilityScore(decision, cfg).score;
    expect(low).toBeLessThan(45);
    expect(suitabilityScore(extraction, cfg).score).toBeGreaterThan(low + 40);
  });

  it("explains the inferred task type", () => {
    const result = suitabilityScore(makeStep({ name: "Summarize call notes" }), cfg);
    expect(result.task.taskType).toBe("summarization");
    expect(result.factors[0]?.note).toBe('summarization (inferred from "summarize")');
    expect(result.factors.reduce((s, f) => s + f.points, 0)).toBeCloseTo(result.score, 10);
  });
});
