/** Fair value vs last. Under the gap, Pricer stays quiet. Heat needs 8%. */

export const PRICER_HEAT_GAP = 0.08;
export const PRICER_CORE_GAP = 0.008;

export function fairValue(closes: number[]): number {
  if (closes.length === 0) return 0;
  const n = Math.min(21, closes.length);
  const slice = closes.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function mispricing(last: number, fair: number): number {
  if (!(fair > 0) || !(last > 0)) return 0;
  return Math.abs(last - fair) / fair;
}

export function pricerQuiet(gap: number, sleeve: "core" | "heat" | "stock"): boolean {
  const min = sleeve === "heat" ? PRICER_HEAT_GAP : PRICER_CORE_GAP;
  return gap < min;
}
