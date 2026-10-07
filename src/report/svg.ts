import { PATTERN_LABELS, type AutomationPattern } from "../domain/pattern.js";
import type { AuditResult } from "../prioritize/audit.js";
import { escapeXml, truncate } from "./format.js";

export const PATTERN_COLORS: Record<AutomationPattern, string> = {
  copilot: "#2563eb",
  automation_with_review: "#059669",
  agent: "#d97706",
};

const WIDTH = 820;
const HEIGHT = 560;
const PLOT = { left: 64, top: 48, width: 460, height: 440 };
const LEGEND_X = PLOT.left + PLOT.width + 32;

interface Placed {
  x: number;
  y: number;
  r: number;
}

/**
 * Nudges a point along a deterministic spiral until it no longer overlaps any placed point,
 * so opportunities with identical scores stay individually visible.
 */
function dodge(x: number, y: number, r: number, placed: Placed[]): { x: number; y: number } {
  const collides = (cx: number, cy: number) =>
    placed.some((p) => Math.hypot(p.x - cx, p.y - cy) < p.r + r + 1.5);
  for (let step = 0; step < 400; step++) {
    const angle = step * 0.9;
    const radius = step * 0.6;
    const cx = Math.min(PLOT.left + PLOT.width - r, Math.max(PLOT.left + r, x + radius * Math.cos(angle)));
    const cy = Math.min(PLOT.top + PLOT.height - r, Math.max(PLOT.top + r, y + radius * Math.sin(angle)));
    if (!collides(cx, cy)) return { x: cx, y: cy };
  }
  return { x, y };
}

const f = (n: number) => n.toFixed(1);

