import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditResult } from "../prioritize/audit.js";
import { renderHtml } from "./html.js";
import { renderMarkdown, type ReportMeta } from "./markdown.js";
import { quadrantSvg } from "./svg.js";

export interface WrittenReport {
  markdown: string;
  html: string;
  svg: string;
  json: string;
}

/** JSON cannot represent Infinity, so "never pays back" is serialized as null. */
export function toJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, value: unknown) => (typeof value === "number" && !Number.isFinite(value) ? null : value), 2)}\n`;
}

export async function writeReport(
  result: AuditResult,
  outDir: string,
  meta: Omit<ReportMeta, "quadrantImage">,
): Promise<WrittenReport> {
  await mkdir(outDir, { recursive: true });
  const fullMeta: ReportMeta = { ...meta, quadrantImage: "quadrant.svg" };
  const paths: WrittenReport = {
    markdown: join(outDir, "report.md"),
    html: join(outDir, "report.html"),
    svg: join(outDir, "quadrant.svg"),
    json: join(outDir, "audit.json"),
  };
  await Promise.all([
    writeFile(paths.markdown, renderMarkdown(result, fullMeta)),
    writeFile(paths.html, renderHtml(result, fullMeta)),
    writeFile(paths.svg, quadrantSvg(result)),
    writeFile(paths.json, toJson(result)),
  ]);
  return paths;
}
