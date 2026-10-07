import type { AuditConfig } from "../config.js";
import { likely, toRange, type Range } from "../domain/estimate.js";
import type { Pattern } from "../domain/pattern.js";
import type { Step, Workflow } from "../domain/schema.js";
import {
  evaluateRoi,
  likelySample,
  roiInputsFor,
  type RoiInputs,
  type RoiOutcome,
} from "../roi/model.js";
import { hashString } from "../roi/random.js";
import { tornado, type TornadoBar } from "../roi/sensitivity.js";
import { simulateRoi, type SimulationSummary } from "../roi/simulate.js";
import { frictionScore, workflowFriction } from "../scoring/friction.js";
import { suitabilityScore, type SuitabilityResult } from "../scoring/suitability.js";
import type { ScoreBreakdown } from "../scoring/types.js";
import { effortScore, type EffortBreakdown } from "./effort.js";
import { guardrailNotes } from "./guardrails.js";
import { recommendPattern } from "./pattern.js";

export const QUADRANTS = ["quick_win", "big_bet", "fill_in", "deprioritize"] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  quick_win: "Quick win",
  big_bet: "Big bet",
  fill_in: "Fill-in",
  deprioritize: "Deprioritize",
};

export interface Economics {
  inputs: RoiInputs;
  point: RoiOutcome;
  simulation: SimulationSummary;
  tornado: TornadoBar[];
  effort: EffortBreakdown;
  /** 0-100: P50 annual net savings (after run cost) relative to the configured cap. */
  value: number;
  quadrant: Quadrant;
}

export interface Opportunity {
  id: string;
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepName: string;
  actor: string;
  currency: string;
  synthetic: boolean;
  friction: ScoreBreakdown;
  suitability: SuitabilityResult;
  pattern: Pattern;
  patternRationale: string;
  guardrails: string[];
  economics: Economics | null;
  /** 1-based priority among recommended opportunities; null when not recommended. */
  rank: number | null;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  team: string;
  synthetic: boolean;
  currency: string;
  volumePerMonth: Range;
  friction: number;
  /** Likely labor hours per month across human steps, including rework. */
  laborHoursPerMonth: number;
  humanSteps: number;
  systemSteps: number;
}

export interface AuditResult {
  workflows: WorkflowSummary[];
  /** Recommended opportunities in priority order, followed by not-recommended steps. */
  opportunities: Opportunity[];
  config: AuditConfig;
}

export function quadrantFor(value: number, effort: number, config: AuditConfig): Quadrant {
  const { valueThreshold, effortThreshold } = config.prioritization;
  const highValue = value >= valueThreshold;
  const lowEffort = effort < effortThreshold;
  if (highValue) return lowEffort ? "quick_win" : "big_bet";
  return lowEffort ? "fill_in" : "deprioritize";
}

function laborHours(workflow: Workflow, step: Step): number {
  const minutes =
    likely(workflow.volumePerMonth) *
    likely(step.volumeShare) *
    likely(step.durationMinutes) *
    (1 + likely(step.errorRate));
  return minutes / 60;
}

export function assessStep(workflow: Workflow, step: Step, config: AuditConfig): Opportunity {
  const id = `${workflow.id}/${step.id}`;
  const suitability = suitabilityScore(step, config.suitability);
  const { pattern, rationale } = recommendPattern(step, suitability, config);
  const base = {
    id,
    workflowId: workflow.id,
    workflowName: workflow.name,
    stepId: step.id,
    stepName: step.name,
    actor: step.actor,
    currency: workflow.currency,
    synthetic: workflow.synthetic,
    friction: frictionScore(step, config.friction),
    suitability,
    pattern,
    patternRationale: rationale,
    guardrails: guardrailNotes(step, pattern, suitability.task.taskType),
    rank: null,
  };
  if (pattern === "not_recommended") return { ...base, economics: null };

  const inputs = roiInputsFor(workflow, step, pattern, config);
  const simulation = simulateRoi(inputs, {
    iterations: config.simulation.iterations,
    seed: (config.simulation.seed ^ hashString(id)) >>> 0,
  });
  const effort = effortScore(step, pattern, config);
  const annualNet = 12 * simulation.monthlyNet.p50;
  const value = 100 * Math.min(1, Math.max(0, annualNet / config.prioritization.valueCapAnnual));
  return {
    ...base,
    economics: {
      inputs,
      point: evaluateRoi(likelySample(inputs)),
      simulation,
      tornado: tornado(inputs),
      effort,
      value,
      quadrant: quadrantFor(value, effort.score, config),
    },
  };
}

function compareOpportunities(a: Opportunity, b: Opportunity): number {
  if (a.economics === null || b.economics === null) {
    if (a.economics === b.economics) return b.friction.score - a.friction.score;
    return a.economics === null ? 1 : -1;
  }
  const byQuadrant =
    QUADRANTS.indexOf(a.economics.quadrant) - QUADRANTS.indexOf(b.economics.quadrant);
  if (byQuadrant !== 0) return byQuadrant;
  return (
    b.economics.simulation.firstYearNet.p50 - a.economics.simulation.firstYearNet.p50 ||
    a.id.localeCompare(b.id)
  );
}

export function runAudit(workflows: Workflow[], config: AuditConfig): AuditResult {
  const ids = new Set<string>();
  for (const workflow of workflows) {
    if (ids.has(workflow.id)) throw new Error(`duplicate workflow id "${workflow.id}"`);
    ids.add(workflow.id);
  }

  const opportunities = workflows
    .flatMap((workflow) =>
      workflow.steps
        .filter((step) => step.actorType === "human")
        .map((step) => assessStep(workflow, step, config)),
    )
    .sort(compareOpportunities);

  let rank = 0;
  const ranked = opportunities.map((o) => (o.economics === null ? o : { ...o, rank: ++rank }));

  const summaries = workflows.map((workflow): WorkflowSummary => {
    const human = workflow.steps.filter((s) => s.actorType === "human");
    return {
      id: workflow.id,
      name: workflow.name,
      team: workflow.team,
      synthetic: workflow.synthetic,
      currency: workflow.currency,
      volumePerMonth: toRange(workflow.volumePerMonth),
      friction: workflowFriction(workflow, config.friction),
      laborHoursPerMonth: human.reduce((sum, step) => sum + laborHours(workflow, step), 0),
      humanSteps: human.length,
      systemSteps: workflow.steps.length - human.length,
    };
  });

  return { workflows: summaries, opportunities: ranked, config };
}
