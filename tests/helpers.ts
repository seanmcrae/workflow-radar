import { parseWorkflow } from "../src/domain/load.js";
import type { Step, Workflow } from "../src/domain/schema.js";

type RawStep = Record<string, unknown>;
interface RawWorkflow extends Record<string, unknown> {
  steps: RawStep[];
}

export function makeWorkflow(overrides: Record<string, unknown> = {}): RawWorkflow {
  return {
    id: "test-workflow",
    name: "Test workflow",
    team: "Ops",
    volumePerMonth: 1000,
    loadedHourlyCost: 60,
    steps: [
      {
        id: "enter-data",
        name: "Enter form data into ERP",
        actor: "Clerk",
        durationMinutes: 6,
        judgmentLevel: "low",
        dataReadiness: "high",
      },
    ],
    ...overrides,
  };
}

export function makeStep(overrides: Record<string, unknown> = {}): Step {
  const raw = makeWorkflow();
  raw.steps = [{ ...raw.steps[0], ...overrides }];
  const step = parseWorkflow(raw).steps[0];
  if (!step) throw new Error("unreachable");
  return step;
}

export function workflowWith(overrides: Record<string, unknown> = {}): Workflow {
  return parseWorkflow(makeWorkflow(overrides));
}
