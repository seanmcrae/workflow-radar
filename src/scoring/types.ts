/** One factor's share of a 0-100 score, kept so every score can explain itself. */
export interface FactorContribution {
  factor: string;
  /** Normalized factor value in [0, 1]. */
  value: number;
  /** Weight after normalizing all weights to sum to 1. */
  weight: number;
  /** Points this factor adds to the 0-100 score. */
  points: number;
  note: string;
}

export interface ScoreBreakdown {
  score: number;
  factors: FactorContribution[];
}

export function weightedScore(
  entries: { factor: string; value: number; rawWeight: number; note: string }[],
): ScoreBreakdown {
  const total = entries.reduce((sum, e) => sum + e.rawWeight, 0);
  const factors = entries.map((e) => {
    const weight = total > 0 ? e.rawWeight / total : 0;
    return {
      factor: e.factor,
      value: e.value,
      weight,
      points: 100 * weight * e.value,
      note: e.note,
    };
  });
  return { score: factors.reduce((sum, f) => sum + f.points, 0), factors };
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
