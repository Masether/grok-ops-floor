import { DEFAULT_BRAIN, setupAllowed, type Brain, type SetupId } from "./learn.ts";

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0]!;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function macdHist(values: number[]): number {
  if (values.length < 26) return 0;
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = fast.map((v, i) => v - slow[i]!);
  const signal = ema(line, 9);
  return line[line.length - 1]! - signal[signal.length - 1]!;
}

export function sma(values: number[], period: number): number {
  if (values.length < period) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export type SignalRead = {
  kind: "buy" | "sell" | "hold";
  confidence: number;
  reason: string;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  macdHist: number;
  setup: SetupId | "unknown";
};

export function readSignal(
  closes: number[],
  volumes: number[],
  brain: Brain = DEFAULT_BRAIN,
): SignalRead {
  const last = closes[closes.length - 1] ?? 0;
  const emaFastArr = ema(closes, 9);
  const emaSlowArr = ema(closes, 21);
  const emaFast = emaFastArr[emaFastArr.length - 1] ?? last;
  const emaSlow = emaSlowArr[emaSlowArr.length - 1] ?? last;
  const prevFast = emaFastArr[emaFastArr.length - 2] ?? emaFast;
  const prevSlow = emaSlowArr[emaSlowArr.length - 2] ?? emaSlow;
  const r = rsi(closes, 14);
  const hist = macdHist(closes);
  const vol = volumes[volumes.length - 1] ?? 0;
  const volAvg = sma(volumes, 20);
  const volBoost = volAvg > 0 && vol > volAvg * brain.volMult ? 0.12 : 0;
  const ret5 =
    closes.length > 5 ? (last - closes[closes.length - 6]!) / closes[closes.length - 6]! : 0;

  const crossedUp = prevFast <= prevSlow && emaFast > emaSlow;
  const crossedDn = prevFast >= prevSlow && emaFast < emaSlow;
  const trendUp = emaFast > emaSlow;
  const trendDn = emaFast < emaSlow;
  const rPrev = closes.length > 16 ? rsi(closes.slice(0, -1), 14) : r;
  const histPrev = closes.length > 28 ? macdHist(closes.slice(0, -1)) : hist;
  const nearFast = last <= emaFast * 1.0015 && last >= emaSlow * 0.997;

  let kind: SignalRead["kind"] = "hold";
  let confidence = 0.2;
  let reason = "No edge — desk holds";
  let setup: SetupId | "unknown" = "unknown";

  const buyRsi = brain.rsiBuy;
  const sellRsi = brain.rsiSell;

  if ((r < buyRsi && trendUp) || crossedUp || (r < buyRsi - 6 && ret5 > 0)) {
    kind = "buy";
    setup = crossedUp ? "cross" : "rsi";
    confidence = Math.min(
      0.92,
      0.42 + (buyRsi - Math.min(r, buyRsi)) / 80 + (crossedUp ? brain.emaBoost : 0) + volBoost,
    );
    reason = crossedUp
      ? `EMA 9/21 cross up · RSI ${r.toFixed(0)}`
      : `Oversold bounce · RSI ${r.toFixed(0)} · trend up`;
  } else if (rPrev < buyRsi && r >= buyRsi && trendUp) {
    kind = "buy";
    setup = "rsi";
    confidence = Math.min(0.84, 0.5 + volBoost + (r - rPrev) / 80);
    reason = `RSI reclaim ${rPrev.toFixed(0)}→${r.toFixed(0)} · trend up`;
  } else if (trendUp && nearFast && r >= 32 && r <= 56 && ret5 > -0.004) {
    kind = "buy";
    setup = "rsi";
    confidence = Math.min(0.72, 0.44 + volBoost + (emaFast - emaSlow) / last);
    reason = `Pullback to EMA9 · RSI ${r.toFixed(0)} · trend up`;
  } else if (histPrev <= 0 && hist > 0 && trendUp) {
    kind = "buy";
    setup = "momentum";
    confidence = Math.min(0.74, 0.46 + volBoost);
    reason = `MACD hist flip up · RSI ${r.toFixed(0)}`;
  } else if ((r > sellRsi && trendDn) || crossedDn || (r > sellRsi + 6 && ret5 < 0)) {
    kind = "sell";
    setup = crossedDn ? "cross" : "rsi";
    confidence = Math.min(
      0.92,
      0.42 + (Math.max(r, sellRsi) - sellRsi) / 80 + (crossedDn ? brain.emaBoost : 0) + volBoost,
    );
    reason = crossedDn
      ? `EMA 9/21 cross down · RSI ${r.toFixed(0)}`
      : `Overbought fade · RSI ${r.toFixed(0)} · trend down`;
  } else if (rPrev > sellRsi && r <= sellRsi && trendDn) {
    kind = "sell";
    setup = "rsi";
    confidence = Math.min(0.84, 0.5 + volBoost);
    reason = `RSI roll over ${rPrev.toFixed(0)}→${r.toFixed(0)} · trend down`;
  } else if (histPrev >= 0 && hist < 0 && trendDn) {
    kind = "sell";
    setup = "momentum";
    confidence = Math.min(0.74, 0.46 + volBoost);
    reason = `MACD hist flip down · RSI ${r.toFixed(0)}`;
  } else if (Math.abs(ret5) > brain.momThresh && volBoost > 0) {
    kind = ret5 > 0 ? "buy" : "sell";
    setup = "momentum";
    confidence = Math.min(0.7, 0.38 + Math.abs(ret5) * 12 + volBoost);
    reason = `Momentum ${ret5 > 0 ? "+" : ""}${(ret5 * 100).toFixed(2)}% with volume`;
  }

  if (kind !== "hold" && !setupAllowed(brain, setup)) {
    kind = "hold";
    confidence = 0.2;
    reason = `${setup} setup retired by the brain`;
  }

  if (kind !== "hold" && Math.abs(hist) < 0.00001) {
    confidence *= 0.85;
  }

  return { kind, confidence, reason, rsi: r, emaFast, emaSlow, macdHist: hist, setup };
}

/** 1-minute scalp read — fee-aware fewer tickets, prefer hold on noise. */
export function readScalp(
  closes: number[],
  volumes: number[],
  brain: Brain = DEFAULT_BRAIN,
): SignalRead {
  if (closes.length < 8) {
    const last = closes[closes.length - 1] ?? 0;
    return {
      kind: "hold",
      confidence: 0.2,
      reason: "warming 1m tape",
      rsi: 50,
      emaFast: last,
      emaSlow: last,
      macdHist: 0,
      setup: "unknown",
    };
  }
  const last = closes[closes.length - 1]!;
  const prev = closes[closes.length - 2]!;
  const p3 = closes[closes.length - 4] ?? prev;
  const emaFastArr = ema(closes, 5);
  const emaSlowArr = ema(closes, 13);
  const emaFast = emaFastArr[emaFastArr.length - 1] ?? last;
  const emaSlow = emaSlowArr[emaSlowArr.length - 1] ?? last;
  const prevFast = emaFastArr[emaFastArr.length - 2] ?? emaFast;
  const prevSlow = emaSlowArr[emaSlowArr.length - 2] ?? emaSlow;
  const r = rsi(closes, 7);
  const hist = macdHist(closes);
  const ret1 = prev !== 0 ? (last - prev) / prev : 0;
  const ret3 = p3 !== 0 ? (last - p3) / p3 : 0;
  const crossedUp = prevFast <= prevSlow && emaFast > emaSlow;
  const crossedDn = prevFast >= prevSlow && emaFast < emaSlow;
  const trendUp = emaFast >= emaSlow * 0.999;
  const vol = volumes[volumes.length - 1] ?? 0;
  const volAvg = sma(volumes, 12);
  const volBoost = volAvg > 0 && vol > volAvg * brain.volMult * 0.85 ? 0.08 : 0;
  const knife = ret3 < -0.0012 && ret1 <= 0;

  if (knife && !crossedUp) {
    return {
      kind: "sell",
      confidence: 0.48,
      reason: `Scalp skip knife ${(ret3 * 100).toFixed(2)}% · RSI ${r.toFixed(0)}`,
      rsi: r,
      emaFast,
      emaSlow,
      macdHist: hist,
      setup: "momentum",
    };
  }

  const momBuy =
    ret1 > 0.0012 && (trendUp || ret3 > 0.0025 || (volBoost > 0 && ret3 > 0.0015));
  if (crossedUp || momBuy) {
    return {
      kind: "buy",
      confidence: Math.min(0.86, 0.5 + volBoost + Math.min(0.2, Math.abs(ret3) * 40) + (crossedUp ? 0.12 : 0)),
      reason: crossedUp
        ? `Scalp EMA 5/13 up · RSI ${r.toFixed(0)}`
        : `Scalp uptick ${(ret1 * 100).toFixed(2)}% · RSI ${r.toFixed(0)}`,
      rsi: r,
      emaFast,
      emaSlow,
      macdHist: hist,
      setup: crossedUp ? "cross" : "momentum",
    };
  }
  if (r < 36 && ret1 > 0.0008 && last > prev && trendUp) {
    return {
      kind: "buy",
      confidence: Math.min(0.78, 0.48 + (36 - r) / 80 + volBoost),
      reason: `Scalp RSI bounce ${r.toFixed(0)}`,
      rsi: r,
      emaFast,
      emaSlow,
      macdHist: hist,
      setup: "rsi",
    };
  }
  if (crossedDn || (ret1 < -0.00045 && r > 58)) {
    return {
      kind: "sell",
      confidence: Math.min(0.84, 0.5 + volBoost + (crossedDn ? 0.12 : 0)),
      reason: crossedDn
        ? `Scalp EMA 5/13 down · RSI ${r.toFixed(0)}`
        : `Scalp fade ${r.toFixed(0)}`,
      rsi: r,
      emaFast,
      emaSlow,
      macdHist: hist,
      setup: crossedDn ? "cross" : "momentum",
    };
  }
  if (r > 76 && ret1 <= 0) {
    return {
      kind: "sell",
      confidence: 0.58,
      reason: `Scalp overbought RSI ${r.toFixed(0)}`,
      rsi: r,
      emaFast,
      emaSlow,
      macdHist: hist,
      setup: "rsi",
    };
  }
  return {
    kind: "hold",
    confidence: 0.28,
    reason: `No edge · RSI ${r.toFixed(0)}`,
    rsi: r,
    emaFast,
    emaSlow,
    macdHist: hist,
    setup: "unknown",
  };
}

export function rsiSeries(values: number[], period = 14): number[] {
  const out: number[] = Array(values.length).fill(50);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const at = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[period] = at(avgGain, avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = at(avgGain, avgLoss);
  }
  return out;
}

export function macdHistSeries(values: number[]): number[] {
  if (values.length === 0) return [];
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = fast.map((v, i) => v - (slow[i] ?? v));
  const signal = ema(line, 9);
  return line.map((v, i) => v - (signal[i] ?? 0));
}


export function smaSeries(values: number[], period: number): number[] {
  const p = Math.max(1, Math.floor(period));
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= p) sum -= values[i - p]!;
    const n = i < p - 1 ? i + 1 : p;
    out.push(sum / n);
  }
  return out;
}

