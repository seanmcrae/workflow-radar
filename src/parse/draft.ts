import { Document } from "yaml";
import { parseWorkflow } from "../domain/load.js";
import type { Workflow } from "../domain/schema.js";
import type { NotesProvider } from "./provider.js";

export interface DraftResult {
  provider: string;
  workflow: Workflow;
  yaml: string;
  warnings: string[];
}

/** Runs a provider over interview notes and validates its output against the workflow schema. */
export async function draftWorkflowFromNotes(
  notes: string,
  provider: NotesProvider,
): Promise<DraftResult> {
  if (notes.trim().length === 0) throw new Error("interview notes are empty");
  const draft = await provider.draft(notes);
  const workflow = parseWorkflow(draft.workflow, `${provider.name} draft`);

  const doc = new Document(workflow);
  doc.commentBefore = [
    ` Draft generated from interview notes by the "${provider.name}" provider.`,
    " Review every field (especially durations, volumes, and risk levels) before scoring.",
    ...draft.warnings.map((w) => ` WARNING: ${w}`),
  ].join("\n");
  return {
    provider: provider.name,
    workflow,
    yaml: doc.toString({ lineWidth: 100 }),
    warnings: draft.warnings,
  };
}
