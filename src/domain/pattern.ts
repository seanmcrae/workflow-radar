export const PATTERNS = ["copilot", "automation_with_review", "agent", "not_recommended"] as const;
export type Pattern = (typeof PATTERNS)[number];
export type AutomationPattern = Exclude<Pattern, "not_recommended">;

export const PATTERN_LABELS: Record<Pattern, string> = {
  copilot: "Copilot",
  automation_with_review: "Automation with review",
  agent: "Agent",
  not_recommended: "Not recommended",
};
