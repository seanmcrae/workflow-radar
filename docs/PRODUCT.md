# workflow-radar: product brief

## Problem

Most companies now have a list of AI ideas longer than their capacity to build them. The list is usually ranked by who asked loudest, which vendor demo landed best, or which task feels most tedious to the person describing it. None of those are measurements. The predictable result is pilots that work in a demo and do not pay back: a summarizer for a step that takes four minutes twice a week, an "agent" pointed at a regulated approval that legally needs a human signature anyway, a copilot for a task whose real cost is the two days it sits in a queue.

The information needed to rank these ideas properly is not exotic. It is how often a step happens, how long it takes, how often it is redone, how many handoffs and how much waiting surround it, what data it consumes, how much judgment it needs, and what a mistake costs. Consultants and transformation teams collect most of this in discovery interviews already. What is missing is a consistent, inspectable way to turn those notes into a ranked, costed roadmap with honest uncertainty, without either a spreadsheet nobody else can audit or a black-box score nobody trusts.

workflow-radar is that step: structured workflow capture, transparent scoring, Monte Carlo ROI, and a prioritized roadmap with a recommended delivery pattern and guardrails for each opportunity.

## Users and jobs to be done

| User                                      | Job to be done                                                                                                      | What they need from the tool                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Transformation / AI program lead          | "Decide which five AI initiatives to fund this half, and defend the choice to finance and risk."                    | A ranked roadmap, P10/P50/P90 economics, payback, and an explanation for every score that survives a skeptical review.                          |
| Operations manager                        | "Show where my team's time actually goes and which parts could be assisted without breaking controls."              | Per-step friction and labor hours, a pattern recommendation that respects judgment and regulatory limits, and guardrails to take to compliance. |
| Consultant running a discovery engagement | "Turn a week of interviews into a client-ready opportunity assessment quickly and consistently across engagements." | Notes-to-YAML drafting, a repeatable scoring model, a configurable cost model, and a self-contained HTML report to hand over.                   |

Secondary: finance partners reviewing a business case (they read the ROI tables and tornado charts) and risk or compliance reviewers (they read the guardrail notes and pattern rationale).

## Scope

**In scope (v0.1, this repository)**

- Workflow and step model with three-point estimates for every uncertain input, validated by zod, in YAML or JSON.
- Friction score (hands-on time, rework, handoffs, wait) and AI-suitability score (task-type fit, data readiness, judgment, regulatory risk), both with per-factor explanations.
- Task-type classification (extraction, classification, summarization, generation, decision, other), declared or inferred from the step's wording.
- Pattern recommendation (copilot, automation with review, agent, not recommended) using ordered hard rules, plus guardrail notes for risky steps.
- ROI model with rework-adjusted labor hours, run cost, implementation cost bands, payback; seeded Monte Carlo P10/P50/P90; one-at-a-time tornado sensitivity.
- Value-versus-effort quadrant, payback gate, ranked Now / Next / Later / Park roadmap.
- Interview-notes parser with a deterministic offline default and Anthropic / OpenAI adapters.
- CLI (`score`, `report`, `parse`) and Markdown, HTML, SVG, JSON outputs.

**Out of scope (deliberately)**

- Process mining from event logs (Celonis-style discovery). The tool assumes a human has already described the workflow; event-log import is a roadmap item, not the core.
- Building or hosting the AI solutions themselves.
- A web UI or multi-user collaboration. The CLI and static reports keep the first version reviewable in Git.
- Vendor or model selection. Pattern recommendations are about delivery shape and controls, not which model to buy.
- Claims about real organizations. All bundled data is synthetic.

## Requirements

**Functional**

1. A workflow file with a typo, out-of-range value, unordered range, or duplicate step id is rejected with a field-qualified error; nothing is silently defaulted except documented optional fields.
2. Every score in every output can be decomposed into named factors, their weights, their points, and a one-line reason.
3. Any weight, threshold, cost band, or automation fraction can be changed in a config file without code changes; partial overrides inherit the defaults.
4. A step that is high-regulation, high-judgment, or a decision task is never recommended for unattended automation, whatever its score.
5. ROI is reported as a distribution (P10/P50/P90 and probability of positive first-year net), not a single number, alongside the likely-input point estimate.
6. Given the same inputs, config, and seed, the report is byte-identical. Adding or reordering workflows does not change any existing opportunity's simulation.
7. The parse command works with no API keys and never sends data anywhere unless a hosted provider is explicitly selected.
8. The HTML report opens offline: no scripts, no CDN, no external fonts or images.

