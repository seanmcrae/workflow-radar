import { describe, expect, it } from "vitest";
import { evaluateRoi, likelySample, type RoiInputs } from "../src/roi/model.js";
import { hashString, mulberry32, percentile, sampleTriangular } from "../src/roi/random.js";
import { tornado } from "../src/roi/sensitivity.js";
import { simulateRoi } from "../src/roi/simulate.js";

const inputs: RoiInputs = {
  volumePerMonth: { low: 800, likely: 1000, high: 1400 },
  volumeShare: { low: 1, likely: 1, high: 1 },
  durationMinutes: { low: 4, likely: 6, high: 10 },
  errorRate: { low: 0.05, likely: 0.1, high: 0.15 },
  hourlyCost: { low: 45, likely: 50, high: 60 },
  automationFraction: { low: 0.45, likely: 0.6, high: 0.75 },
  implementationCost: { low: 15000, likely: 35000, high: 70000 },
  monthlyRunCost: { low: 300, likely: 800, high: 1500 },
};

describe("random utilities", () => {
  it("mulberry32 is deterministic per seed and in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Array.from({ length: 5 }, mulberry32(43))).not.toEqual(seqA);
  });

  it("triangular sampling hits the bounds and mode", () => {
    const r = { low: 2, likely: 5, high: 11 };
    expect(sampleTriangular(r, 0)).toBe(2);
    expect(sampleTriangular(r, (5 - 2) / (11 - 2))).toBeCloseTo(5, 10);
    expect(sampleTriangular(r, 1)).toBeCloseTo(11, 10);
    expect(sampleTriangular({ low: 3, likely: 3, high: 3 }, 0.7)).toBe(3);
  });

  it("triangular sample mean matches (low + likely + high) / 3", () => {
    const random = mulberry32(1);
    const r = { low: 0, likely: 2, high: 10 };
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) sum += sampleTriangular(r, random());
    expect(sum / n).toBeCloseTo(4, 1);
  });

  it("percentile interpolates and handles infinities", () => {
    expect(percentile([0, 10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([0, 10], 0.25)).toBe(2.5);
    expect(percentile([1, 2, Infinity, Infinity], 0.9)).toBe(Infinity);
  });

  it("hashString is stable", () => {
    expect(hashString("invoice-processing/key-in")).toBe(hashString("invoice-processing/key-in"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("simulateRoi", () => {
  it("is deterministic for a fixed seed", () => {
    const a = simulateRoi(inputs, { iterations: 2000, seed: 7 });
    const b = simulateRoi(inputs, { iterations: 2000, seed: 7 });
    expect(a).toEqual(b);
  });

  it("changes with the seed but stays statistically close", () => {
    const a = simulateRoi(inputs, { iterations: 20000, seed: 1 });
    const b = simulateRoi(inputs, { iterations: 20000, seed: 2 });
    expect(a.hoursSavedPerMonth.p50).not.toBe(b.hoursSavedPerMonth.p50);
    expect(Math.abs(a.hoursSavedPerMonth.p50 / b.hoursSavedPerMonth.p50 - 1)).toBeLessThan(0.02);
  });

  it("orders percentiles and brackets the point estimate", () => {
    const sim = simulateRoi(inputs, { iterations: 5000, seed: 42 });
    const point = evaluateRoi(likelySample(inputs));
    for (const key of ["hoursSavedPerMonth", "monthlySavings", "firstYearNet"] as const) {
      expect(sim[key].p10).toBeLessThan(sim[key].p50);
      expect(sim[key].p50).toBeLessThan(sim[key].p90);
      expect(point[key]).toBeGreaterThan(sim[key].p10);
      expect(point[key]).toBeLessThan(sim[key].p90);
    }
    expect(sim.probabilityPositiveFirstYear).toBeGreaterThan(0);
    expect(sim.probabilityPositiveFirstYear).toBeLessThanOrEqual(1);
  });

  it("collapses to the point estimate when every input is fixed", () => {
    const keys = Object.keys(inputs) as (keyof RoiInputs)[];
    const fixed = Object.fromEntries(
      keys.map((k) => {
        const { likely } = inputs[k];
        return [k, { low: likely, likely, high: likely }];
      }),
    ) as unknown as RoiInputs;
    const sim = simulateRoi(fixed, { iterations: 200, seed: 3 });
    const point = evaluateRoi(likelySample(fixed));
    expect(sim.firstYearNet.p10).toBeCloseTo(point.firstYearNet, 8);
    expect(sim.firstYearNet.p90).toBeCloseTo(point.firstYearNet, 8);
  });
});

describe("tornado", () => {
  it("sorts inputs by swing and skips fixed inputs", () => {
    const bars = tornado(inputs);
    expect(bars.map((b) => b.input)).not.toContain("volumeShare");
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i - 1]?.swing).toBeGreaterThanOrEqual(bars[i]?.swing ?? 0);
    }
  });

  it("computes swing by varying one input at a time", () => {
    const bar = tornado(inputs).find((b) => b.input === "implementationCost");
    // First-year net is linear in implementation cost with slope -1.
    expect(bar?.swing).toBeCloseTo(70000 - 15000, 8);
    expect(bar?.outputAtLow).toBeGreaterThan(bar?.outputAtHigh ?? Infinity);
  });
});
