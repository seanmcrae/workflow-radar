import type { AuditConfig } from "../config.js";
import { toRange, type Range } from "../domain/estimate.js";
import type { AutomationPattern } from "../domain/pattern.js";
import type { Step, Workflow } from "../domain/schema.js";

/** Every uncertain input to the ROI model, each as a three-point range. */
export interface RoiInputs {
  volumePerMonth: Range;
  volumeShare: Range;
  durationMinutes: Range;
  errorRate: Range;
  hourlyCost: Range;
  automationFraction: Range;
  implementationCost: Range;
  monthlyRunCost: Range;
}

export type RoiInput = keyof RoiInputs;
export type RoiSample = Record<RoiInput, number>;

export const ROI_INPUT_LABELS: Record<RoiInput, string> = {
  volumePerMonth: "Volume per month",
  volumeShare: "Share of runs reaching step",
  durationMinutes: "Minutes per run",
  errorRate: "Rework rate",
  hourlyCost: "Loaded hourly cost",
  automationFraction: "Automation fraction",
  implementationCost: "Implementation cost",
  monthlyRunCost: "Monthly run cost",
};

export interface RoiOutcome {
  hoursSavedPerMonth: number;
  monthlySavings: number;
  monthlyNet: number;
  /** Twelve months of net savings minus the one-time implementation cost. */
  firstYearNet: number;
  /** Months to recover implementation cost; Infinity when monthly net is not positive. */
  paybackMonths: number;
}

export function roiInputsFor(
  workflow: Workflow,
  step: Step,
  pattern: AutomationPattern,
  config: AuditConfig,
): RoiInputs {
  return {
    volumePerMonth: toRange(workflow.volumePerMonth),
    volumeShare: toRange(step.volumeShare),
    durationMinutes: toRange(step.durationMinutes),
    errorRate: toRange(step.errorRate),
    hourlyCost: toRange(workflow.loadedHourlyCost),
    automationFraction: { ...config.patterns.automationFraction[pattern] },
    implementationCost: { ...config.patterns.implementationCost[pattern] },
    monthlyRunCost: { ...config.patterns.monthlyRunCost[pattern] },
  };
}

export function likelySample(inputs: RoiInputs): RoiSample {
  return mapInputs(inputs, (range) => range.likely);
}

export function mapInputs(
  inputs: RoiInputs,
  pick: (range: Range, key: RoiInput) => number,
): RoiSample {
  const keys = Object.keys(inputs) as RoiInput[];
  return Object.fromEntries(keys.map((key) => [key, pick(inputs[key], key)])) as RoiSample;
}

/**
 * Rework is labor too: a step with a 10% rework rate costs 1.1x its nominal minutes,
 * and automation removes the same fraction of that rework as of the first pass.
 */
export function evaluateRoi(s: RoiSample): RoiOutcome {
  const laborHoursPerMonth =
    (s.volumePerMonth * s.volumeShare * s.durationMinutes * (1 + s.errorRate)) / 60;
  const hoursSavedPerMonth = laborHoursPerMonth * s.automationFraction;
  const monthlySavings = hoursSavedPerMonth * s.hourlyCost;
  const monthlyNet = monthlySavings - s.monthlyRunCost;
  return {
    hoursSavedPerMonth,
    monthlySavings,
    monthlyNet,
    firstYearNet: 12 * monthlyNet - s.implementationCost,
    paybackMonths: monthlyNet > 0 ? s.implementationCost / monthlyNet : Number.POSITIVE_INFINITY,
  };
}
