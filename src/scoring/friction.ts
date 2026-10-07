import type { FrictionConfig } from "../config.js";
import { likely } from "../domain/estimate.js";
import type { Step, Workflow } from "../domain/schema.js";
import { clamp01, weightedScore, type ScoreBreakdown } from "./types.js";

/**
 * Friction measures how painful a step is per run: hands-on time, rework, handoffs, and
 * queue time, each normalized against a saturation point so no single factor dominates.
 */
export function frictionScore(step: Step, config: FrictionConfig): ScoreBreakdown {
  const { weights, saturation } = config;
  const duration = likely(step.durationMinutes);
  const errorRate = likely(step.errorRate);
  const wait = likely(step.waitMinutes);

  return weightedScore([
    {
      factor: "time",
      value: clamp01(duration / saturation.durationMinutes),
      rawWeight: weights.time,
      note: `${fmt(duration)} min hands-on per run (saturates at ${saturation.durationMinutes})`,
    },
    {
      factor: "rework",
      value: clamp01(errorRate / saturation.errorRate),
      rawWeight: weights.rework,
      note: `${fmt(errorRate * 100)}% of runs need rework (saturates at ${fmt(saturation.errorRate * 100)}%)`,
    },
    {
      factor: "handoffs",
      value: clamp01(step.handoffs / saturation.handoffs),
      rawWeight: weights.handoffs,
      note: `${step.handoffs} handoff${step.handoffs === 1 ? "" : "s"} (saturates at ${saturation.handoffs})`,
    },
    {
      factor: "wait",
      value: clamp01(wait / saturation.waitMinutes),
      rawWeight: weights.wait,
      note: `${fmt(wait)} min waiting (saturates at ${saturation.waitMinutes})`,
    },
  ]);
}

/** Workflow friction is the step friction weighted by each step's labor minutes per run. */
export function workflowFriction(workflow: Workflow, config: FrictionConfig): number {
  let weighted = 0;
  let totalMinutes = 0;
  for (const step of workflow.steps) {
    const minutes = likely(step.durationMinutes) * likely(step.volumeShare);
    weighted += frictionScore(step, config).score * minutes;
    totalMinutes += minutes;
  }
  return totalMinutes > 0 ? weighted / totalMinutes : 0;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
