import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ZodError } from "zod";
import { workflowSchema, type Workflow } from "./schema.js";

export class ValidationError extends Error {
  constructor(
    readonly source: string,
    readonly issues: string[],
  ) {
    super(`${source} is invalid:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ValidationError";
  }
}

export function formatIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

export function parseWorkflow(raw: unknown, source = "<input>"): Workflow {
  const result = workflowSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(source, formatIssues(result.error));
  }
  return result.data;
}

export type InputFormat = "yaml" | "json";

export function formatFromPath(path: string): InputFormat {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  throw new ValidationError(path, [
    `unsupported file extension "${ext}" (use .yaml, .yml, or .json)`,
  ]);
}

export function parseWorkflowText(text: string, format: InputFormat, source = "<input>"): Workflow {
  let raw: unknown;
  try {
    raw = format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ValidationError(source, [`could not parse ${format.toUpperCase()}: ${reason}`]);
  }
  return parseWorkflow(raw, source);
}

export async function loadWorkflowFile(path: string): Promise<Workflow> {
  const format = formatFromPath(path);
  const text = await readFile(path, "utf8");
  return parseWorkflowText(text, format, path);
}
