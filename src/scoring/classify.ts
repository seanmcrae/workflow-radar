import type { Step, TaskType } from "../domain/schema.js";

export interface TaskTypeResult {
  taskType: TaskType;
  source: "declared" | "inferred";
  /** Keywords that drove an inferred classification. */
  matched: string[];
}

type InferableTaskType = Exclude<TaskType, "other">;

/**
 * Keyword cues per task type. Listed in tie-break order: on equal hit counts the earlier
 * type wins, which deliberately favors "decision" so ambiguous steps are scored conservatively.
 */
const CUES: [InferableTaskType, string[]][] = [
  [
    "decision",
    ["approve", "approval", "decide", "decision", "authorize", "sign off", "negotiate", "assess"],
  ],
  ["summarization", ["summarize", "summary", "summarise", "recap", "digest", "condense", "brief"]],
  [
    "classification",
    [
      "classify",
      "categorize",
      "categorise",
      "triage",
      "tag",
      "route",
      "prioritize",
      "assign",
      "sort",
    ],
  ],
  [
    "extraction",
    [
      "extract",
      "key",
      "enter",
      "capture",
      "transcribe",
      "copy",
      "look up",
      "lookup",
      "download",
      "parse",
    ],
  ],
  [
    "generation",
    ["draft", "write", "compose", "generate", "reply", "respond", "answer", "prepare"],
  ],
];

function matchesCue(text: string, cue: string): boolean {
  const pattern = new RegExp(`\\b${cue.replace(/ /g, "\\s+")}(?:s|es|ed|ing|d)?\\b`, "i");
  return pattern.test(text);
}

export function inferTaskType(text: string): Omit<TaskTypeResult, "source"> {
  let best: { taskType: TaskType; matched: string[] } = { taskType: "other", matched: [] };
  for (const [taskType, cues] of CUES) {
    const matched = cues.filter((cue) => matchesCue(text, cue));
    if (matched.length > best.matched.length) best = { taskType, matched };
  }
  return best;
}

/** Uses the declared task type when present, otherwise infers one from the step's own words. */
export function classifyStep(step: Step): TaskTypeResult {
  if (step.taskType !== undefined) {
    return { taskType: step.taskType, source: "declared", matched: [] };
  }
  const text = [step.name, step.description ?? ""].join(" ");
  return { ...inferTaskType(text), source: "inferred" };
}