**Non-functional**

- Full audit of the four bundled workflows (23 human steps, 5,000 iterations each) runs in well under a second of simulation time on a laptop; the CLI integration tests run it end to end.
- No network access in tests; no secrets required in CI.

## Success metrics and evals

The tool should be judged by whether it changes decisions and whether its estimates hold up, not by how many reports it produces.

| Metric                | Definition                                                                         | Target                                                                 | How it is measured                                                                       |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Audit cycle time      | Hours from last discovery interview to a reviewed roadmap                          | Under 1 working day for up to 10 workflows                             | Time between `parse` draft creation and final `report` commit in an engagement repo      |
| Draft acceptance rate | Share of fields in a `parse` draft that survive human review unchanged             | Above 70% for the heuristic parser, above 85% for hosted providers     | Field-level diff between draft YAML and reviewed YAML                                    |
| Estimate accuracy     | Error of P50 hours saved versus realized hours saved 90 days after launch          | Median absolute error under 30%                                        | Realized savings logged per opportunity; compared to `audit.json`                        |
| Interval calibration  | Share of launched opportunities whose realized value falls between P10 and P90     | 70-90% (an 80% interval should contain about 80%)                      | Same data; persistently below 70% means ranges are too narrow and defaults need widening |
| Ranking quality       | Share of "Now" opportunities that reach payback within the stated horizon          | Above 75%                                                              | Payback tracking for funded items                                                        |
| Adoption              | Share of funded AI initiatives in an organization that went through an audit first | Above 80% after two planning cycles                                    | Program portfolio review                                                                 |
| Override rate         | Share of pattern recommendations changed by reviewers, and why                     | Tracked, not targeted; a high rate on one rule means the rule is wrong | Review notes                                                                             |

**Evals that exist in the repository today**

- Scoring math is pinned by unit tests with hand-computed expected values (friction, suitability, effort, quadrant edges, value cap).
- ROI equations and Monte Carlo behavior are tested for determinism per seed, seed sensitivity within statistical tolerance, percentile ordering, degenerate (fixed-input) ranges collapsing to the point estimate, and triangular sampling mean.
- The heuristic parser is evaluated field by field against a synthetic interview (`examples/notes/invoice-interview.txt`) and must produce a schema-valid workflow with the expected durations, rework rate, wait times, handoffs, systems, sensitivity, and system-step detection.
- Hosted adapters are tested against recorded-shape responses with an injected `fetch`, including HTTP errors and malformed content.
- CLI integration tests run `score`, `report`, and `parse` in-process, including byte-identical reports for a fixed seed.

**Evals still missing** (see roadmap): a labelled corpus of 20-30 synthetic interview notes for parser precision/recall per field, and a `calibrate` command that ingests realized outcomes and reports the accuracy and calibration metrics above.

## Trade-offs and alternatives considered

