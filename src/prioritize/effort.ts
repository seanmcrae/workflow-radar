import type { AuditConfig } from "../config.js";
import type { AutomationPattern } from "../domain/pattern.js";
import type { Step } from "../domain/schema.js";

export interface EffortComponent {
  factor: string;
  points: number;
  note: string;
}

export interface EffortBreakdown {
  score: number;
  components: EffortComponent[];
}

/** Additive effort: pattern base plus penalties for data cleanup, compliance, and integrations. */
export function effortScore(
  step: Step,
  pattern: AutomationPattern,
  config: AuditConfig,
): EffortBreakdown {
  const e = config.effort;
  const extraSystems = Math.max(0, step.systems.length - 1);
  const components: EffortComponent[] = [
    { factor: "pattern", points: e.base[pattern], note: `${pattern} base effort` },
    {
      factor: "dataReadiness",
      points: e.dataReadinessPenalty[step.dataReadiness],
      note: `data readiness ${step.dataReadiness}`,
    },
    {
      factor: "regulatory",
      points: e.regulatoryPenalty[step.regulatorySensitivity],
      note: `regulatory sensitivity ${step.regulatorySensitivity}`,
    },
    {
      factor: "integrations",
      points: extraSystems * e.perExtraSystemPenalty,
      note: `${step.systems.length} system${step.systems.length === 1 ? "" : "s"} to integrate`,
    },
  ];
  const total = components.reduce((sum, c) => sum + c.points, 0);
  return { score: Math.min(100, total), components };
}
