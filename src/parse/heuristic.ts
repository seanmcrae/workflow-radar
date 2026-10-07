import type { Estimate } from "../domain/estimate.js";
import type { DataFormat, Level, Sensitivity } from "../domain/schema.js";
import { inferTaskType } from "../scoring/classify.js";
import type { NotesProvider, ProviderDraft } from "./provider.js";

const DEFAULT_DURATION_MINUTES = 5;

const KNOWN_SYSTEMS = [
  "SAP",
  "Oracle",
  "NetSuite",
  "QuickBooks",
  "Coupa",
  "Salesforce",
  "HubSpot",
  "Zendesk",
  "ServiceNow",
  "Jira",
  "Confluence",
  "Slack",
  "Teams",
  "Outlook",
  "Gmail",
  "Excel",
  "Google Sheets",
  "Google Docs",
  "SharePoint",
  "Workday",
  "BambooHR",
  "ADP",
  "Okta",
  "DocuSign",
  "Stripe",
];

const DATA_CUES: [RegExp, string, DataFormat][] = [
  [/\bpdfs?\b/i, "PDF documents", "unstructured"],
  [/\bscann?ed\b/i, "scanned documents", "unstructured"],
  [/\b(e-?mails?|inbox)\b/i, "email", "unstructured"],
  [/\b(call|transcript|notes|chat)\b/i, "conversation notes", "unstructured"],
  [/\b(spreadsheets?|csv|forms?)\b/i, "spreadsheet or form", "semi_structured"],
  [/\b(records?|database|line items|fields)\b/i, "system records", "structured"],
];

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * Deterministic, offline notes parser. It recognizes "Key: value" header lines and numbered or
 * bulleted steps, and fills each step field from keyword and number patterns. Anything it
 * cannot find gets a conservative default plus a warning, so the draft is reviewable.
 */
export class HeuristicNotesProvider implements NotesProvider {
  readonly name = "mock";

  draft(notes: string): Promise<ProviderDraft> {
    return Promise.resolve(parseNotesHeuristically(notes));
  }
}

export function parseNotesHeuristically(notes: string): ProviderDraft {
  const warnings: string[] = [];
  const lines = notes.split(/\r?\n/).map((l) => l.trim());
  const header = (key: RegExp): string | undefined =>
    lines
      .map((l) => new RegExp(`^(?:${key.source})\\s*:\\s*(.+)$`, "i").exec(l)?.[1])
      .find(Boolean);

  const name = header(/process|workflow/) ?? "Untitled workflow";
  if (name === "Untitled workflow")
    warnings.push('No "Process:" line found; named the workflow "Untitled workflow".');
  const team = header(/team|department/) ?? "Unknown team";
  if (team === "Unknown team") warnings.push('No "Team:" line found.');

  const volumeLine = header(/volume/);
  const volume = volumeLine ? numberEstimate(volumeLine) : undefined;
  if (volume === undefined) warnings.push("No volume found; defaulted to 100 per month.");
  const costLine = header(/loaded cost|hourly cost|cost/);
  const cost = costLine ? numberEstimate(costLine) : undefined;
  if (cost === undefined) warnings.push("No loaded hourly cost found; defaulted to 50.");

  const stepTexts = lines
    .map((l) => /^(?:\d+[.)]|[-*•])\s+(.+)$/.exec(l)?.[1])
    .filter((t): t is string => t !== undefined);
  if (stepTexts.length === 0) warnings.push("No numbered or bulleted steps found.");

  const ids = new Set<string>();
  const steps = stepTexts.map((text, index) => parseStep(text, index, ids, warnings));

  return {
    workflow: {
      id: slugify(name) || "workflow",
      name,
      team,
      synthetic: /\bsynthetic\b/i.test(notes),
      volumePerMonth: volume ?? 100,
      loadedHourlyCost: cost ?? 50,
      steps,
    },
    warnings,
  };
}

function parseStep(text: string, index: number, ids: Set<string>, warnings: string[]) {
  const label = `step ${index + 1}`;
  const { wait, rest } = extractWait(text);
  const duration = durationEstimate(rest);
  if (duration === undefined) {
    warnings.push(`${label}: no duration found; defaulted to ${DEFAULT_DURATION_MINUTES} min.`);
  }
  const stepName = firstClause(text);
  const automated =
    /\b(automated|automatically|batch job|scheduled job|runs automatically)\b/i.test(text);
  const dataInputs = DATA_CUES.filter(([pattern]) => pattern.test(text)).map(
    ([, name, format]) => ({ name, format }),
  );
  const task = inferTaskType(text);

  return {
    id: uniqueId(slugify(stepName.split(/\s+/).slice(0, 6).join(" ")) || `step-${index + 1}`, ids),
    name: stepName,
    actor: actorOf(text),
    actorType: automated ? "system" : "human",
    durationMinutes: duration ?? DEFAULT_DURATION_MINUTES,
    waitMinutes: wait,
    errorRate: errorRateOf(text),
    handoffs: (
      text.match(
        /\b(hands? off|handoffs?|pass(?:es)? (?:it )?to|sends? (?:it )?to|forwards? to|escalates? to|goes to)\b/gi,
      ) ?? []
    ).length,
    dataInputs,
    systems: KNOWN_SYSTEMS.filter((s) => new RegExp(`\\b${s}\\b`, "i").test(text)),
    taskType: task.taskType,
    judgmentLevel: judgmentOf(text),
    regulatorySensitivity: sensitivityOf(text),
    dataReadiness: readinessOf(
      text,
      dataInputs.map((d) => d.format),
    ),
  };
}

