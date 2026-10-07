import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ValidationError, formatIssues } from "./domain/load.js";

const weight = z.number().min(0);
const unit = z.number().min(0).max(1);
const range = z
  .object({ low: z.number().min(0), likely: z.number().min(0), high: z.number().min(0) })
  .strict()
  .refine((r) => r.low <= r.likely && r.likely <= r.high, {
    message: "range must satisfy low <= likely <= high",
  });
const fractionRange = range.refine((r) => r.high <= 1, { message: "fractions must be <= 1" });

function perPattern<T extends z.ZodType>(schema: T) {
  return z.object({ copilot: schema, automation_with_review: schema, agent: schema }).strict();
}

function weights<S extends Record<string, typeof weight>>(shape: S) {
  return z
    .object(shape)
    .strict()
    .refine((w) => Object.values(w as Record<string, number>).some((v) => v > 0), {
      message: "at least one weight must be positive",
    });
}

export const configSchema = z
  .object({
    friction: z
      .object({
        weights: weights({ time: weight, rework: weight, handoffs: weight, wait: weight }),
        /** Raw value at which each factor counts as maximal friction (normalized to 1). */
        saturation: z
          .object({
            durationMinutes: z.number().positive(),
            errorRate: z.number().positive().max(1),
            handoffs: z.number().positive(),
            waitMinutes: z.number().positive(),
          })
          .strict(),
      })
      .strict(),
    suitability: z
      .object({
        weights: weights({
          taskType: weight,
          dataReadiness: weight,
          judgment: weight,
          risk: weight,
        }),
        taskTypeFit: z
          .object({
            extraction: unit,
            classification: unit,
            summarization: unit,
            generation: unit,
            decision: unit,
            other: unit,
          })
          .strict(),
        dataReadiness: z.object({ low: unit, medium: unit, high: unit }).strict(),
        /** Higher means more automatable, so high judgment maps to a low value. */
        judgment: z.object({ low: unit, medium: unit, high: unit }).strict(),
        /** Higher means safer to automate, so high sensitivity maps to a low value. */
        risk: z.object({ none: unit, low: unit, medium: unit, high: unit }).strict(),
      })
      .strict(),
    patterns: z
      .object({
        thresholds: z
          .object({
            minSuitability: z.number().min(0).max(100),
            automationSuitability: z.number().min(0).max(100),
            agentSuitability: z.number().min(0).max(100),
            agentMinSystems: z.number().int().min(1),
            agentMinHandoffs: z.number().int().min(0),
          })
          .strict(),
        automationFraction: perPattern(fractionRange),
        implementationCost: perPattern(range),
        monthlyRunCost: perPattern(range),
      })
      .strict(),
    effort: z
      .object({
        base: perPattern(z.number().min(0).max(100)),
        dataReadinessPenalty: z.object({ low: weight, medium: weight, high: weight }).strict(),
        regulatoryPenalty: z
          .object({ none: weight, low: weight, medium: weight, high: weight })
          .strict(),
        perExtraSystemPenalty: weight,
      })
      .strict(),
    prioritization: z
      .object({
        /** Annual net savings (after run cost) that maps to a value score of 100. */
        valueCapAnnual: z.number().positive(),
        valueThreshold: z.number().min(0).max(100),
        effortThreshold: z.number().min(0).max(100),
        /** Opportunities whose P50 payback exceeds this are parked regardless of quadrant. */
        maxPaybackMonths: z.number().positive(),
      })
      .strict(),
    simulation: z
      .object({
        iterations: z.number().int().min(100).max(1_000_000),
        seed: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type AuditConfig = z.infer<typeof configSchema>;
export type FrictionConfig = AuditConfig["friction"];
export type SuitabilityConfig = AuditConfig["suitability"];

/** Mirrors config/default.yaml; a test keeps the two in sync. */
export const DEFAULT_CONFIG: AuditConfig = {
  friction: {
    weights: { time: 0.35, rework: 0.25, handoffs: 0.2, wait: 0.2 },
    saturation: { durationMinutes: 60, errorRate: 0.25, handoffs: 4, waitMinutes: 1440 },
  },
  suitability: {
    weights: { taskType: 0.35, dataReadiness: 0.25, judgment: 0.2, risk: 0.2 },
    taskTypeFit: {
      extraction: 0.9,
      classification: 0.85,
      summarization: 0.85,
      generation: 0.7,
      decision: 0.3,
      other: 0.1,
    },
    dataReadiness: { low: 0.2, medium: 0.6, high: 1 },
    judgment: { low: 1, medium: 0.6, high: 0.2 },
    risk: { none: 1, low: 0.85, medium: 0.5, high: 0.15 },
  },
  patterns: {
    thresholds: {
      minSuitability: 45,
      automationSuitability: 65,
      agentSuitability: 80,
      agentMinSystems: 2,
      agentMinHandoffs: 1,
    },
    automationFraction: {
      copilot: { low: 0.2, likely: 0.35, high: 0.5 },
      automation_with_review: { low: 0.45, likely: 0.6, high: 0.75 },
      agent: { low: 0.55, likely: 0.7, high: 0.85 },
    },
    implementationCost: {
      copilot: { low: 5000, likely: 12000, high: 25000 },
      automation_with_review: { low: 15000, likely: 35000, high: 70000 },
      agent: { low: 40000, likely: 90000, high: 180000 },
    },
    monthlyRunCost: {
      copilot: { low: 100, likely: 250, high: 500 },
      automation_with_review: { low: 300, likely: 800, high: 1500 },
      agent: { low: 800, likely: 2000, high: 4000 },
    },
  },
  effort: {
    base: { copilot: 20, automation_with_review: 40, agent: 65 },
    dataReadinessPenalty: { low: 20, medium: 5, high: 0 },
    regulatoryPenalty: { none: 0, low: 0, medium: 6, high: 12 },
    perExtraSystemPenalty: 4,
  },
  prioritization: {
    valueCapAnnual: 150000,
    valueThreshold: 50,
    effortThreshold: 50,
    maxPaybackMonths: 18,
  },
  simulation: {
    iterations: 5000,
    seed: 42,
  },
};

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively overlays `override` onto `base`; arrays and scalars replace wholesale. */
export function deepMerge(base: PlainObject, override: PlainObject): PlainObject {
  const merged: PlainObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] =
      isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return merged;
}

/** Validates a partial override layered on the defaults. */
export function resolveConfig(override: unknown = {}, source = "config"): AuditConfig {
  if (override !== null && override !== undefined && !isPlainObject(override)) {
    throw new ValidationError(source, ["(root): config must be a mapping"]);
  }
  const merged = deepMerge(DEFAULT_CONFIG, override ?? {});
  const result = configSchema.safeParse(merged);
  if (!result.success) throw new ValidationError(source, formatIssues(result.error));
  return result.data;
}

export async function loadConfig(path?: string): Promise<AuditConfig> {
  if (path === undefined) return DEFAULT_CONFIG;
  const text = await readFile(path, "utf8");
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ValidationError(path, [`could not parse YAML: ${reason}`]);
  }
  return resolveConfig(raw, path);
}
