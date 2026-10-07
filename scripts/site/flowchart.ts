import { escapeXml } from "../../src/report/format.js";

/**
 * Offline rendering for the README's Mermaid flowchart. The site loads Mermaid from a CDN when
 * it can; this layered SVG is what readers see without network access or JavaScript. It covers
 * the subset the README uses: `id["label"]` nodes and `-->` edges.
 */

export interface Flowchart {
  /** Node id to label lines, in first-seen order. */
  nodes: Map<string, string[]>;
  edges: { from: string; to: string }[];
}

const NODE = String.raw`([A-Za-z_][\w-]*)(?:\["([^"]*)"\])?`;
const EDGE = new RegExp(String.raw`^${NODE}\s*-->\s*${NODE}$`);

export function parseFlowchart(source: string): Flowchart {
  const nodes = new Map<string, string[]>();
  const edges: Flowchart["edges"] = [];
  const declare = (id: string, label: string | undefined) => {
    if (label !== undefined) nodes.set(id, label.split(/<br\s*\/?>/i));
    else if (!nodes.has(id)) nodes.set(id, [id]);
  };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%") || /^(flowchart|graph)\b/.test(line)) continue;
    const match = EDGE.exec(line);
    if (match === null) throw new Error(`unsupported flowchart line: ${line}`);
    const [, from, fromLabel, to, toLabel] = match;
    if (from === undefined || to === undefined) throw new Error(`malformed edge: ${line}`);
    declare(from, fromLabel);
    declare(to, toLabel);
    edges.push({ from, to });
  }
  return { nodes, edges };
}

/**
 * Longest-path layering, then each source node is pulled down to sit directly above its
 * nearest successor so inputs such as the config file appear next to the step they feed.
 */
export function assignLayers(chart: Flowchart): Map<string, number> {
  const layer = new Map<string, number>([...chart.nodes.keys()].map((id) => [id, 0]));
  for (let pass = 0; pass < chart.nodes.size; pass++) {
    let changed = false;
    for (const { from, to } of chart.edges) {
      const next = (layer.get(from) ?? 0) + 1;
      if (next > (layer.get(to) ?? 0)) {
        layer.set(to, next);
        changed = true;
      }
    }
    if (!changed) break;
    if (pass === chart.nodes.size - 1) throw new Error("flowchart contains a cycle");
  }
  const hasIncoming = new Set(chart.edges.map((e) => e.to));
  for (const id of chart.nodes.keys()) {
    if (hasIncoming.has(id)) continue;
    const successors = chart.edges.filter((e) => e.from === id).map((e) => layer.get(e.to) ?? 1);
    if (successors.length > 0) layer.set(id, Math.min(...successors) - 1);
  }
  return layer;
}

const CHAR_WIDTH = 7;
const LINE_HEIGHT = 16;
const PAD_X = 14;
const PAD_Y = 10;
const ROW_GAP = 34;
const COL_GAP = 28;
const MARGIN = 12;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function flowchartSvg(chart: Flowchart, title: string): string {
  const layers = assignLayers(chart);
  const rows: string[][] = [];
  for (const [id, index] of layers) (rows[index] ??= []).push(id);

  const size = (id: string) => {
    const lines = chart.nodes.get(id) ?? [id];
    return {
      width: Math.max(150, Math.max(...lines.map((l) => l.length)) * CHAR_WIDTH + 2 * PAD_X),
      height: lines.length * LINE_HEIGHT + 2 * PAD_Y,
    };
  };
  const rowWidth = (row: string[]) =>
    row.reduce((sum, id) => sum + size(id).width, 0) + COL_GAP * (row.length - 1);
  const width = Math.max(...rows.map((row) => rowWidth(row))) + 2 * MARGIN;

  const boxes = new Map<string, Box>();
  let y = MARGIN;
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((id) => size(id).height));
    let x = (width - rowWidth(row)) / 2;
    for (const id of row) {
      const s = size(id);
      boxes.set(id, { x, y: y + (rowHeight - s.height) / 2, ...s });
      x += s.width + COL_GAP;
    }
    y += rowHeight + ROW_GAP;
  }
  const height = y - ROW_GAP + MARGIN;

  const parts: string[] = [];
  for (const { from, to } of chart.edges) {
    const a = boxes.get(from);
    const b = boxes.get(to);
    if (a === undefined || b === undefined) continue;
    const x1 = a.x + a.width / 2;
    const y1 = a.y + a.height;
    const x2 = b.x + b.width / 2;
    const y2 = b.y - 2;
    parts.push(
      `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} C${x1.toFixed(1)},${(y1 + 18).toFixed(1)} ${x2.toFixed(1)},${(y2 - 18).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrow)"/>`,
    );
  }
  for (const [id, box] of boxes) {
    const lines = chart.nodes.get(id) ?? [id];
    parts.push(
      `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" rx="8" fill="#eef2ff" stroke="#6366f1"/>`,
    );
    lines.forEach((line, i) => {
      const ty = box.y + PAD_Y + LINE_HEIGHT * (i + 0.75);
      parts.push(
        `<text x="${(box.x + box.width / 2).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="13" fill="#111827">${escapeXml(line)}</text>`,
      );
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" width="${width.toFixed(0)}" height="${height.toFixed(0)}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${escapeXml(title)}">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6b7280"/></marker></defs>
${parts.join("\n")}
</svg>`;
}
