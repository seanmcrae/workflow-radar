import { PATTERN_LABELS } from "../../src/domain/pattern.js";
import type { Opportunity } from "../../src/prioritize/audit.js";
import { escapeXml, money, truncate } from "../../src/report/format.js";
import { PATTERN_COLORS } from "../../src/report/svg.js";

const WIDTH = 820;
const LABEL_WIDTH = 330;
const PLOT_LEFT = LABEL_WIDTH + 16;
const PLOT_RIGHT = WIDTH - 48;
const ROW = 34;
const TOP = 40;
const AXIS = 36;

/** Rounds a tick step to 1, 2, or 5 times a power of ten. */
export function niceStep(span: number, targetTicks = 5): number {
  if (span <= 0) return 1;
  const raw = span / targetTicks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 5, 10].find((f) => f * power >= raw) ?? 10;
  return factor * power;
}

/**
 * First-year net P10-P50-P90 per opportunity: the line is the 80% interval, the dot the
 * median, and the dashed rule break-even. Shows at a glance which bets are fragile.
 */
export function intervalChartSvg(opportunities: Opportunity[], currency: string): string {
  const rows = opportunities.flatMap((o) =>
    o.economics === null || o.pattern === "not_recommended"
      ? []
      : [{ o, pattern: o.pattern, net: o.economics.simulation.firstYearNet }],
  );
  if (rows.length === 0)
    throw new Error("interval chart needs at least one recommended opportunity");

  const values = rows.flatMap((r) => [r.net.p10, r.net.p90]).concat(0);
  const step = niceStep(Math.max(...values) - Math.min(...values));
  const min = Math.floor(Math.min(...values) / step) * step;
  const max = Math.ceil(Math.max(...values) / step) * step;
  const x = (v: number) => PLOT_LEFT + ((v - min) / (max - min)) * (PLOT_RIGHT - PLOT_LEFT);
  const height = TOP + rows.length * ROW + AXIS;
  const bottom = TOP + rows.length * ROW;
  const f = (n: number) => n.toFixed(1);

  const parts: string[] = [
    `<text x="${PLOT_LEFT}" y="22" font-size="13" fill="#374151">First-year net, P10 to P90 (dot = P50)</text>`,
  ];
  for (let v = min; v <= max + step / 2; v += step) {
    parts.push(
      `<line x1="${f(x(v))}" y1="${TOP - 6}" x2="${f(x(v))}" y2="${bottom}" stroke="#e5e7eb"/>`,
      `<text x="${f(x(v))}" y="${bottom + 18}" font-size="11" fill="#6b7280" text-anchor="middle">${escapeXml(money(v, currency))}</text>`,
    );
  }
  parts.push(
    `<line x1="${f(x(0))}" y1="${TOP - 6}" x2="${f(x(0))}" y2="${bottom}" stroke="#111827" stroke-dasharray="4 3"/>`,
  );
  rows.forEach(({ o, pattern, net }, i) => {
    const cy = TOP + i * ROW + ROW / 2;
    const color = PATTERN_COLORS[pattern];
    const label = `${String(o.rank)}. ${o.workflowName}: ${o.stepName}`;
    parts.push(
      `<text x="${LABEL_WIDTH}" y="${f(cy + 4)}" font-size="12" fill="#111827" text-anchor="end"><title>${escapeXml(label)}</title>${escapeXml(truncate(label, 48))}</text>`,
      `<line x1="${f(x(net.p10))}" y1="${f(cy)}" x2="${f(x(net.p90))}" y2="${f(cy)}" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.55"/>`,
      `<circle cx="${f(x(net.p50))}" cy="${f(cy)}" r="6" fill="${color}"><title>${escapeXml(`${PATTERN_LABELS[pattern]}: P10 ${money(net.p10, currency)}, P50 ${money(net.p50, currency)}, P90 ${money(net.p90, currency)}`)}</title></circle>`,
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="First-year net P10 to P90 interval per opportunity">
<rect width="${WIDTH}" height="${height}" fill="#ffffff"/>
${parts.join("\n")}
</svg>`;
}
