import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkflowFile } from "../src/domain/load.js";

const examplesDir = join(import.meta.dirname, "..", "examples");
const files = readdirSync(examplesDir).filter((f) => f.endsWith(".yaml"));

describe("bundled synthetic examples", () => {
  it("ships at least four example workflows", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)("%s validates and is labeled synthetic", async (file) => {
    const workflow = await loadWorkflowFile(join(examplesDir, file));
    expect(workflow.synthetic).toBe(true);
    expect(workflow.steps.length).toBeGreaterThan(3);
  });
});
