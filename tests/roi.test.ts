import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { evaluateRoi, likelySample, roiInputsFor, type RoiSample } from "../src/roi/model.js";
import { workflowWith } from "./helpers.js";

const base: RoiSample = {
  volumePerMonth: 1000,
  volumeShare: 0.5,
  durationMinutes: 12,
  errorRate: 0.1,
  hourlyCost: 50,
  automationFraction: 0.6,
  implementationCost: 30000,
  monthlyRunCost: 500,
};

describe("evaluateRoi", () => {
  it("computes hours saved as volume x share x duration x rework x fraction", () => {
    const out = evaluateRoi(base);
    // 1000 * 0.5 * 12 * 1.1 / 60 = 110 labor hours; 60% automated = 66 hours.
    expect(out.hoursSavedPerMonth).toBeCloseTo(66, 10);
    expect(out.monthlySavings).toBeCloseTo(3300, 10);
    expect(out.monthlyNet).toBeCloseTo(2800, 10);
    expect(out.firstYearNet).toBeCloseTo(12 * 2800 - 30000, 10);
    expect(out.paybackMonths).toBeCloseTo(30000 / 2800, 10);
  });

  it("reports no payback when run cost exceeds savings", () => {
    const out = evaluateRoi({ ...base, monthlyRunCost: 5000 });
    expect(out.monthlyNet).toBeLessThan(0);
    expect(out.paybackMonths).toBe(Number.POSITIVE_INFINITY);
  });

  it("is linear in automation fraction for hours saved", () => {
    const half = evaluateRoi({ ...base, automationFraction: 0.3 });
    expect(half.hoursSavedPerMonth * 2).toBeCloseTo(evaluateRoi(base).hoursSavedPerMonth, 10);
  });
});

describe("roiInputsFor", () => {
  it("pulls workflow, step, and pattern inputs into ranges", () => {
    const workflow = workflowWith({ volumePerMonth: { low: 800, likely: 1000, high: 1300 } });
    const step = workflow.steps[0];
    if (!step) throw new Error("missing step");
    const inputs = roiInputsFor(workflow, step, "copilot", DEFAULT_CONFIG);
    expect(inputs.volumePerMonth).toEqual({ low: 800, likely: 1000, high: 1300 });
    expect(inputs.durationMinutes).toEqual({ low: 6, likely: 6, high: 6 });
    expect(inputs.automationFraction).toEqual(DEFAULT_CONFIG.patterns.automationFraction.copilot);
    expect(likelySample(inputs).volumePerMonth).toBe(1000);
  });
});
