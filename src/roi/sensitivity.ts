import {
  evaluateRoi,
  likelySample,
  type RoiInput,
  type RoiInputs,
  type RoiOutcome,
} from "./model.js";

export interface TornadoBar {
  input: RoiInput;
  lowInput: number;
  highInput: number;
  /** Metric with this input at its low value and every other input at its likely value. */
  outputAtLow: number;
  outputAtHigh: number;
  /** Absolute spread between the two outputs; bars are sorted by this, largest first. */
  swing: number;
}

export type TornadoMetric = Exclude<keyof RoiOutcome, "paybackMonths">;

/** One-at-a-time sensitivity: swing each input across its range while holding the rest. */
export function tornado(inputs: RoiInputs, metric: TornadoMetric = "firstYearNet"): TornadoBar[] {
  const baseline = likelySample(inputs);
  const bars: TornadoBar[] = [];
  for (const input of Object.keys(inputs) as RoiInput[]) {
    const { low, high } = inputs[input];
    if (low === high) continue;
    const outputAtLow = evaluateRoi({ ...baseline, [input]: low })[metric];
    const outputAtHigh = evaluateRoi({ ...baseline, [input]: high })[metric];
    bars.push({
      input,
      lowInput: low,
      highInput: high,
      outputAtLow,
      outputAtHigh,
      swing: Math.abs(outputAtHigh - outputAtLow),
    });
  }
  return bars.sort((a, b) => b.swing - a.swing || a.input.localeCompare(b.input));
}
