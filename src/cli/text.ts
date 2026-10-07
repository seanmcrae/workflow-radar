import { toRange } from "../domain/estimate.js";
import { PATTERN_LABELS } from "../domain/pattern.js";
import type { Workflow } from "../domain/schema.js";
import type { Opportunity } from "../prioritize/audit.js";
import { months, num, rangeText } from "../report/format.js";

export function textTable(
  headers: string[],
  rows: string[][],
  rightAligned: number[] = [],
): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const pad = (cells: string[]) =>
    cells
      .map((c, i) =>
        rightAligned.includes(i) ? c.padStart(widths[i] ?? 0) : c.padEnd(widths[i] ?? 0),
      )
      .join("  ")
      .trimEnd();
  return [pad(headers), pad(widths.map((w) => "-".repeat(w))), ...rows.map(pad)].join("\n");
}

export interface ScoredStep {
  index: number;
  name: string;
  opportunity: Opportunity | null;
}

export function renderScore(
  workflow: Workflow,
  steps: ScoredStep[],
  friction: number,
  explain: boolean,
): string {
  const lines: string[] = [
    `${workflow.name} (${workflow.team})${workflow.synthetic ? " [synthetic data]" : ""}`,
    `Volume ${rangeText(toRange(workflow.volumePerMonth))} / month · workflow friction ${num(friction, 1)}`,
    "",
  ];
  const rows = steps.map(({ index, name, opportunity: o }) => {
    if (o === null) return [String(index), name, "-", "-", "-", "system step (skipped)", "-", "-"];
    const e = o.economics;
    return [
      String(index),
      name,
      o.suitability.task.taskType,
      num(o.friction.score),
      num(o.suitability.score),
      PATTERN_LABELS[o.pattern],
      e ? num(e.simulation.hoursSavedPerMonth.p50) : "-",
      e ? months(e.simulation.paybackMonths.p50) : "-",
    ];
  });
  lines.push(
    textTable(
      [
        "#",
        "Step",
        "Task type",
        "Friction",
        "Suitability",
        "Pattern",
        "Hours/mo P50",
        "Payback P50",
      ],
      rows,
      [0, 3, 4, 6, 7],
    ),
  );

  if (explain) {
    for (const { index, name, opportunity: o } of steps) {
      if (o === null) continue;
      lines.push("", `${index}. ${name}`);
      lines.push(`   friction ${num(o.friction.score, 1)}:`);
      for (const f of o.friction.factors)
        lines.push(`     ${f.factor.padEnd(14)} +${num(f.points, 1).padStart(5)}  ${f.note}`);
      lines.push(`   suitability ${num(o.suitability.score, 1)}:`);
      for (const f of o.suitability.factors)
        lines.push(`     ${f.factor.padEnd(14)} +${num(f.points, 1).padStart(5)}  ${f.note}`);
      lines.push(`   pattern: ${PATTERN_LABELS[o.pattern]}. ${o.patternRationale}`);
      for (const g of o.guardrails) lines.push(`   guardrail: ${g}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
