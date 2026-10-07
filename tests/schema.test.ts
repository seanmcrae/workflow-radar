import { describe, expect, it } from "vitest";
import { ValidationError, parseWorkflow, parseWorkflowText } from "../src/domain/load.js";
import { makeWorkflow } from "./helpers.js";

function issuesOf(raw: unknown): string[] {
  try {
    parseWorkflow(raw, "test.yaml");
  } catch (error) {
    if (error instanceof ValidationError) return error.issues;
    throw error;
  }
  throw new Error("expected validation to fail");
}

describe("workflow schema", () => {
  it("applies defaults for optional step fields", () => {
    const workflow = parseWorkflow(makeWorkflow());
    const step = workflow.steps[0];
    expect(step?.actorType).toBe("human");
    expect(step?.volumeShare).toBe(1);
    expect(step?.errorRate).toBe(0);
    expect(step?.regulatorySensitivity).toBe("none");
    expect(workflow.currency).toBe("USD");
    expect(workflow.synthetic).toBe(false);
  });

  it("accepts three-point ranges", () => {
    const workflow = parseWorkflow(
      makeWorkflow({ volumePerMonth: { low: 100, likely: 150, high: 300 } }),
    );
    expect(workflow.volumePerMonth).toEqual({ low: 100, likely: 150, high: 300 });
  });

  it("rejects ranges that are out of order", () => {
    const issues = issuesOf(makeWorkflow({ volumePerMonth: { low: 300, likely: 150, high: 100 } }));
    expect(issues).toContain("volumePerMonth: range must satisfy low <= likely <= high");
  });

  it("reports the path of invalid step fields", () => {
    const raw = makeWorkflow();
    raw.steps[0] = { ...raw.steps[0], errorRate: 1.5, judgmentLevel: "extreme" };
    const issues = issuesOf(raw);
    expect(issues.some((i) => i.startsWith("steps.0.errorRate"))).toBe(true);
    expect(issues.some((i) => i.startsWith("steps.0.judgmentLevel"))).toBe(true);
  });

  it("rejects unknown keys so typos surface", () => {
    const raw = { ...makeWorkflow(), volumePerMnth: 10 };
    expect(issuesOf(raw).join("\n")).toMatch(/volumePerMnth/);
  });

  it("rejects duplicate step ids", () => {
    const raw = makeWorkflow();
    raw.steps.push({ ...raw.steps[0] });
    expect(issuesOf(raw)).toContain('steps.1.id: duplicate step id "enter-data"');
  });

  it("rejects zero durations and empty step lists", () => {
    const zero = makeWorkflow();
    zero.steps[0] = { ...zero.steps[0], durationMinutes: 0 };
    expect(issuesOf(zero)).toContain("steps.0.durationMinutes: must be greater than zero");
    expect(issuesOf({ ...makeWorkflow(), steps: [] })).toContain(
      "steps: a workflow needs at least one step",
    );
  });

  it("wraps YAML syntax errors in a ValidationError", () => {
    expect(() => parseWorkflowText("id: [unclosed", "yaml", "bad.yaml")).toThrow(ValidationError);
  });

  it("parses JSON input", () => {
    const workflow = parseWorkflowText(JSON.stringify(makeWorkflow()), "json");
    expect(workflow.id).toBe("test-workflow");
  });
});
