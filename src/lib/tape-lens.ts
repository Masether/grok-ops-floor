/** VWAP + volume-spike lenses. They tilt scalp vs grid — they do not place orders. */

export type TapeLane = "up" | "down" | "chop";
export type TapeLens = "scalp" | "grid" | null;

export type VwapBar = {
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function vwapSeries(bars: VwapBar[]): number[] {
  const out: number[] = [];
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    const v = Math.max(0, b.volume);
    pv += tp * v;
    vol += v;
    out.push(vol > 0 ? pv / vol : tp);
  }
  return out;
}

export function volumeSpikes(volumes: number[], lookback = 20, mult = 2.4): boolean[] {
  return volumes.map((v, i) => {
    const from = Math.max(0, i - lookback);
    const window = volumes.slice(from, i);
    if (window.length < 8) return false;
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    return avg > 0 && v > avg * mult;
  });
}

export function vwapStretch(price: number, vwap: number): number {
  if (!(vwap > 0) || !(price > 0)) return 0;
  return Math.abs(price - vwap) / vwap;
}

export function volumeBuild(volumes: number[], lookback = 20, mult = 1.55): boolean[] {
  return volumes.map((v, i) => {
    const from = Math.max(0, i - lookback);
    const window = volumes.slice(from, i);
    if (window.length < 8) return false;
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    return avg > 0 && v > avg * mult;
  });
}

/** Spike + trend near VWAP → scalp. Volume *building* + reclaim VWAP → scalp early (before the 2.4× print). */
export function tapeLens(input: {
  price: number;
  vwap: number;
  spike: boolean;
  lane: TapeLane;
  building?: boolean;
}): TapeLens {
  const stretch = vwapStretch(input.price, input.vwap);
  const stretched = stretch >= 0.008;
  if (stretched && input.lane === "up") return null;
  if (input.spike && input.lane === "up") return "scalp";
  if (input.building && input.lane !== "down" && input.price >= input.vwap * 0.998 && !stretched) {
    return "scalp";
  }
  if (stretched && input.lane === "chop") return "grid";
  return null;
}

/** Heat dump: MACD down or lost VWAP — get out as fast as they fell. */
export function heatFading(input: {
  entry: number;
  mark: number;
  vwap?: number;
  lane?: TapeLane;
  changePct?: number;
}): boolean {
  if (input.lane === "down") return true;
  if (typeof input.changePct === "number" && input.changePct <= -1.2) return true;
  if (input.vwap && input.vwap > 0 && input.mark < input.vwap * 0.997) return true;
  if (input.entry > 0 && (input.mark - input.entry) / input.entry <= -0.004) return true;
  return false;
}
