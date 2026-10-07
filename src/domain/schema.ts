import { z } from "zod";

export const TASK_TYPES = [
  "extraction",
  "classification",
  "summarization",
  "generation",
  "decision",
  "other",
] as const;
export const LEVELS = ["low", "medium", "high"] as const;
export const SENSITIVITY_LEVELS = ["none", "low", "medium", "high"] as const;
export const DATA_FORMATS = ["structured", "semi_structured", "unstructured"] as const;
export const ACTOR_TYPES = ["human", "system"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type Level = (typeof LEVELS)[number];
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];
export type DataFormat = (typeof DATA_FORMATS)[number];

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "must be lowercase letters, digits, and hyphens");

function estimateSchema(max = Number.POSITIVE_INFINITY) {
  const bounded = z.number().min(0).max(max);
  return z.union([
    bounded,
    z
      .object({ low: bounded, likely: bounded, high: bounded })
      .strict()
      .refine((r) => r.low <= r.likely && r.likely <= r.high, {
        message: "range must satisfy low <= likely <= high",
      }),
  ]);
}

const positiveEstimate = estimateSchema().refine(
  (e) => (typeof e === "number" ? e : e.likely) > 0,
  { message: "must be greater than zero" },
);

export const dataInputSchema = z
  .object({
    name: z.string().min(1),
    format: z.enum(DATA_FORMATS),
  })
  .strict();

export const stepSchema = z
  .object({
    id: slug,
    name: z.string().min(1),
    description: z.string().optional(),
    actor: z.string().min(1),
    actorType: z.enum(ACTOR_TYPES).default("human"),
    /** Fraction of workflow runs that reach this step (e.g. only exceptions). */
    volumeShare: estimateSchema(1).default(1),
    durationMinutes: positiveEstimate,
    /** Queue or idle time before the step completes; drives friction, not labor cost. */
    waitMinutes: estimateSchema().default(0),
    /** Fraction of runs that must be redone or corrected. */
    errorRate: estimateSchema(1).default(0),
    handoffs: z.number().int().min(0).default(0),
    dataInputs: z.array(dataInputSchema).default([]),
    systems: z.array(z.string().min(1)).default([]),
    /** Optional override; inferred from the step name and description when omitted. */
    taskType: z.enum(TASK_TYPES).optional(),
    judgmentLevel: z.enum(LEVELS),
    regulatorySensitivity: z.enum(SENSITIVITY_LEVELS).default("none"),
    dataReadiness: z.enum(LEVELS),
  })
  .strict();

export const workflowSchema = z
  .object({
    id: slug,
    name: z.string().min(1),
    team: z.string().min(1),
    description: z.string().optional(),
    /** Marks bundled or generated example data so reports can label it. */
    synthetic: z.boolean().default(false),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "must be an ISO 4217 code such as USD")
      .default("USD"),
    volumePerMonth: positiveEstimate,
    loadedHourlyCost: positiveEstimate,
    steps: z.array(stepSchema).min(1, "a workflow needs at least one step"),
  })
  .strict()
  .superRefine((workflow, ctx) => {
    const seen = new Set<string>();
    workflow.steps.forEach((step, index) => {
      if (seen.has(step.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "id"],
          message: `duplicate step id "${step.id}"`,
        });
      }
      seen.add(step.id);
    });
  });

export type DataInput = z.infer<typeof dataInputSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowInput = z.input<typeof workflowSchema>;
