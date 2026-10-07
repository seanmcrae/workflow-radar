import type { Range } from "../domain/estimate.js";

/** mulberry32: a small, fast 32-bit PRNG. Deterministic for a given seed across platforms. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a; used to derive a per-opportunity seed so results do not depend on input order. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Inverse-CDF sample of a triangular distribution from a uniform draw u in [0, 1). */
export function sampleTriangular({ low, likely, high }: Range, u: number): number {
  if (high === low) return low;
  const split = (likely - low) / (high - low);
  return u < split
    ? low + Math.sqrt(u * (high - low) * (likely - low))
    : high - Math.sqrt((1 - u) * (high - low) * (high - likely));
}

/** Linear-interpolated percentile of an ascending-sorted array; p in [0, 1]. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile of an empty sample");
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const a = sorted[lower] as number;
  const b = sorted[upper] as number;
  if (lower === upper || !Number.isFinite(a) || !Number.isFinite(b)) {
    return position - lower < 0.5 ? a : b;
  }
  return a + (b - a) * (position - lower);
}
