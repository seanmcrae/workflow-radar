import { likely } from "../domain/estimate.js";
import type { Pattern } from "../domain/pattern.js";
import type { Step, TaskType } from "../domain/schema.js";

/** Concrete controls to put in place before shipping, derived from the step's risk profile. */
export function guardrailNotes(step: Step, pattern: Pattern, taskType: TaskType): string[] {
  if (pattern === "not_recommended") return [];
  const notes: string[] = [];
  const sensitivity = step.regulatorySensitivity;

  if (sensitivity === "high") {
    notes.push(
      "Human sign-off on every output; retain inputs, outputs, and reviewer decisions for audit.",
    );
  }
  if (sensitivity === "medium" || sensitivity === "high") {
    notes.push(
      "Minimize or redact personal and regulated data before it reaches a model; confirm vendor data-retention and residency terms.",
    );
  }
  if (step.judgmentLevel === "high") {
    notes.push("Model drafts and cites evidence only; the accountable person makes the call.");
  }
  if (taskType === "decision") {
    notes.push("Keep the decision with a named approver; log the evidence shown to them.");
  }
  if (likely(step.errorRate) >= 0.15) {
    notes.push(
      "High baseline rework: run in shadow mode and compare model error to the human baseline before cutover.",
    );
  }
  if (step.dataReadiness === "low") {
    notes.push(
      "Low data readiness: fix capture at the source (templates, required fields) before or alongside automation.",
    );
  }
  if (pattern === "automation_with_review") {
    notes.push(
      "Route low-confidence outputs to a review queue and sample-audit a fixed share of auto-accepted items.",
    );
  }
  if (pattern === "agent") {
    notes.push(
      "Allowlist the actions the agent may take in each system, rate-limit them, log every tool call, and keep a kill switch.",
    );
  }
  return notes;
}
