import { z } from "zod";
import { workflowSchema } from "../domain/schema.js";

const workflowJsonSchema = JSON.stringify(z.toJSONSchema(workflowSchema, { io: "input" }));

export const NOTES_SYSTEM_PROMPT = `You convert process-discovery interview notes into a structured workflow for an AI-opportunity audit.

Return ONLY a JSON object of the form {"workflow": <Workflow>, "warnings": [<string>, ...]}.
- <Workflow> must conform to this JSON Schema: ${workflowJsonSchema}
- Use three-point ranges {"low","likely","high"} when the notes give a range; otherwise a single number.
- durationMinutes is hands-on time per run; queue or approval delays go in waitMinutes.
- volumeShare is the fraction of runs that reach the step (e.g. only exceptions).
- Mark automated steps with actorType "system".
- Never invent numbers. When a value is missing, choose a conservative placeholder and add a warning naming the step and field.
- Set "synthetic" to true only if the notes say they are synthetic.`;

/** Model output envelope; the workflow itself is validated separately by the workflow schema. */
export const draftEnvelopeSchema = z.object({
  workflow: z.unknown(),
  warnings: z.array(z.string()).default([]),
});

/** Extracts the first JSON object from model text, tolerating code fences and leading prose. */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("model response did not contain a JSON object");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`model response was not valid JSON: ${reason}`, { cause: error });
  }
}
