# workflow-radar

![CI](https://github.com/seanmcrae/workflow-radar/actions/workflows/ci.yml/badge.svg)

A command-line tool for running an AI-opportunity audit of business workflows. You describe each workflow as a list of steps (who does it, how long it takes, how often it is redone, how many handoffs, what data it uses, how much judgment and regulatory exposure it carries), and workflow-radar scores friction and AI suitability, recommends a delivery pattern with guardrails, estimates ROI as a P10/P50/P90 range with a seeded Monte Carlo simulation, and writes a prioritized roadmap as Markdown, self-contained HTML, SVG, and JSON. Every score is a transparent weighted sum whose weights live in a config file, and every number in the report can be traced back to the inputs that produced it. The aim is to pick AI initiatives by measured friction and expected value rather than by whichever demo was most impressive.

## Quickstart

Requires Node.js 20 or later.

```bash
git clone https://github.com/seanmcrae/workflow-radar.git
cd workflow-radar
npm ci
npm run build

# Score one workflow step by step (add --explain for factor-level detail)
node dist/cli.js score examples/invoice.yaml

# Audit all bundled examples and write report/report.{md,html}, quadrant.svg, audit.json
node dist/cli.js report examples/*.yaml --out report

# Draft a workflow YAML from free-text interview notes (offline heuristic parser by default)
node dist/cli.js parse examples/notes/invoice-interview.txt --out draft.yaml
```

After `npm link` (or a global install) the same commands are available as `audit score ...` / `workflow-radar score ...`. `npm run demo` builds and runs the report command; `npm run sample` regenerates the committed sample report.

## Example output

All output below was produced by the commands shown, on the bundled **synthetic** example workflows (`examples/*.yaml`). The numbers illustrate the method; they are not measurements of any real organization.

`node dist/cli.js report examples/*.yaml --out report`:

```text
Assessed 23 human steps across 4 workflows (4 synthetic); 21 recommended, 2 not recommended.

Phase   #  Opportunity                                                                 Hours/mo P50  1st-yr net P50  Payback P50
-----  --  --------------------------------------------------------------------------  ------------  --------------  -----------
Now     1  Customer support triage: Draft first response                                        837        $333,756       1.2 mo
Now     2  Customer support triage: Read new ticket and tag product area and intent             359        $114,925       3.0 mo
Now     3  Sales proposal drafting: Draft proposal narrative and scope                          105         $72,012       4.2 mo
Now     4  Invoice processing: Key invoice header and line items into the ERP                   176         $66,135       4.5 mo
Now     5  Customer support triage: Escalate to Tier 2 with a case summary                      208         $46,037       5.4 mo
Next    6  Customer support triage: Look up customer account and order history                  283         $80,893       3.9 mo
Later   7  Sales proposal drafting: Answer customer security questionnaire                       31         $18,327       5.1 mo
Later   8  Customer support triage: Set priority and route to the right queue                   131         $10,437       9.4 mo
Later   9  Sales proposal drafting: Map customer requirements to product capabilities            50          $8,549       9.8 mo
Later  10  Invoice processing: Resolve three-way match exceptions                                37          $7,480       7.7 mo
Later  11  Sales proposal drafting: Build pricing and approve discounts                          14            -$31      12.0 mo
Later  12  Customer support triage: Decide on refund or goodwill credit                          32         -$2,138      14.2 mo
Later  13  Invoice processing: Assign GL codes and cost centers                                  64         -$6,822      14.6 mo
Park   14  Invoice processing: Approve invoices above the $5,000 threshold                       15         -$7,202      26.0 mo
Park   15  Employee onboarding: Collect and verify new-hire documents                             9        -$11,339      76.2 mo
Park   16  Employee onboarding: Enter new hire into payroll                                       4        -$14,436   no payback
Park   17  Invoice processing: Download invoice attachments from the AP inbox                    37        -$24,875      33.9 mo
Park   18  Employee onboarding: Answer policy and benefits questions                             30        -$30,957      58.5 mo
Park   19  Sales proposal drafting: Summarize discovery call notes                               12        -$35,001     116.7 mo
Park   20  Employee onboarding: Draft a personalized first-week plan                             19        -$37,344     > 120 mo
Park   21  Employee onboarding: Request accounts and access for each system                      22       -$114,258   no payback

Wrote report/report.md, report/report.html, report/quadrant.svg, report/audit.json
```

`node dist/cli.js score examples/invoice.yaml`:

```text
Invoice processing (Accounts Payable) [synthetic data]
Volume 1,800 (1,500–2,200) / month · workflow friction 16.8

#  Step                                            Task type       Friction  Suitability  Pattern                 Hours/mo P50  Payback P50
-  ----------------------------------------------  --------------  --------  -----------  ----------------------  ------------  -----------
1  Download invoice attachments from the AP inbox  extraction             3           87  Automation with review            37      33.9 mo
2  Key invoice header and line items into the ERP  extraction            17           84  Automation with review           176       4.5 mo
3  Assign GL codes and cost centers                classification        10           84  Automation with review            64      14.6 mo
4  Resolve three-way match exceptions              decision              35           55  Copilot                           37       7.7 mo
5  Approve invoices above the $5,000 threshold     decision              30           50  Copilot                           15      26.0 mo
6  Scheduled payment run                           -                      -            -  system step (skipped)              -            -
```

`--explain` shows where each score comes from:

```text
2. Key invoice header and line items into the ERP
   friction 16.7:
     time           +  4.7  8 min hands-on per run (saturates at 60)
     rework         + 12.0  12% of runs need rework (saturates at 25%)
     handoffs       +  0.0  0 handoffs (saturates at 4)
     wait           +  0.0  0 min waiting (saturates at 1440)
   suitability 83.5:
     taskType       + 31.5  extraction (inferred from "key")
     dataReadiness  + 15.0  data readiness medium
     judgment       + 20.0  low judgment required
     risk           + 17.0  regulatory sensitivity low
   pattern: Automation with review. Suitability 84 supports automation with human review of exceptions.
   guardrail: Route low-confidence outputs to a review queue and sample-audit a fixed share of auto-accepted items.
```

The quadrant chart is generated in code as inline SVG (no charting library, no CDN). Marker size is P50 hours saved per month; hollow markers are opportunities parked because their median payback exceeds the 18-month horizon.

![Value vs effort quadrant for the bundled synthetic workflows](docs/img/quadrant.svg)

The full generated report is committed under [`docs/sample-report/`](docs/sample-report/): [`report.md`](docs/sample-report/report.md), [`report.html`](docs/sample-report/report.html) (open locally; it has no external dependencies), and the machine-readable [`audit.json`](docs/sample-report/audit.json).

One pattern the synthetic data makes visible: the steps with the highest per-run friction (legal review, document collection, pricing approval, all around 60) are not the best AI opportunities. Low-friction steps at high volume (support replies at 12,000 tickets a month) dominate value, while the high-friction steps are blocked by judgment, regulation, or low volume. That gap between "feels painful" and "pays back" is the reason the tool scores friction, suitability, and value separately.

## Workflow format

```yaml
# SYNTHETIC example
id: invoice-processing
name: Invoice processing
team: Accounts Payable
synthetic: true
volumePerMonth: { low: 1500, likely: 1800, high: 2200 } # any number can be a three-point range
loadedHourlyCost: { low: 48, likely: 55, high: 62 }
steps:
  - id: match-exceptions
    name: Resolve three-way match exceptions
    description: Investigate mismatches, email purchasing, and decide whether to hold or adjust.
    actor: AP specialist
    volumeShare: { low: 0.12, likely: 0.18, high: 0.25 } # share of runs that reach this step
    durationMinutes: { low: 10, likely: 15, high: 30 } # hands-on time per run
    waitMinutes: { low: 240, likely: 480, high: 1440 } # queue time; friction only, not labor
    errorRate: 0.1 # share of runs redone
    handoffs: 2
    dataInputs: [{ name: purchase order, format: structured }]
    systems: [SAP, Outlook]
    judgmentLevel: medium # low | medium | high
    regulatorySensitivity: low # none | low | medium | high
    dataReadiness: medium # low | medium | high
    # taskType: decision             # optional; inferred from name/description when omitted
```

Files are validated with zod. Unknown keys are rejected (typos surface instead of silently defaulting) and errors carry field paths, for example `steps.0.errorRate: Too big: expected number to be <=1`. JSON input works the same way.

## Architecture

```mermaid
flowchart LR
    notes["Interview notes (.txt)"] --> parse["parse: NotesProvider<br/>mock | anthropic | openai"]
    parse --> draft["Draft workflow YAML"]
    yaml["Workflow YAML / JSON"] --> load["zod schema validation"]
    draft --> load
    cfg["config/default.yaml<br/>(weights, thresholds, cost bands)"] --> score
    load --> score["Scoring<br/>friction + AI suitability"]
    score --> pattern["Pattern rules + guardrails"]
    pattern --> roi["ROI model<br/>Monte Carlo P10/P50/P90<br/>tornado sensitivity"]
    roi --> prio["Value vs effort quadrant<br/>payback gate, ranking"]
    prio --> out["Report<br/>Markdown, HTML, SVG, JSON"]
```

| Module           | Responsibility                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `src/domain`     | zod schemas for workflows and steps, three-point estimates, YAML/JSON loading with path-qualified errors |
| `src/config.ts`  | Config schema, defaults (mirrored in `config/default.yaml`), deep-merge of partial overrides             |
| `src/scoring`    | Friction score, task-type classifier, AI suitability score; each returns per-factor contributions        |
| `src/roi`        | ROI equations, mulberry32 PRNG, triangular sampling, Monte Carlo summary, one-at-a-time tornado analysis |
| `src/prioritize` | Pattern recommendation, guardrail notes, effort score, quadrant placement, audit orchestration           |
| `src/parse`      | `NotesProvider` interface, deterministic heuristic parser, Anthropic and OpenAI adapters over `fetch`    |
| `src/report`     | Markdown and HTML renderers, inline SVG quadrant chart, JSON serialization                               |
| `src/cli`        | commander program; `run()` returns an exit code so the CLI is tested in-process                          |

## Design decisions

- **Transparent weighted sums over a learned model.** There is no labelled dataset of "AI projects that paid back" to train on, and the people who act on an audit need to argue with it. Every score is `sum(weight x normalized factor)`, the weights are in YAML, and each factor's points and a one-line reason are in the report.
- **Hard rules before thresholds.** Pattern selection checks task type, regulatory sensitivity, judgment, and decision tasks before it looks at the suitability score, so a high score cannot buy autonomy on a regulated or high-judgment step. Agents additionally require low risk, low judgment, at least two systems, and at least one handoff.
- **Ranges, not point estimates.** Volume, duration, rework, hourly cost, automation fraction, build cost, and run cost are all three-point ranges sampled as triangular distributions. The report shows P10/P50/P90 and the probability that first-year net is positive, so a fragile opportunity looks fragile.
- **Reproducible randomness.** Simulations use a seeded mulberry32 PRNG. Each opportunity's seed is the run seed XOR a hash of its id, so results do not change when workflows are added or reordered. Same inputs and seed produce byte-identical reports.
- **Rework is labor.** Hours saved use `minutes x (1 + rework rate)`, because a step redone 12% of the time costs 1.12x its nominal time.
- **Wait time is friction, not cost.** Queue time drives the friction score (it is what people complain about) but not labor savings, because nobody is paid to wait in a queue.
- **Value is net of run cost; build cost is effort.** The value axis uses P50 annual savings after model and maintenance costs; one-time build cost shows up in effort and payback. A payback gate then parks anything whose median payback exceeds the configured horizon, whatever its grid position.
- **LLM output is untrusted input.** The parse providers return a raw object that goes through the same zod schema as hand-written YAML, the prompt embeds the schema generated by `z.toJSONSchema`, and the offline heuristic parser is the default so nothing requires an API key.

## Interview notes parser

`parse` turns free-text notes into a draft workflow. Providers implement one method, `draft(notes) -> { workflow, warnings }`:

- `mock` (default): deterministic heuristics. Reads `Process:`, `Team:`, `Volume:`, and `Loaded cost:` lines and numbered or bulleted steps; extracts durations ("6-12 minutes"), wait times ("sits for a day"), rework ("12% need rework"), handoffs, known systems, data formats, judgment and regulatory cues. Missing values get a conservative default and a warning.
- `anthropic`: Messages API; needs `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`).
- `openai`: Chat Completions in JSON mode; needs `OPENAI_API_KEY` (optional `OPENAI_MODEL`, `OPENAI_BASE_URL`).

