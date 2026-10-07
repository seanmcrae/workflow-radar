import { PATTERN_LABELS } from "../domain/pattern.js";
import { QUADRANT_LABELS, type AuditResult, type Opportunity } from "../prioritize/audit.js";
import { ROI_INPUT_LABELS } from "../roi/model.js";
import type { TornadoBar } from "../roi/sensitivity.js";
import { escapeXml as esc, money, months, num, pct, rangeText } from "./format.js";
import type { ReportMeta } from "./markdown.js";
import { roadmap, summarize } from "./summary.js";
import { PATTERN_COLORS, quadrantSvg } from "./svg.js";

const CSS = `
:root { color-scheme: light; }
body { font: 15px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; margin: 0; background: #f9fafb; }
main { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; background: #fff; }
h1 { font-size: 28px; margin: 0 0 8px; } h2 { margin-top: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
h3 { margin-top: 28px; } .muted { color: #6b7280; } .banner { background: #fffbeb; border: 1px solid #fcd34d; padding: 10px 14px; border-radius: 6px; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f3f4f6; font-weight: 600; } td.n { text-align: right; font-variant-numeric: tabular-nums; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; color: #fff; font-size: 12px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 16px 0; }
.card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; } .card b { display: block; font-size: 22px; }
details { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 14px; margin: 10px 0; }
summary { cursor: pointer; font-weight: 600; }
.tornado { position: relative; height: 16px; background: #f3f4f6; border-radius: 3px; min-width: 220px; }
.tornado span { position: absolute; top: 0; height: 16px; background: #6366f1; border-radius: 3px; }
.tornado i { position: absolute; top: -2px; width: 2px; height: 20px; background: #111827; }
svg { max-width: 100%; height: auto; }
`;

function pill(o: Opportunity): string {
  const color = o.pattern === "not_recommended" ? "#6b7280" : PATTERN_COLORS[o.pattern];
  return `<span class="pill" style="background:${color}">${PATTERN_LABELS[o.pattern]}</span>`;
}

function tableHtml(headers: string[], rows: string[][], numeric: number[] = []): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="n"' : ""}>${c}</td>`).join("")}</tr>`,
    )
    .join("\n");
  return `<table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

function tornadoRows(bars: TornadoBar[], baseline: number, currency: string): string[][] {
  const top = bars.slice(0, 5);
  const values = top.flatMap((b) => [b.outputAtLow, b.outputAtHigh]).concat(baseline);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pos = (v: number) => ((v - min) / span) * 100;
  return top.map((b) => {
    const lo = Math.min(b.outputAtLow, b.outputAtHigh);
    const hi = Math.max(b.outputAtLow, b.outputAtHigh);
    const bar = `<div class="tornado"><span style="left:${pos(lo).toFixed(1)}%;width:${Math.max(0.5, pos(hi) - pos(lo)).toFixed(1)}%"></span><i style="left:${pos(baseline).toFixed(1)}%"></i></div>`;
    return [
      esc(ROI_INPUT_LABELS[b.input]),
      esc(money(b.outputAtLow, currency)),
      bar,
      esc(money(b.outputAtHigh, currency)),
    ];
  });
}

function detail(o: Opportunity, currency: string): string {
  const e = o.economics;
  if (!e) return "";
  const sim = e.simulation;
  const factorRows = [
    ...o.friction.factors.map((f) => [
      "Friction",
      esc(f.factor),
      num(f.value, 2),
      num(f.weight, 2),
      num(f.points, 1),
      esc(f.note),
    ]),
    ...o.suitability.factors.map((f) => [
      "Suitability",
      esc(f.factor),
      num(f.value, 2),
      num(f.weight, 2),
      num(f.points, 1),
      esc(f.note),
    ]),
  ];
  const roiRows = [
    [
      "Hours saved / month",
      num(e.point.hoursSavedPerMonth),
      num(sim.hoursSavedPerMonth.p10),
      num(sim.hoursSavedPerMonth.p50),
      num(sim.hoursSavedPerMonth.p90),
    ],
    [
      "Net savings / month",
      ...[e.point.monthlyNet, sim.monthlyNet.p10, sim.monthlyNet.p50, sim.monthlyNet.p90].map((v) =>
        esc(money(v, currency)),
      ),
    ],
    [
      "First-year net",
      ...[
        e.point.firstYearNet,
        sim.firstYearNet.p10,
        sim.firstYearNet.p50,
        sim.firstYearNet.p90,
      ].map((v) => esc(money(v, currency))),
    ],
    [
      "Payback",
      ...[
        e.point.paybackMonths,
        sim.paybackMonths.p10,
        sim.paybackMonths.p50,
        sim.paybackMonths.p90,
      ].map(months),
    ],
  ];
  return `<details${e.quadrant === "quick_win" ? " open" : ""}>
<summary>${o.rank}. ${esc(o.workflowName)}: ${esc(o.stepName)} ${pill(o)} <span class="muted">${QUADRANT_LABELS[e.quadrant]}</span></summary>
<p>${esc(o.patternRationale)} Actor: ${esc(o.actor)}.</p>
<p>Friction <b>${num(o.friction.score)}</b> · AI suitability <b>${num(o.suitability.score)}</b> · Value <b>${num(e.value)}</b> · Effort <b>${num(e.effort.score)}</b>
(${e.effort.components.map((c) => `${num(c.points)} ${esc(c.note)}`).join(" + ")})</p>
${tableHtml(["Score", "Factor", "Value", "Weight", "Points", "Why"], factorRows, [2, 3, 4])}
${tableHtml(["Metric", "Likely inputs", "P10", "P50", "P90"], roiRows, [1, 2, 3, 4])}
<p class="muted">Sensitivity of first-year net: each input swung across its range with the others at likely; the black tick is the likely-input estimate.</p>
${tableHtml(["Input", "Net at low", "", "Net at high"], tornadoRows(e.tornado, e.point.firstYearNet, currency), [1, 3])}
${o.guardrails.length > 0 ? `<p><b>Guardrails</b></p><ul>${o.guardrails.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
</details>`;
}