/** Value-versus-effort quadrant chart as a standalone SVG string (no external assets). */
export function quadrantSvg(result: AuditResult): string {
  const { valueThreshold, effortThreshold, maxPaybackMonths } = result.config.prioritization;
  const points = result.opportunities.flatMap((o) =>
    o.economics === null || o.rank === null || o.pattern === "not_recommended"
      ? []
      : [{ rank: o.rank, label: o.stepName, workflow: o.workflowName, pattern: o.pattern, economics: o.economics }],
  );
  const maxHours = Math.max(1, ...points.map((p) => p.economics.simulation.hoursSavedPerMonth.p50));
  const sx = (effort: number) => PLOT.left + (effort / 100) * PLOT.width;
  const sy = (value: number) => PLOT.top + PLOT.height - (value / 100) * PLOT.height;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="Helvetica, Arial, sans-serif" role="img" aria-labelledby="quadrant-title">`,
    `<title id="quadrant-title">Value versus effort for ${points.length} recommended AI opportunities</title>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>`,
  );

  const tx = sx(effortThreshold);
  const ty = sy(valueThreshold);
  const quadrants = [
    { x: PLOT.left, y: PLOT.top, w: tx - PLOT.left, h: ty - PLOT.top, fill: "#ecfdf5", label: "Quick wins", anchor: "start", lx: PLOT.left + 8, ly: PLOT.top + 18 },
    { x: tx, y: PLOT.top, w: PLOT.left + PLOT.width - tx, h: ty - PLOT.top, fill: "#eff6ff", label: "Big bets", anchor: "end", lx: PLOT.left + PLOT.width - 8, ly: PLOT.top + 18 },
    { x: PLOT.left, y: ty, w: tx - PLOT.left, h: PLOT.top + PLOT.height - ty, fill: "#f9fafb", label: "Fill-ins", anchor: "start", lx: PLOT.left + 8, ly: PLOT.top + PLOT.height - 10 },
    { x: tx, y: ty, w: PLOT.left + PLOT.width - tx, h: PLOT.top + PLOT.height - ty, fill: "#fef2f2", label: "Deprioritize", anchor: "end", lx: PLOT.left + PLOT.width - 8, ly: PLOT.top + PLOT.height - 10 },
  ];
  for (const q of quadrants) {
    out.push(`<rect x="${f(q.x)}" y="${f(q.y)}" width="${f(q.w)}" height="${f(q.h)}" fill="${q.fill}"/>`);
    out.push(`<text x="${f(q.lx)}" y="${f(q.ly)}" font-size="12" font-weight="bold" fill="#6b7280" text-anchor="${q.anchor}">${q.label}</text>`);
  }
  out.push(
    `<rect x="${PLOT.left}" y="${PLOT.top}" width="${PLOT.width}" height="${PLOT.height}" fill="none" stroke="#9ca3af"/>`,
    `<line x1="${f(tx)}" y1="${PLOT.top}" x2="${f(tx)}" y2="${PLOT.top + PLOT.height}" stroke="#9ca3af" stroke-dasharray="4 4"/>`,
    `<line x1="${PLOT.left}" y1="${f(ty)}" x2="${PLOT.left + PLOT.width}" y2="${f(ty)}" stroke="#9ca3af" stroke-dasharray="4 4"/>`,
  );
  for (const tick of [0, 25, 50, 75, 100]) {
    out.push(`<text x="${f(sx(tick))}" y="${PLOT.top + PLOT.height + 18}" font-size="11" fill="#4b5563" text-anchor="middle">${tick}</text>`);
    out.push(`<text x="${PLOT.left - 8}" y="${f(sy(tick) + 4)}" font-size="11" fill="#4b5563" text-anchor="end">${tick}</text>`);
  }
  out.push(
    `<text x="${PLOT.left + PLOT.width / 2}" y="${HEIGHT - 22}" font-size="13" fill="#111827" text-anchor="middle">Effort score (higher = harder)</text>`,
    `<text transform="translate(18 ${PLOT.top + PLOT.height / 2}) rotate(-90)" font-size="13" fill="#111827" text-anchor="middle">Value score (P50 annual net savings vs cap)</text>`,
    `<text x="${PLOT.left}" y="28" font-size="16" font-weight="bold" fill="#111827">AI opportunities: value vs effort</text>`,
  );

  const placed: Placed[] = [];
  for (const p of points) {
    const r = 6 + 12 * Math.sqrt(p.economics.simulation.hoursSavedPerMonth.p50 / maxHours);
    const { x, y } = dodge(sx(p.economics.effort.score), sy(p.economics.value), r, placed);
    placed.push({ x, y, r });
    const color = PATTERN_COLORS[p.pattern];
    // Hollow markers flag opportunities parked by the payback gate despite their grid position.
    const parked = !(p.economics.simulation.paybackMonths.p50 <= maxPaybackMonths);
    const tooltip = `#${p.rank} ${p.workflow}: ${p.label}${parked ? " (parked: payback)" : ""}`;
    const circle = parked
      ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#ffffff" stroke="${color}" stroke-width="2" stroke-dasharray="3 2"/>`
      : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}" fill-opacity="0.82" stroke="#ffffff" stroke-width="1.5"/>`;
    out.push(
      `<g class="opportunity"><title>${escapeXml(tooltip)}</title>${circle}`,
      `<text x="${f(x)}" y="${f(y + 4)}" font-size="${r >= 10 ? 11 : 9}" font-weight="bold" fill="${parked ? color : "#ffffff"}" text-anchor="middle">${p.rank}</text></g>`,
    );
  }

  let ly = PLOT.top + 4;
  out.push(`<text x="${LEGEND_X}" y="${ly}" font-size="12" font-weight="bold" fill="#111827">Pattern</text>`);
  for (const pattern of Object.keys(PATTERN_COLORS) as AutomationPattern[]) {
    ly += 18;
    out.push(
      `<circle cx="${LEGEND_X + 6}" cy="${ly - 4}" r="6" fill="${PATTERN_COLORS[pattern]}" fill-opacity="0.82"/>`,
      `<text x="${LEGEND_X + 18}" y="${ly}" font-size="12" fill="#374151">${PATTERN_LABELS[pattern]}</text>`,
    );
  }
  ly += 18;
  out.push(`<text x="${LEGEND_X}" y="${ly}" font-size="11" fill="#6b7280">Size = P50 hours saved per month</text>`);
  ly += 16;
  out.push(
    `<text x="${LEGEND_X}" y="${ly}" font-size="11" fill="#6b7280">Hollow = parked, P50 payback &gt; ${maxPaybackMonths} mo</text>`,
  );
  ly += 26;
  out.push(`<text x="${LEGEND_X}" y="${ly}" font-size="12" font-weight="bold" fill="#111827">Rank</text>`);
  for (const p of points) {
    ly += 15;
    if (ly > HEIGHT - 12) break;
    out.push(`<text x="${LEGEND_X}" y="${ly}" font-size="10.5" fill="#374151">${p.rank}. ${escapeXml(truncate(p.label, 40))}</text>`);
  }
  out.push("</svg>");
  return out.join("\n") + "\n";
}
