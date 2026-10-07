import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "../../src/cli/program.js";
import { loadConfig } from "../../src/config.js";
import { loadWorkflowFile } from "../../src/domain/load.js";
import { PATTERN_LABELS } from "../../src/domain/pattern.js";
import { runAudit, type AuditResult, type Opportunity } from "../../src/prioritize/audit.js";
import { escapeXml as esc, money, months, num, pct } from "../../src/report/format.js";
import { roadmap, summarize, type AuditSummary } from "../../src/report/summary.js";
import { quadrantSvg } from "../../src/report/svg.js";
import { intervalChartSvg } from "./charts.js";
import { page } from "./layout.js";
import { REPO_URL, markdownSection, renderMarkdown, withoutTitle } from "./markdown.js";

export interface SiteBuild {
  outDir: string;
  files: string[];
  result: AuditResult;
}

const DESCRIPTION =
  "Score business workflows for friction and AI suitability, estimate ROI with Monte Carlo uncertainty, and produce a prioritized AI roadmap.";

/** Runs the real CLI in-process and returns its stdout, failing the build on a non-zero exit. */
async function cli(args: string[]): Promise<string> {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    env: {},
  });
  if (code !== 0) throw new Error(`workflow-radar ${args.join(" ")} exited ${code}: ${stderr}`);
  return stdout;
}

function table(headers: string[], rows: string[][], numeric: number[]): string {
  const cls = (i: number) => (numeric.includes(i) ? ' class="n"' : "");
  return `<table><thead><tr>${headers.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${c}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`;
}

function topQuickWin(result: AuditResult): Opportunity {
  const first = result.opportunities.find((o) => o.economics?.quadrant === "quick_win");
  if (first?.economics == null) throw new Error("the bundled examples should produce a quick win");
  return first;
}

function hero(result: AuditResult, s: AuditSummary): string {
  const top = topQuickWin(result);
  const sim = top.economics?.simulation;
  const parked = result.opportunities.filter((o) => o.economics?.quadrant === "deprioritize");
  return `<section id="overview">
<h1>Fund the AI work that pays back, not the best demo.</h1>
<p class="lede">workflow-radar turns discovery-interview estimates into a ranked AI roadmap: explainable friction and AI-suitability scores, a delivery pattern with guardrails for each step, and ROI as a P10/P50/P90 range from a seeded Monte Carlo simulation.</p>
<div class="actions">
<a class="button primary" href="#quickstart">Quickstart</a>
<a class="button" href="report/report.html">Sample report</a>
<a class="button" href="product.html">Product brief</a>
<a class="button" href="${REPO_URL}">GitHub</a>
</div>
<p class="banner"><b>Synthetic data.</b> Every figure on this site is computed at build time by running the tool on the ${s.workflows} bundled synthetic example workflows. The numbers illustrate the method; they are not measurements of any real organization.</p>
<div class="cards">
<div class="card"><b>${s.stepsAssessed}</b>human steps assessed across ${s.workflows} workflows</div>
<div class="card"><b>${s.recommended}</b>steps with a recommended AI pattern; ${parked.length} parked by value or payback</div>
<div class="card"><b>${num(s.nowNextHoursP50)}</b>hours / month freed by the ${s.nowNextCount} Now + Next items (sum of P50s)</div>
<div class="card"><b>${months(sim?.paybackMonths.p50 ?? Number.POSITIVE_INFINITY)}</b>median payback for the top quick win: ${esc(top.workflowName)}, ${esc(top.stepName.toLowerCase())}</div>
</div>
<figure>${quadrantSvg(result)}
<figcaption>Value versus effort for every recommended opportunity. Marker size is P50 hours saved per month; hollow markers are parked because their median payback exceeds the ${result.config.prioritization.maxPaybackMonths}-month horizon.</figcaption></figure>
</section>`;
}

const FEATURES: [string, string][] = [
  [
    "Validated workflow model",
    "YAML or JSON, zod-validated, three-point ranges for every uncertain input, field-qualified errors.",
  ],
  [
    "Explainable scores",
    "Friction and AI suitability are weighted sums; every factor's weight, points, and reason are in the report.",
  ],
  [
    "Pattern rules with guardrails",
    "Copilot, automation with review, or agent, gated by judgment, regulation, and task type before any threshold.",
  ],
  [
    "Monte Carlo ROI",
    "Seeded triangular sampling gives P10/P50/P90 hours, net savings, payback, and P(first-year net > 0).",
  ],
  [
    "Sensitivity",
    "One-at-a-time tornado analysis shows which input to go and measure before funding.",
  ],
  [
    "Roadmap",
    "Value-versus-effort quadrants plus a payback gate produce a ranked Now / Next / Later / Park plan.",
  ],
  [
    "Interview notes parser",
    "Offline heuristic parser by default; Anthropic and OpenAI adapters behind one interface, opt-in by key.",
  ],
  [
    "Portable reports",
    "Markdown, self-contained HTML, SVG, and JSON. Same inputs and seed give byte-identical output.",
  ],
];

function quickstart(): string {
  return `<section id="quickstart">
<h2>Quickstart</h2>
<p>Requires Node.js 20 or later. No API keys, no network access after <code>npm ci</code>.</p>
<pre><code>git clone ${REPO_URL}.git
cd workflow-radar
npm ci
npm run demo   # build, then audit examples/*.yaml into report/</code></pre>
<p>Or run the commands directly after <code>npm run build</code>:</p>
<pre><code>node dist/cli.js score examples/invoice.yaml --explain
node dist/cli.js report examples/*.yaml --out report
node dist/cli.js parse examples/notes/invoice-interview.txt --out draft.yaml</code></pre>
<h3>Features</h3>
<ul class="features">
${FEATURES.map(([title, text]) => `<li><b>${esc(title)}</b>${esc(text)}</li>`).join("\n")}
</ul>
</section>`;
}