/** Pulls numbers out of a phrase: one value, a low-high pair, or a likely value plus a range. */
export function numberEstimate(text: string): Estimate | undefined {
  const values = [...text.replace(/(\d),(\d{3})/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)].map((m) =>
    Number(m[0]),
  );
  const [first, ...others] = values;
  if (first === undefined) return undefined;
  if (others.length === 0) return first;
  if (others.length === 1) {
    const low = Math.min(first, others[0] ?? first);
    const high = Math.max(first, others[0] ?? first);
    return { low, likely: round((low + high) / 2), high };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const low = sorted[0] ?? first;
  const high = sorted[sorted.length - 1] ?? first;
  return { low, likely: Math.min(high, Math.max(low, first)), high };
}

const UNIT = String.raw`(min(?:ute)?s?|h(?:ou)?rs?|hours?)`;

export function durationEstimate(text: string): Estimate | undefined {
  const range = new RegExp(
    String.raw`(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*${UNIT}\b`,
    "i",
  ).exec(text);
  if (range) {
    const factor = toMinutesFactor(range[3] ?? "min");
    const low = Number(range[1]) * factor;
    const high = Number(range[2]) * factor;
    return { low, likely: round((low + high) / 2), high };
  }
  const single = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}\b`, "i").exec(text);
  if (single) return Number(single[1]) * toMinutesFactor(single[2] ?? "min");
  return undefined;
}

function extractWait(text: string): { wait: number; rest: string } {
  const match =
    /\b(?:waits?|waiting|sits?|queued?|idle)\b[^.;]*?\b(\d+(?:\.\d+)?|an?|one|two|three|four|five)\s*(days?|h(?:ou)?rs?|hours?|min(?:ute)?s?)\b/i.exec(
      text,
    );
  if (!match) return { wait: 0, rest: text };
  const amountText = (match[1] ?? "1").toLowerCase();
  const amount = WORD_NUMBERS[amountText] ?? Number(amountText);
  const unit = (match[2] ?? "").toLowerCase();
  const minutes = unit.startsWith("day") ? amount * 1440 : amount * toMinutesFactor(unit);
  return { wait: minutes, rest: text.replace(match[0], " ") };
}

function toMinutesFactor(unit: string): number {
  return unit.toLowerCase().startsWith("h") ? 60 : 1;
}

function errorRateOf(text: string): number {
  if (!/\b(rework|errors?|redo|mistakes?|wrong|corrections?|exceptions?|typos?)\b/i.test(text))
    return 0;
  const percent = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  return percent ? Math.min(1, Number(percent[1]) / 100) : 0;
}

function judgmentOf(text: string): Level {
  if (/\b(judg(?:e)?ment|discretion|negotiat\w*|case[- ]by[- ]case|assess\w*)\b/i.test(text))
    return "high";
  if (/\b(approv\w*|decid\w*|review\w*|verif\w*|check\w*|exceptions?)\b/i.test(text))
    return "medium";
  return "low";
}

function sensitivityOf(text: string): Sensitivity {
  if (/\b(SOX|HIPAA|regulat\w*|legal|bank details|SSN|SIN|payroll|identity)\b/i.test(text))
    return "high";
  if (/\b(PII|GDPR|personal data|compliance|tax|audit)\b/i.test(text)) return "medium";
  if (/\b(customer data|contracts?|vendor|financial)\b/i.test(text)) return "low";
  return "none";
}

function readinessOf(text: string, formats: DataFormat[]): Level {
  if (/\b(scann?ed|handwritten|paper|inconsistent|messy)\b/i.test(text)) return "low";
  if (formats.includes("unstructured")) return "medium";
  if (formats.length > 0 && formats.every((f) => f === "structured")) return "high";
  return "medium";
}

const ACTOR_STOPWORDS = new Set([
  "sales",
  "ops",
  "operations",
  "hr",
  "it",
  "its",
  "this",
  "process",
  "systems",
]);

/** The actor is the leading noun phrase before the first present-tense verb ("AP clerk downloads"). */
function actorOf(text: string): string {
  const words = text.replace(/^the\s+/i, "").split(/\s+/);
  for (let i = 1; i < Math.min(words.length, 5); i++) {
    const word = (words[i] ?? "").replace(/[^A-Za-z]/g, "");
    if (
      /^[a-z]{3,}s$/.test(word) &&
      !ACTOR_STOPWORDS.has(word.toLowerCase()) &&
      !word.endsWith("ss")
    ) {
      return words
        .slice(0, i)
        .join(" ")
        .replace(/[^\w\s-]/g, "");
    }
  }
  return "Unspecified";
}

function firstClause(text: string): string {
  const clause = text.split(/[.;(]|,\s+(?:and\b|but\b|which\b|\d)/)[0]?.trim() ?? text;
  return clause.length > 80 ? `${clause.slice(0, 77).trimEnd()}...` : clause;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base: string, ids: Set<string>): string {
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  ids.add(id);
  return id;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