- **Transparent weighted model vs. a learned model.** A model trained on past AI projects could in principle rank better, but there is no trustworthy labelled dataset, and an audit that cannot explain itself does not survive a finance or risk review. Chosen: weighted sums with every weight in config and every contribution in the report. Cost: the defaults encode judgment, so they must be visible and easy to change, which they are.
- **Additive suitability vs. multiplicative gating.** An additive score lets strong data readiness compensate for a task that is not AI-shaped at all (ordering a laptop scored 69). Rather than make the score opaque, the pattern rules gate explicitly: no AI-shaped task means not recommended, and regulation or judgment caps the pattern at copilot. Scores stay explainable; the gates are named in the rationale.
- **Triangular distributions vs. PERT or lognormal.** Interviewees give "usually 8 minutes, between 6 and 12", which maps directly to a triangle. PERT would weight the mode more heavily and lognormal would need parameters nobody can state. Triangular is the honest translation of what people actually say; it slightly overweights the tails, which errs toward caution.
- **Independent sampling vs. correlated inputs.** Correlating volume with duration (busy months, rushed work) would be more realistic but requires correlation estimates nobody has. Independence is documented as a limitation, and portfolio totals are labelled as sums of medians rather than presented as a portfolio percentile.
- **Per-step opportunities vs. per-workflow.** Steps are the unit at which AI patterns actually differ (extraction vs. approval in the same workflow). The cost is that adjacent steps automated together share build cost the model does not credit; this is on the roadmap as opportunity bundling.
- **Payback gate vs. pure quadrant.** A two-axis grid alone placed steps with 30+ month payback in "Fill-ins". The gate parks anything whose median payback exceeds a configurable horizon (18 months by default), and the chart draws those as hollow markers so the override is visible rather than hidden.
- **Raw `fetch` vs. vendor SDKs for LLM adapters.** Two small HTTP calls do not justify two SDK dependency trees, and `fetch` injection makes the adapters fully testable offline.
- **CLI and static files vs. a web app.** Audits are reviewed artifacts. YAML in Git plus a self-contained HTML report gives diffable inputs and outputs and works inside client environments where installing a service is not an option.

## Risks

| Risk                                                                                           | Impact                                                         | Mitigation                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Garbage in: interview estimates are biased (rework and wait time are routinely underestimated) | Confident-looking but wrong rankings                           | Three-point ranges everywhere; tornado chart shows which input moves the answer, so the team knows which number to go measure; calibration metric catches systematic bias over time |
| False precision: P50 figures read as commitments                                               | Business cases built on medians, then missed                   | Report leads with ranges and probability of positive return; synthetic banner on demo data; docs state labor savings are not budget cuts                                            |
| Defaults treated as benchmarks                                                                 | Every client gets the same automation fractions and cost bands | Defaults are round numbers, documented as placeholders, and overridable per run; report prints the config used                                                                      |
| Pattern rules too permissive for a regulated client                                            | An "agent" recommendation in a context that cannot support one | Hard rules ordered before thresholds; guardrail notes on every medium/high-risk step; rules are a short, reviewable function                                                        |
| LLM parser invents numbers                                                                     | Fabricated durations enter the model                           | Prompt forbids invention and requires warnings; output validated by the same schema; drafts are labelled for review; offline heuristic is the default                               |
| Sensitive interview content sent to a hosted model                                             | Data-handling breach                                           | Hosted providers are opt-in per command and require an explicit key; the default path never leaves the machine                                                                      |
| Optimizing for hours instead of outcomes                                                       | Automating steps that should be eliminated                     | Report surfaces wait time and handoffs as friction even when they produce no labor savings; process redesign is called out as a separate lever in the roadmap                       |

## Roadmap

**Now (next 4-6 weeks)**

- `calibrate` command: ingest realized savings per opportunity id and report P50 error and P10-P90 coverage against the original `audit.json`.
- Labelled synthetic notes corpus (20-30 interviews across functions) and a parser eval reporting per-field precision and recall for each provider.
- Opportunity bundling: let adjacent steps in a workflow share one implementation-cost draw and report the combined case.
- `validate` command and a published JSON Schema for editor autocompletion of workflow files.

**Next (one quarter)**

- Correlated sampling for workflow-level inputs (one volume draw shared by all steps in a workflow per iteration) so portfolio percentiles become real percentiles.
- Portfolio view: capacity-constrained selection of opportunities under a build budget, with marginal value per dollar.
- Spreadsheet import/export for teams that capture discovery data in Excel or Google Sheets.
- Organization profiles: saved config overlays for automation fractions and cost bands, versioned alongside audits.

**Later**

- Event-log import (CSV of case id, activity, timestamp) to derive volumes, durations, and wait times instead of estimating them.
- Post-launch monitoring hooks that record realized hours per opportunity and feed calibration automatically.
- A lightweight review UI over the same YAML and JSON artifacts for non-technical stakeholders.