export function bollingerBands(
  values: number[],
  period = 20,
  k = 2,
): { mid: number[]; upper: number[]; lower: number[] } {
  const mid = smaSeries(values, period);
  const p = Math.max(1, Math.floor(period));
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - p + 1);
    const n = i - start + 1;
    const m = mid[i]!;
    let ss = 0;
    for (let j = start; j <= i; j++) {
      const d = values[j]! - m;
      ss += d * d;
    }
    const sd = Math.sqrt(ss / n);
    upper.push(m + k * sd);
    lower.push(m - k * sd);
  }
  return { mid, upper, lower };
}

export function macdSeries(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { line: number[]; signal: number[]; hist: number[] } {
  if (values.length === 0) return { line: [], signal: [], hist: [] };
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = f.map((v, i) => v - (s[i] ?? v));
  const signal = ema(line, signalPeriod);
  const hist = line.map((v, i) => v - (signal[i] ?? 0));
  return { line, signal, hist };
}

export function stochasticSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3,
): { k: number[]; d: number[] } {
  const n = closes.length;
  const kp = Math.max(1, Math.floor(kPeriod));
  const k: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - kp + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = start; j <= i; j++) {
      hh = Math.max(hh, highs[j]!);
      ll = Math.min(ll, lows[j]!);
    }
    const range = hh - ll;
    k.push(range === 0 ? 50 : ((closes[i]! - ll) / range) * 100);
  }
  return { k, d: smaSeries(k, dPeriod) };
}
