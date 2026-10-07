import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { run, type CliIO } from "../src/cli/program.js";
import { parseWorkflow } from "../src/domain/load.js";
import type { FetchFn } from "../src/parse/http.js";
import { makeWorkflow } from "./helpers.js";

const root = join(import.meta.dirname, "..");
const example = (name: string) => join(root, "examples", name);

interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

async function cli(args: string[], extra: Partial<CliIO> = {}): Promise<Captured> {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    env: {},
    ...extra,
  });
  return { code, stdout, stderr };
}

const tmp = () => mkdtempSync(join(tmpdir(), "workflow-radar-"));

describe("audit score", () => {
  it("prints a step table for a bundled example", async () => {
    const { code, stdout } = await cli(["score", example("invoice.yaml")]);
    expect(code).toBe(0);
    expect(stdout).toContain("Invoice processing (Accounts Payable) [synthetic data]");
    expect(stdout).toMatch(/Key invoice header and line items into the ERP\s+extraction/);
    expect(stdout).toContain("system step (skipped)");
  });

  it("explains factor contributions with --explain", async () => {
    const { stdout } = await cli(["score", example("invoice.yaml"), "--explain"]);
    expect(stdout).toContain("12% of runs need rework (saturates at 25%)");
    expect(stdout).toContain("guardrail:");
  });

  it("emits JSON with --json", async () => {
    const { stdout } = await cli(["score", example("support-triage.yaml"), "--json"]);
    const json = JSON.parse(stdout) as { workflow: string; opportunities: unknown[] };
    expect(json.workflow).toBe("support-triage");
    expect(json.opportunities).toHaveLength(6);
  });

  it("applies a config override", async () => {
    const dir = tmp();
    const config = join(dir, "strict.yaml");
    writeFileSync(config, "patterns:\n  thresholds:\n    minSuitability: 99\n");
    const { stdout } = await cli(["score", example("invoice.yaml"), "--config", config]);
    expect(stdout).not.toContain("Automation with review");
    expect(stdout).toContain("Not recommended");
  });

  it("reports schema errors with field paths and exit code 1", async () => {
    const dir = tmp();
    const file = join(dir, "bad.yaml");
    writeFileSync(
      file,
      "id: bad\nname: Bad\nteam: Ops\nvolumePerMonth: -5\nloadedHourlyCost: 50\nsteps: []\n",
    );
    const { code, stderr } = await cli(["score", file]);
    expect(code).toBe(1);
    expect(stderr).toContain("volumePerMonth:");
    expect(stderr).toContain("steps: a workflow needs at least one step");
  });

  it("fails cleanly on missing files and unsupported extensions", async () => {
    expect((await cli(["score", "missing.yaml"])).stderr).toMatch(/ENOENT/);
    expect((await cli(["score", "notes.txt"])).stderr).toMatch(/unsupported file extension/);
  });
});

describe("audit report", () => {
  it("writes markdown, HTML, SVG, and JSON and prints the roadmap", async () => {
    const out = join(tmp(), "report");
    const files = ["invoice.yaml", "support-triage.yaml"].map(example);
    const { code, stdout } = await cli(["report", ...files, "--out", out, "--iterations", "500"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Assessed 11 human steps across 2 workflows \(2 synthetic\)/);
    expect(stdout).toMatch(/^Now\s+1\s+/m);
    for (const name of ["report.md", "report.html", "quadrant.svg", "audit.json"]) {
      expect(existsSync(join(out, name))).toBe(true);
    }
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain(
      "Monte Carlo: 500 iterations, seed 42",
    );
  });

  it("is reproducible for a fixed seed and changes with the seed", async () => {
    const files = [example("invoice.yaml")];
    const render = async (seed: string) => {
      const out = tmp();
      await cli(["report", ...files, "--out", out, "--seed", seed, "--iterations", "300"]);
      return readFileSync(join(out, "audit.json"), "utf8");
    };
    const first = await render("7");
    expect(await render("7")).toBe(first);
    expect(await render("8")).not.toBe(first);
  });

  it("validates numeric options", async () => {
    const { code, stderr } = await cli([
      "report",
      example("invoice.yaml"),
      "--out",
      tmp(),
      "--iterations",
      "10",
    ]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/iterations/);
    const bad = await cli(["report", example("invoice.yaml"), "--out", tmp(), "--seed", "-1"]);
    expect(bad.code).not.toBe(0);
  });

  it("requires --out", async () => {
    const { code, stderr } = await cli(["report", example("invoice.yaml")]);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/--out/);
  });
});

describe("audit parse", () => {
  const notes = example("notes/invoice-interview.txt");

  it("drafts schema-valid YAML with the default mock provider", async () => {
    const { code, stdout, stderr } = await cli(["parse", notes]);
    expect(code).toBe(0);
    expect(stderr).toContain("warning: step 6: no duration found");
    expect(parseWorkflow(parse(stdout)).steps).toHaveLength(6);
  });

  it("writes to --out and the draft can be scored", async () => {
    const out = join(tmp(), "draft.yaml");
    expect((await cli(["parse", notes, "--out", out])).stdout).toMatch(
      /Wrote .*draft\.yaml \(6 steps\)/,
    );
    const scored = await cli(["score", out]);
    expect(scored.code).toBe(0);
    expect(scored.stdout).toContain("Invoice processing");
  });

  it("uses a hosted provider when its key is set", async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ workflow: makeWorkflow() }) } }],
          }),
        ),
      )) as unknown as FetchFn;
    const { code, stdout } = await cli(["parse", notes, "--provider", "openai"], {
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: fakeFetch,
    });
    expect(code).toBe(0);
    expect(stdout).toContain('by the "openai" provider');
  });

  it("explains a missing API key and rejects unknown providers", async () => {
    const missing = await cli(["parse", notes, "--provider", "anthropic"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("ANTHROPIC_API_KEY is not set");
    const unknown = await cli(["parse", notes, "--provider", "llama"]);
    expect(unknown.code).not.toBe(0);
    expect(unknown.stderr).toMatch(/Allowed choices are mock, anthropic, openai/);
  });
});

describe("general", () => {
  it("prints the version", async () => {
    const { stdout } = await cli(["--version"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
