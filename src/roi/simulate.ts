import { evaluateRoi, mapInputs, type RoiInputs, type RoiOutcome } from "./model.js";
import { mulberry32, percentile, sampleTriangular } from "./random.js";

export interface Percentiles {
  p10: number;
  p50: number;
  p90: number;
}

export type SimulationSummary = Record<keyof RoiOutcome, Percentiles> & {
  iterations: number;
  seed: number;
  /** Share of iterations where first-year net value is positive. */
  probabilityPositiveFirstYear: number;
};

export interface SimulationOptions {
  iterations: number;
  seed: number;
}

const OUTCOME_KEYS: (keyof RoiOutcome)[] = [
  "hoursSavedPerMonth",
  "monthlySavings",
  "monthlyNet",
  "firstYearNet",
  "paybackMonths",
];

/**
 * Samples every input independently from its triangular distribution. Independence is a
 * simplification: in practice volume and duration may correlate, which widens the tails.
 */
export function simulateRoi(
  inputs: RoiInputs,
  { iterations, seed }: SimulationOptions,
): SimulationSummary {
  const random = mulberry32(seed);
  const samples = Object.fromEntries(
    OUTCOME_KEYS.map((k) => [k, new Float64Array(iterations)]),
  ) as Record<keyof RoiOutcome, Float64Array>;
  let positive = 0;

  for (let i = 0; i < iterations; i++) {
    const outcome = evaluateRoi(mapInputs(inputs, (range) => sampleTriangular(range, random())));
    for (const key of OUTCOME_KEYS) samples[key][i] = outcome[key];
    if (outcome.firstYearNet > 0) positive++;
  }

  const summarize = (values: Float64Array): Percentiles => {
    const sorted = Array.from(values).sort((a, b) => a - b);
    return {
      p10: percentile(sorted, 0.1),
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
    };
  };

  return {
    hoursSavedPerMonth: summarize(samples.hoursSavedPerMonth),
    monthlySavings: summarize(samples.monthlySavings),
    monthlyNet: summarize(samples.monthlyNet),
    firstYearNet: summarize(samples.firstYearNet),
    paybackMonths: summarize(samples.paybackMonths),
    iterations,
    seed,
    probabilityPositiveFirstYear: positive / iterations,
  };
}
