/**
 * An uncertain quantity: either a single best guess or a three-point range.
 * Three-point ranges are sampled as triangular distributions by the Monte Carlo engine.
 */
export type Estimate = number | Range;

export interface Range {
  low: number;
  likely: number;
  high: number;
}

export function toRange(estimate: Estimate): Range {
  return typeof estimate === "number"
    ? { low: estimate, likely: estimate, high: estimate }
    : { ...estimate };
}

export function likely(estimate: Estimate): number {
  return typeof estimate === "number" ? estimate : estimate.likely;
}

export function isPoint(range: Range): boolean {
  return range.low === range.high;
}