Both hosted adapters call the HTTP APIs with `fetch`, so there are no SDK dependencies; tests inject a fake `fetch` and never touch the network. Drafts start with a comment block listing warnings and are meant to be reviewed before scoring.

## Configuration

`config/default.yaml` documents every knob: friction and suitability weights, saturation points, task-type fit, pattern thresholds, automation-fraction ranges, implementation and run-cost bands per pattern, effort penalties, quadrant thresholds, payback horizon, and simulation settings. Pass a partial override with `--config`; anything omitted falls back to the defaults:

```yaml
# stricter.yaml
patterns:
  thresholds: { minSuitability: 60 }
prioritization:
  maxPaybackMonths: 12
```

`--seed` and `--iterations` override the simulation settings for a single run.

## Development

```bash
npm ci
npm run lint          # eslint (typescript-eslint strict, type-checked)
npm run format:check  # prettier
npm run typecheck     # tsc --noEmit
npm test              # vitest
npm run demo          # build + full report on the synthetic examples
```

`make check` runs lint, format check, type check, and tests; `docker build -t workflow-radar . && docker run --rm workflow-radar` runs the demo in a container.

## Data

All bundled data is synthetic and labelled as such in each file (`synthetic: true` plus a header comment):

- `examples/invoice.yaml`, `support-triage.yaml`, `sales-proposal.yaml`, `employee-onboarding.yaml`: invented workflows with plausible but made-up volumes, durations, and costs.
- `examples/notes/invoice-interview.txt`: invented interview notes for the parser.

No external datasets are downloaded or required. The data and code are MIT-licensed.

## Limitations

- **Inputs are estimates from interviews.** The model is only as good as the minutes and volumes people report; the ranges help, but systematic bias (everyone underestimating rework) is not corrected.
- **Inputs are sampled independently.** Real volume and duration often correlate, which would widen the tails. Portfolio totals in the report are sums of per-opportunity medians, not a percentile of the portfolio.
- **Opportunities are per step.** Automating two adjacent steps together usually shares build cost; the model charges each step its own band.
- **Automation fractions and cost bands are defaults, not benchmarks.** They are deliberately round numbers meant to be replaced with an organization's own figures.
- **The task-type classifier is keyword-based.** It explains its matches and can be overridden per step with `taskType`, but it will misread unusual phrasing.
- **Labor savings are not cash savings.** Hours freed only become money if the capacity is redeployed or hiring is avoided; the report labels figures as savings, not budget cuts.

## Roadmap

Product context, success metrics, trade-offs, and the now / next / later roadmap are in [docs/PRODUCT.md](docs/PRODUCT.md).

## License

MIT. See [LICENSE](LICENSE).
