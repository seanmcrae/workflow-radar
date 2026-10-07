import { readFile, writeFile } from "node:fs/promises";
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { configSchema, loadConfig, type AuditConfig } from "../config.js";
import { ValidationError, loadWorkflowFile } from "../domain/load.js";
import { assessStep, runAudit } from "../prioritize/audit.js";
import { draftWorkflowFromNotes } from "../parse/draft.js";
import type { FetchFn } from "../parse/http.js";
import { PROVIDER_NAMES, createNotesProvider } from "../parse/registry.js";
import { months, money, num } from "../report/format.js";
import { roadmap, summarize } from "../report/summary.js";
import { toJson, writeReport } from "../report/write.js";
import { workflowFriction } from "../scoring/friction.js";
import { VERSION } from "../version.js";
import { renderScore, textTable } from "./text.js";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Record<string, string | undefined>;
  fetch?: FetchFn;
}

function positiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new InvalidArgumentError("expected a non-negative integer");
  return n;
}

async function resolveRunConfig(opts: {
  config?: string;
  seed?: number;
  iterations?: number;
}): Promise<AuditConfig> {
  const config = await loadConfig(opts.config);
  const simulation = {
    iterations: opts.iterations ?? config.simulation.iterations,
    seed: opts.seed ?? config.simulation.seed,
  };
  const result = configSchema.shape.simulation.safeParse(simulation);
  if (!result.success) {
    throw new ValidationError(
      "command-line options",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return { ...config, simulation: result.data };
}

function buildProgram(io: CliIO): Command {
  const program = new Command()
    .name("workflow-radar")
    .description(
      "Score business workflows for friction and AI suitability, estimate ROI, and build a roadmap.",
    )
    .version(VERSION)
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr });

  const configOption = () =>
    new Option("-c, --config <path>", "scoring config YAML (overrides config/default.yaml)");

  program
    .command("score")
    .description("score one workflow file step by step")
    .argument("<file>", "workflow YAML or JSON")
    .addOption(configOption())
    .option("--explain", "show the factors behind every score")
    .option("--json", "print the assessed steps as JSON")
    .action(async (file: string, opts: { config?: string; explain?: boolean; json?: boolean }) => {
      const config = await resolveRunConfig(opts);
      const workflow = await loadWorkflowFile(file);
      const steps = workflow.steps.map((step, i) => ({
        index: i + 1,
        name: step.name,
        opportunity: step.actorType === "human" ? assessStep(workflow, step, config) : null,
      }));
      if (opts.json === true) {
        const assessed = steps.flatMap((s) => (s.opportunity ? [s.opportunity] : []));
        io.stdout(toJson({ workflow: workflow.id, opportunities: assessed }));
        return;
      }
      io.stdout(
        renderScore(
          workflow,
          steps,
          workflowFriction(workflow, config.friction),
          opts.explain === true,
        ),
      );
    });

  program
    .command("report")
    .description("audit one or more workflows and write markdown, HTML, SVG, and JSON reports")
    .argument("<files...>", "workflow YAML or JSON files")
    .requiredOption("-o, --out <dir>", "output directory")
    .addOption(configOption())
    .option("--seed <n>", "Monte Carlo seed", positiveInt)
    .option("--iterations <n>", "Monte Carlo iterations", positiveInt)
    .option("--title <text>", "report title", "AI Opportunity Audit")
    .action(
      async (
        files: string[],
        opts: { out: string; config?: string; seed?: number; iterations?: number; title: string },
      ) => {
        const config = await resolveRunConfig(opts);
        const workflows = await Promise.all(files.map((f) => loadWorkflowFile(f)));
        const result = runAudit(workflows, config);
        const summary = summarize(result);
        const paths = await writeReport(result, opts.out, {
          title: opts.title,
          generator: `workflow-radar ${VERSION}`,
          sources: files,
        });

        const rows = roadmap(result).flatMap((phase) =>
          phase.opportunities.map((o) => {
            const e = o.economics;
            return [
              phase.title,
              String(o.rank),
              `${o.workflowName}: ${o.stepName}`,
              e ? num(e.simulation.hoursSavedPerMonth.p50) : "-",
              e ? money(e.simulation.firstYearNet.p50, summary.currency) : "-",
              e ? months(e.simulation.paybackMonths.p50) : "-",
            ];
          }),
        );
        io.stdout(
          [
            `Assessed ${summary.stepsAssessed} human steps across ${summary.workflows} workflows` +
              (summary.syntheticWorkflows > 0 ? ` (${summary.syntheticWorkflows} synthetic)` : "") +
              `; ${summary.recommended} recommended, ${summary.notRecommended.length} not recommended.`,
            "",
            textTable(
              ["Phase", "#", "Opportunity", "Hours/mo P50", "1st-yr net P50", "Payback P50"],
              rows,
              [1, 3, 4, 5],
            ),
            "",
            `Wrote ${paths.markdown}, ${paths.html}, ${paths.svg}, ${paths.json}`,
            "",
          ].join("\n"),
        );
      },
    );

  program
    .command("parse")
    .description("draft a workflow YAML from free-text interview notes")
    .argument("<notes>", "text file with interview notes")
    .addOption(
      new Option("-p, --provider <name>", "notes provider").choices(PROVIDER_NAMES).default("mock"),
    )
    .option("-o, --out <file>", "write the YAML here instead of stdout")
    .action(async (notesPath: string, opts: { provider: string; out?: string }) => {
      const provider = createNotesProvider(opts.provider, { env: io.env, fetch: io.fetch });
      const result = await draftWorkflowFromNotes(await readFile(notesPath, "utf8"), provider);
      for (const warning of result.warnings) io.stderr(`warning: ${warning}\n`);
      if (opts.out === undefined) {
        io.stdout(result.yaml);
      } else {
        await writeFile(opts.out, result.yaml);
        io.stdout(
          `Wrote ${opts.out} (${result.workflow.steps.length} steps); review it before scoring.\n`,
        );
      }
    });

  return program;
}

/** Runs the CLI and returns the process exit code instead of exiting, so it is testable. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  try {
    await buildProgram(io).parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    // Validation, provider, and file-system errors are user-facing: print the message, no stack.
    if (error instanceof Error) {
      io.stderr(`error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
