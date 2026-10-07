import type { AuditResult, Opportunity, Quadrant } from "../prioritize/audit.js";
import type { Pattern } from "../domain/pattern.js";

export interface RoadmapPhase {
  key: "now" | "next" | "later" | "park";
  title: string;
  description: string;
  quadrant: Quadrant;
  opportunities: Opportunity[];
}

const PHASES: Omit<RoadmapPhase, "opportunities">[] = [
  { key: "now", title: "Now", description: "Quick wins: high value, lower effort.", quadrant: "quick_win" },
  { key: "next", title: "Next", description: "Big bets: high value, higher effort; scope and fund deliberately.", quadrant: "big_bet" },
  { key: "later", title: "Later", description: "Fill-ins: modest value, low effort; batch with related work.", quadrant: "fill_in" },
  { key: "park", title: "Park", description: "Low value relative to effort, or median payback beyond the configured horizon.", quadrant: "deprioritize" },
];

export function roadmap(result: AuditResult): RoadmapPhase[] {
  return PHASES.map((phase) => ({
    ...phase,
    opportunities: result.opportunities.filter((o) => o.economics?.quadrant === phase.quadrant),
  }));
}

export interface AuditSummary {
  currency: string;
  workflows: number;
  syntheticWorkflows: number;
  stepsAssessed: number;
  recommended: number;
  notRecommended: Opportunity[];
  byPattern: Record<Pattern, number>;
  /** Sums of per-opportunity medians for Now + Next; not a percentile of the portfolio. */
  nowNextHoursP50: number;
  nowNextFirstYearNetP50: number;
  nowNextCount: number;
}

export function sharedCurrency(result: AuditResult): string {
  const currencies = [...new Set(result.workflows.map((w) => w.currency))];
  if (currencies.length !== 1 || currencies[0] === undefined) {
    throw new Error(`a report needs all workflows in one currency; found ${currencies.join(", ") || "none"}`);
  }
  return currencies[0];
}

export function summarize(result: AuditResult): AuditSummary {
  const byPattern: Record<Pattern, number> = { copilot: 0, automation_with_review: 0, agent: 0, not_recommended: 0 };
  for (const o of result.opportunities) byPattern[o.pattern]++;
  const nowNext = result.opportunities.filter(
    (o) => o.economics?.quadrant === "quick_win" || o.economics?.quadrant === "big_bet",
  );
  return {
    currency: sharedCurrency(result),
    workflows: result.workflows.length,
    syntheticWorkflows: result.workflows.filter((w) => w.synthetic).length,
    stepsAssessed: result.opportunities.length,
    recommended: result.opportunities.filter((o) => o.economics !== null).length,
    notRecommended: result.opportunities.filter((o) => o.economics === null),
    byPattern,
    nowNextHoursP50: nowNext.reduce((s, o) => s + (o.economics?.simulation.hoursSavedPerMonth.p50 ?? 0), 0),
    nowNextFirstYearNetP50: nowNext.reduce((s, o) => s + (o.economics?.simulation.firstYearNet.p50 ?? 0), 0),
    nowNextCount: nowNext.length,
  };
}