function results(
  result: AuditResult,
  s: AuditSummary,
  reportOutput: string,
  scoreOutput: string,
): string {
  const c = s.currency;
  const rows = roadmap(result)
    .filter((phase) => phase.key === "now" || phase.key === "next")
    .flatMap((phase) =>
      phase.opportunities.map((o) => {
        const sim = o.economics?.simulation;
        if (sim === undefined) return [];
        const net = sim.firstYearNet;
        return [
          String(o.rank),
          phase.title,
          `${esc(o.workflowName)}: ${esc(o.stepName)}`,
          esc(PATTERN_LABELS[o.pattern]),
          num(sim.hoursSavedPerMonth.p50),
          esc(`${money(net.p10, c)} / ${money(net.p50, c)} / ${money(net.p90, c)}`),
          months(sim.paybackMonths.p50),
          pct(sim.probabilityPositiveFirstYear),
        ];
      }),
    );
  const ranked = result.opportunities.filter((o) => o.rank !== null && o.rank <= 10);
  const { iterations, seed } = result.config.simulation;
  return `<section id="results">
<h2>Results on the bundled synthetic workflows</h2>
<p>Default config, ${num(iterations)} Monte Carlo iterations per opportunity, seed ${seed}. Regenerated on every site build from <code>examples/*.yaml</code>.</p>
${table(["#", "Phase", "Opportunity", "Pattern", "Hours/mo P50", "First-year net P10 / P50 / P90", "Payback P50", "P(net > 0)"], rows, [0, 4, 5, 6, 7])}
<figure>${intervalChartSvg(ranked, c)}
<figcaption>First-year net for the ten highest-ranked opportunities. Wide lines crossing the dashed break-even rule are fragile bets even when their median looks good.</figcaption></figure>
<details><summary>CLI output: <code>workflow-radar report examples/*.yaml</code></summary>
<pre><code>${esc(reportOutput)}</code></pre></details>
<details><summary>CLI output: <code>workflow-radar score examples/invoice.yaml</code></summary>
<pre><code>${esc(scoreOutput)}</code></pre></details>
</section>`;
}

function sampleReport(): string {
  return `<section id="sample-report">
<h2>Sample report</h2>
<p>The full self-contained HTML report the <code>report</code> command writes for the synthetic examples, including per-factor score breakdowns, ROI tables, and tornado sensitivity for every opportunity. <a href="report/report.html">Open it on its own page</a>, or get the <a href="report/report.md">Markdown</a> and machine-readable <a href="report/audit.json">audit.json</a>.</p>
<iframe class="report" src="report/report.html" title="workflow-radar sample report" loading="lazy"></iframe>
</section>`;
}

function readmeSection(readme: string, heading: string, id: string): string {
  return `<section id="${id}">
<h2>${esc(heading)}</h2>
${renderMarkdown(markdownSection(readme, heading), "")}
</section>`;
}

async function exampleFiles(): Promise<string[]> {
  const names = (await readdir("examples")).filter((n) => /\.(ya?ml|json)$/.test(n)).sort();
  return names.map((n) => `examples/${n}`);
}

/**
 * Builds the static site into `outDir`. Paths are resolved from the current working directory,
 * which must be the repository root (as it is for `npm run site`). The embedded report is
 * written by the CLI itself, so it matches what `npm run sample` commits under docs/.
 */
export async function buildSite(outDir: string): Promise<SiteBuild> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const examples = await exampleFiles();
  const reportDir = join(outDir, "report");

  const reportOutput = await cli(["report", ...examples, "--out", reportDir]);
  const scoreOutput = await cli(["score", "examples/invoice.yaml"]);
  // Deterministic for a fixed seed, so this is the same audit the CLI just wrote to disk.
  const workflows = await Promise.all(examples.map((f) => loadWorkflowFile(f)));
  const result = runAudit(workflows, await loadConfig());
  const s = summarize(result);

  const readme = await readFile("README.md", "utf8");
  const product = await readFile("docs/PRODUCT.md", "utf8");

  const index = page({
    title: "workflow-radar: rank AI opportunities by friction, suitability, and ROI",
    description: DESCRIPTION,
    diagrams: true,
    body: [
      hero(result, s),
      quickstart(),
      results(result, s, reportOutput, scoreOutput),
      sampleReport(),
      readmeSection(readme, "How evaluation works", "evaluation"),
      readmeSection(readme, "Architecture", "architecture"),
      readmeSection(readme, "Design decisions", "design"),
      readmeSection(readme, "Data", "data"),
      readmeSection(readme, "Limitations", "limitations"),
    ].join("\n"),
  });
  const productPage = page({
    title: "workflow-radar: product brief",
    description:
      "Problem, users, scope, requirements, success metrics, trade-offs, risks, and roadmap for workflow-radar.",
    active: "product.html",
    body: `<article class="doc">
<h1>Product brief</h1>
${renderMarkdown(withoutTitle(product), "docs")}
</article>`,
  });

  const files = ["index.html", "product.html", ".nojekyll"];
  await Promise.all([
    writeFile(join(outDir, "index.html"), index),
    writeFile(join(outDir, "product.html"), productPage),
    writeFile(join(outDir, ".nojekyll"), ""),
  ]);
  return {
    outDir,
    files: [
      ...files,
      "report/report.html",
      "report/report.md",
      "report/quadrant.svg",
      "report/audit.json",
    ],
    result,
  };
}
