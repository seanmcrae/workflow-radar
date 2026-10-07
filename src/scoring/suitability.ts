import type { SuitabilityConfig } from "../config.js";
import type { Step } from "../domain/schema.js";
import { classifyStep, type TaskTypeResult } from "./classify.js";
import { weightedScore, type ScoreBreakdown } from "./types.js";

export interface SuitabilityResult extends ScoreBreakdown {
  task: TaskTypeResult;
}

/**
 * AI suitability blends how well current models handle the task type with whether the
 * inputs are ready, how much judgment the step needs, and how costly a mistake would be.
 */
export function suitabilityScore(step: Step, config: SuitabilityConfig): SuitabilityResult {
  const task = classifyStep(step);
  const { weights } = config;
  const taskNote =
    task.source === "declared"
      ? `${task.taskType} (declared)`
      : task.matched.length > 0
        ? `${task.taskType} (inferred from "${task.matched.join('", "')}")`
        : "other (no task-type cues found)";

  const breakdown = weightedScore([
    {
      factor: "taskType",
      value: config.taskTypeFit[task.taskType],
      rawWeight: weights.taskType,
      note: taskNote,
    },
    {
      factor: "dataReadiness",
      value: config.dataReadiness[step.dataReadiness],
      rawWeight: weights.dataReadiness,
      note: `data readiness ${step.dataReadiness}`,
    },
    {
      factor: "judgment",
      value: config.judgment[step.judgmentLevel],
      rawWeight: weights.judgment,
      note: `${step.judgmentLevel} judgment required`,
    },
    {
      factor: "risk",
      value: config.risk[step.regulatorySensitivity],
      rawWeight: weights.risk,
      note: `regulatory sensitivity ${step.regulatorySensitivity}`,
    },
  ]);
  return { ...breakdown, task };
}
