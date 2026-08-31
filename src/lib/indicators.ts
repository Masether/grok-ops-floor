import { DEFAULT_BRAIN, setupAllowed, type Brain, type SetupId } from "./learn";

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
