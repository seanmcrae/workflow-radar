import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../src/config.js";
import { frictionScore, workflowFriction } from "../src/scoring/friction.js";
import { makeStep, workflowWith } from "./helpers.js";

const cfg = DEFAULT_CONFIG.friction;

describe("frictionScore", () => {
  it("is the weighted sum of saturated factors", () => {
    // time 30/60 = 0.5, rework 0.1/0.25 = 0.4, handoffs 2/4 = 0.5, wait 720/1440 = 0.5
    const step = makeStep({ durationMinutes: 30, errorRate: 0.1, handoffs: 2, waitMinutes: 720 });
    const { score } = frictionScore(step, cfg);
    expect(score).toBeCloseTo(100 * (0.35 * 0.5 + 0.25 * 0.4 + 0.2 * 0.5 + 0.2 * 0.5), 10);
  });

  it("caps each factor at its saturation point", () => {
    const step = makeStep({ durationMinutes: 600, errorRate: 0.9, handoffs: 12, waitMinutes: 1e5 });
    expect(frictionScore(step, cfg).score).toBeCloseTo(100, 10);
  });

  it("uses the likely value of ranges", () => {
    const ranged = makeStep({ durationMinutes: { low: 1, likely: 30, high: 120 } });
    const point = makeStep({ durationMinutes: 30 });
    expect(frictionScore(ranged, cfg).score).toBe(frictionScore(point, cfg).score);
  });

  it("explains every factor and the points sum to the score", () => {
    const step = makeStep({ durationMinutes: 12, errorRate: 0.05, handoffs: 1 });
    const result = frictionScore(step, cfg);
    expect(result.factors.map((f) => f.factor)).toEqual(["time", "rework", "handoffs", "wait"]);
    const sum = result.factors.reduce((s, f) => s + f.points, 0);
    expect(sum).toBeCloseTo(result.score, 10);
    expect(result.factors[0]?.note).toBe("12 min hands-on per run (saturates at 60)");
    expect(result.factors[2]?.note).toBe("1 handoff (saturates at 4)");
  });

  it("normalizes weights that do not sum to one", () => {
    const doubled = resolveConfig({
      friction: { weights: { time: 0.7, rework: 0.5, handoffs: 0.4, wait: 0.4 } },
    }).friction;
    const step = makeStep({ durationMinutes: 20, errorRate: 0.1, handoffs: 1, waitMinutes: 60 });
    expect(frictionScore(step, doubled).score).toBeCloseTo(frictionScore(step, cfg).score, 10);
  });
});

describe("workflowFriction", () => {
  it("weights steps by labor minutes per run", () => {
    const workflow = workflowWith({
      steps: [
        {
          id: "a",
          name: "A",
          actor: "x",
          durationMinutes: 60,
          judgmentLevel: "low",
          dataReadiness: "high",
        },
        {
          id: "b",
          name: "B",
          actor: "x",
          durationMinutes: 6,
          volumeShare: 0.5,
          judgmentLevel: "low",
          dataReadiness: "high",
        },
      ],
    });
    // A: friction 35 over 60 minutes; B: friction 3.5 over 3 minutes.
    expect(workflowFriction(workflow, cfg)).toBeCloseTo((35 * 60 + 3.5 * 3) / 63, 10);
  });
});
