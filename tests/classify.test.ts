import { describe, expect, it } from "vitest";
import { classifyStep, inferTaskType } from "../src/scoring/classify.js";
import { makeStep } from "./helpers.js";

describe("inferTaskType", () => {
  it.each([
    ["Key invoice header into the ERP", "extraction"],
    ["Read new ticket and tag product area", "classification"],
    ["Summarize discovery call notes", "summarization"],
    ["Draft first response to the customer", "generation"],
    ["Approve invoices above threshold", "decision"],
    ["Order laptop and ship equipment", "other"],
  ])("%s -> %s", (text, expected) => {
    expect(inferTaskType(text).taskType).toBe(expected);
  });

  it("matches inflected forms on word boundaries", () => {
    expect(inferTaskType("Tickets are routed by hand").matched).toEqual(["route"]);
    expect(inferTaskType("Monkey business").taskType).toBe("other");
  });

  it("prefers decision on ties so ambiguous steps score conservatively", () => {
    expect(inferTaskType("Draft and approve the memo").taskType).toBe("decision");
  });

  it("picks the type with the most cue hits", () => {
    expect(inferTaskType("Categorize, tag, and route requests; draft notes").taskType).toBe(
      "classification",
    );
  });
});

describe("classifyStep", () => {
  it("honors a declared task type", () => {
    const result = classifyStep(makeStep({ name: "Approve things", taskType: "extraction" }));
    expect(result).toEqual({ taskType: "extraction", source: "declared", matched: [] });
  });

  it("uses the description as well as the name", () => {
    const result = classifyStep(
      makeStep({ name: "Resolve exceptions", description: "Decide whether to hold" }),
    );
    expect(result.taskType).toBe("decision");
    expect(result.source).toBe("inferred");
  });
});
