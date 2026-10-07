import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseWorkflow } from "../src/domain/load.js";
import { ValidationError } from "../src/domain/load.js";
import { draftWorkflowFromNotes } from "../src/parse/draft.js";
import {
  HeuristicNotesProvider,
  durationEstimate,
  numberEstimate,
  parseNotesHeuristically,
} from "../src/parse/heuristic.js";
import type { NotesProvider } from "../src/parse/provider.js";

const notes = readFileSync(
  join(import.meta.dirname, "..", "examples", "notes", "invoice-interview.txt"),
  "utf8",
);

describe("number helpers", () => {
  it.each([
    ["about 40 a month", 40],
    ["between 1,500 and 2,200", { low: 1500, likely: 1850, high: 2200 }],
    ["roughly 1,800, between 1,500 and 2,200", { low: 1500, likely: 1800, high: 2200 }],
    ["none given", undefined],
  ])("numberEstimate(%s)", (text, expected) => {
    expect(numberEstimate(text)).toEqual(expected);
  });

  it.each([
    ["takes 6-12 minutes", { low: 6, likely: 9, high: 12 }],
    ["about 2 minutes each", 2],
    ["1.5 hours", 90],
    ["1 to 2 hrs", { low: 60, likely: 90, high: 120 }],
    ["quick", undefined],
  ])("durationEstimate(%s)", (text, expected) => {
    expect(durationEstimate(text)).toEqual(expected);
  });
});

describe("heuristic notes parser", () => {
  const { workflow, warnings } = parseNotesHeuristically(notes);
  const parsed = parseWorkflow(workflow);

  it("produces a schema-valid workflow from the synthetic interview", () => {
    expect(parsed.name).toBe("Invoice processing");
    expect(parsed.team).toBe("Accounts Payable");
    expect(parsed.synthetic).toBe(true);
    expect(parsed.volumePerMonth).toEqual({ low: 1500, likely: 1800, high: 2200 });
    expect(parsed.loadedHourlyCost).toEqual({ low: 48, likely: 55, high: 62 });
    expect(parsed.steps).toHaveLength(6);
    expect(warnings).toEqual(["step 6: no duration found; defaulted to 5 min."]);
  });

  it("extracts per-step fields", () => {
    const [intake, keyIn, , exceptions, approval, payment] = parsed.steps;
    expect(intake).toMatchObject({
      actor: "AP clerk",
      durationMinutes: 2,
      systems: ["Outlook"],
      taskType: "extraction",
    });
    expect(keyIn).toMatchObject({
      durationMinutes: { low: 6, likely: 9, high: 12 },
      errorRate: 0.12,
      systems: ["SAP"],
    });
    expect(exceptions).toMatchObject({
      handoffs: 1,
      waitMinutes: 480,
      durationMinutes: 15,
      judgmentLevel: "medium",
    });
    expect(approval).toMatchObject({
      regulatorySensitivity: "high",
      waitMinutes: 1440,
      taskType: "decision",
    });
    expect(payment?.actorType).toBe("system");
  });

  it("is deterministic", () => {
    expect(parseNotesHeuristically(notes)).toEqual(parseNotesHeuristically(notes));
  });

  it("warns and defaults when fields are missing", () => {
    const sparse = parseNotesHeuristically("- Someone checks the report");
    expect(sparse.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/No "Process:" line/),
        expect.stringMatching(/No volume found/),
        expect.stringMatching(/step 1: no duration found/),
      ]),
    );
    expect(() => parseWorkflow(sparse.workflow)).not.toThrow();
  });
});

describe("draftWorkflowFromNotes", () => {
  it("returns YAML that round-trips through the schema", async () => {
    const result = await draftWorkflowFromNotes(notes, new HeuristicNotesProvider());
    expect(result.yaml).toMatch(/^# Draft generated from interview notes by the "mock" provider/);
    expect(parseWorkflow(parse(result.yaml))).toEqual(result.workflow);
  });

  it("rejects provider output that fails validation", async () => {
    const broken: NotesProvider = {
      name: "broken",
      draft: () => Promise.resolve({ workflow: { id: "Bad Id", steps: [] }, warnings: [] }),
    };
    await expect(draftWorkflowFromNotes("notes", broken)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects empty notes", async () => {
    await expect(draftWorkflowFromNotes("  \n", new HeuristicNotesProvider())).rejects.toThrow(
      /empty/,
    );
  });
});
