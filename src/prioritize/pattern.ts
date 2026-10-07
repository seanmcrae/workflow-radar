import type { AuditConfig } from "../config.js";
import type { Pattern } from "../domain/pattern.js";
import type { Step } from "../domain/schema.js";
import type { SuitabilityResult } from "../scoring/suitability.js";

export interface PatternRecommendation {
  pattern: Pattern;
  rationale: string;
}

/**
 * Rules are evaluated in order and the first match wins. Hard limits (task type, judgment,
 * regulation) come before score thresholds so a high score cannot buy autonomy on a risky step.
 */
export function recommendPattern(
  step: Step,
  suitability: SuitabilityResult,
  config: AuditConfig,
): PatternRecommendation {
  const t = config.patterns.thresholds;
  const score = suitability.score;
  const { taskType } = suitability.task;

  if (taskType === "other") {
    return {
      pattern: "not_recommended",
      rationale:
        "No AI-shaped task (extraction, classification, summarization, generation, decision); consider conventional automation.",
    };
  }
  if (score < t.minSuitability) {
    return {
      pattern: "not_recommended",
      rationale: `Suitability ${score.toFixed(0)} is below the ${t.minSuitability} minimum.`,
    };
  }
  if (step.regulatorySensitivity === "high") {
    return {
      pattern: "copilot",
      rationale: "High regulatory sensitivity keeps a person accountable for every output.",
    };
  }
  if (step.judgmentLevel === "high") {
    return { pattern: "copilot", rationale: "High judgment: AI assists, a person decides." };
  }
  if (taskType === "decision") {
    return {
      pattern: "copilot",
      rationale: "Decision tasks stay with a named owner; AI gathers evidence.",
    };
  }
  const lowRisk = step.regulatorySensitivity === "none" || step.regulatorySensitivity === "low";
  if (
    score >= t.agentSuitability &&
    step.systems.length >= t.agentMinSystems &&
    step.handoffs >= t.agentMinHandoffs &&
    lowRisk &&
    step.judgmentLevel === "low"
  ) {
    return {
      pattern: "agent",
      rationale: `Suitability ${score.toFixed(0)} with low judgment and risk, ${step.handoffs} handoff(s), and ${step.systems.length} systems suits an agent that acts across tools.`,
    };
  }
  if (score >= t.automationSuitability) {
    return {
      pattern: "automation_with_review",
      rationale: `Suitability ${score.toFixed(0)} supports automation with human review of exceptions.`,
    };
  }
  return {
    pattern: "copilot",
    rationale: `Suitability ${score.toFixed(0)} supports assistance but not unattended automation.`,
  };
}