/** Self-contained HTML report: inline CSS and SVG, no scripts or external requests. */
export function renderHtml(result: AuditResult, meta: ReportMeta): string {
  const s = summarize(result);
  const c = s.currency;
  const cfg = result.config;
  const sections: string[] = [];

  sections.push(`<h1>${esc(meta.title)}</h1>
<p class="muted">Generated by ${esc(meta.generator)} from ${meta.sources.map((x) => `<code>${esc(x)}</code>`).join(", ")}. Monte Carlo: ${num(cfg.simulation.iterations)} iterations, seed ${cfg.simulation.seed}.</p>`);
  if (s.syntheticWorkflows > 0) {
    sections.push(
      `<p class="banner"><b>Synthetic data.</b> ${s.syntheticWorkflows} of ${s.workflows} workflows are marked synthetic. Figures illustrate the method and are not measurements of any real organization.</p>`,
    );
  }
  sections.push(`<div class="cards">
<div class="card"><b>${s.stepsAssessed}</b>human steps assessed</div>
<div class="card"><b>${s.recommended}</b>recommended opportunities</div>
<div class="card"><b>${num(s.nowNextHoursP50)}</b>hours / month, Now + Next (sum of P50s)</div>
<div class="card"><b>${esc(money(s.nowNextFirstYearNetP50, c))}</b>first-year net, Now + Next (sum of P50s)</div>
</div>`);

  sections.push("<h2>Roadmap</h2>");
  for (const phase of roadmap(result)) {
    sections.push(`<h3>${phase.title}</h3><p class="muted">${esc(phase.description)}</p>`);
    if (phase.opportunities.length === 0) {
      sections.push("<p><i>None.</i></p>");
      continue;
    }
    sections.push(
      tableHtml(
        [
          "#",
          "Workflow",
          "Step",
          "Pattern",
          "Value",
          "Effort",
          "Hours/mo P50",
          "First-year net P10 / P50 / P90",
          "Payback P50",
          "P(net > 0)",
        ],
        phase.opportunities.map((o) => {
          const e = o.economics;
          if (!e) return [];
          const net = e.simulation.firstYearNet;
          return [
            String(o.rank),
            esc(o.workflowName),
            esc(o.stepName),
            pill(o),
            num(e.value),
            num(e.effort.score),
            num(e.simulation.hoursSavedPerMonth.p50),
            esc(`${money(net.p10, c)} / ${money(net.p50, c)} / ${money(net.p90, c)}`),
            months(e.simulation.paybackMonths.p50),
            pct(e.simulation.probabilityPositiveFirstYear),
          ];
        }),
        [0, 4, 5, 6, 7, 8, 9],
      ),
    );
  }
  if (s.notRecommended.length > 0) {
    sections.push(
      "<h3>Not recommended</h3>",
      tableHtml(
        ["Workflow", "Step", "Friction", "Suitability", "Reason"],
        s.notRecommended.map((o) => [
          esc(o.workflowName),
          esc(o.stepName),
          num(o.friction.score),
          num(o.suitability.score),
          esc(o.patternRationale),
        ]),
        [2, 3],
      ),
    );
  }

  sections.push("<h2>Value vs effort</h2>", quadrantSvg(result));
  sections.push(
    "<h2>Workflows</h2>",
    tableHtml(
      [
        "Workflow",
        "Team",
        "Volume / month",
        "Labor hours / month",
        "Friction",
        "Human / system steps",
        "Synthetic",
      ],
      result.workflows.map((w) => [
        esc(w.name),
        esc(w.team),
        rangeText(w.volumePerMonth),
        num(w.laborHoursPerMonth),
        num(w.friction),
        `${w.humanSteps} / ${w.systemSteps}`,
        w.synthetic ? "yes" : "no",
      ]),
      [3, 4],
    ),
  );
  sections.push(
    "<h2>Opportunity details</h2>",
    ...result.opportunities.map((o) => detail(o, c)).filter(Boolean),
  );
  sections.push(`<h2>Method</h2><ul>
<li><b>Friction</b>: weighted average of hands-on time, rework, handoffs, and wait, each normalized to a saturation point.</li>
<li><b>AI suitability</b>: weighted average of task-type fit, data readiness, judgment (inverted), and regulatory risk (inverted).</li>
<li><b>Hours saved / month</b> = volume × share of runs × minutes × (1 + rework rate) ÷ 60 × automation fraction.</li>
<li><b>First-year net</b> = 12 × (hours saved × loaded hourly cost − run cost) − implementation cost; inputs sampled from independent triangular distributions.</li>
<li><b>Value</b> = P50 annual net savings ÷ ${esc(money(cfg.prioritization.valueCapAnnual, c))} (capped at 100); quadrant thresholds value ${cfg.prioritization.valueThreshold}, effort ${cfg.prioritization.effortThreshold}.</li>
</ul>`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${sections.join("\n")}
</main>
</body>
</html>
`;
}
