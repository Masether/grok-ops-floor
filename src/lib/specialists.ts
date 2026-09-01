import { ema, sma } from "./indicators.ts";
import { PAIR_BY_ID } from "./kraken.ts";
import type { PairId, Ticker, WireItem } from "./types.ts";
import type { Brain } from "./learn.ts";

export type RegimeState = "trend-up" | "trend-down" | "chop";

export type RegimeRead = {
  state: RegimeState;
  note: string;
  allowBuy: boolean;
};

export type FlowRead = {
  ok: boolean;
  spreadPct: number;
  note: string;
};

export function readRegime(closes: number[]): RegimeRead {
  if (closes.length < 50) {
    return { state: "chop", note: "regime cold — short tape", allowBuy: true };
  }
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const last20 = e20[e20.length - 1] ?? 0;
  const last50 = e50[e50.length - 1] ?? 0;
  const prev20 = e20[Math.max(0, e20.length - 8)] ?? last20;
  const slope = last20 !== 0 ? (last20 - prev20) / last20 : 0;
  if (last20 > last50 && slope > 0.0012) {
    return {
      state: "trend-up",
      note: `trend up · slope ${(slope * 100).toFixed(2)}%`,
      allowBuy: true,
    };
  }
  if (last20 < last50 && slope < -0.0012) {
    return {
      state: "trend-down",
      note: `trend down · slope ${(slope * 100).toFixed(2)}%`,
      allowBuy: false,
    };
  }
  return { state: "chop", note: "chop — mean-revert only", allowBuy: true };
}

export function readFlow(ticker: Ticker | undefined, volumes: number[]): FlowRead {
  if (!ticker) return { ok: false, spreadPct: 0, note: "no tape" };
  const mid = ticker.last || (ticker.bid + ticker.ask) / 2;
  const spreadPct = mid > 0 ? (ticker.ask - ticker.bid) / mid : 0;
  const sleeve = PAIR_BY_ID[ticker.pair]?.sleeve ?? "core";
  const cap =
    ticker.pair === "XBTUSD"
      ? 0.0009
      : ticker.pair === "ETHUSD"
        ? 0.0014
        : sleeve === "heat"
          ? 0.008
          : sleeve === "stock"
            ? 0.002
            : 0.0024;
  const vol = volumes[volumes.length - 1] ?? 0;
  const avg = sma(volumes, 20);
  if (spreadPct > cap) {
    return {
      ok: false,
      spreadPct,
      note: `spread ${(spreadPct * 10_000).toFixed(1)} bps — book too wide`,
    };
  }
  if (avg > 0 && vol < avg * 0.35) {
    return { ok: false, spreadPct, note: "volume dead — flow passes" };
  }
  return {
    ok: true,
    spreadPct,
    note: `spread ${(spreadPct * 10_000).toFixed(1)} bps · flow clean`,
  };
}

export function hunterScore(
  pair: PairId,
  ticker: Ticker | undefined,
  brain: Brain,
  hasPos: boolean,
  wire: WireItem[] = [],
): number {
  if (hasPos) return 100;
  const def = PAIR_BY_ID[pair];
  const bias = brain.pairBias[pair] ?? 0;
  if (brain.enabled && bias < -0.35) return -10;
  const ch = ticker?.changePct ?? 0;
  const vol = ticker?.volume ?? 0;
  let score = bias * 3;
  if (def.sleeve === "heat") {
    if (ch > 2) score += Math.min(ch, 28) * 0.55;
    else if (ch < -5) score -= 3;
    else score += ch * 0.08;
    score += 0.1;
  } else if (def.sleeve === "stock") {
    score += 0.35 + Math.max(ch, 0) * 0.18 + (ch < -2 ? -0.4 : 0);
  } else {
    score += 0.55 + Math.min(Math.abs(ch), 6) * 0.12;
  }
  if (vol > 0) score += def.sleeve === "core" ? 0.35 : 0.12;
  const cats = wire.filter((w) => w.pairs.includes(pair) && Date.now() - w.ts < 6 * 3_600_000);
  if (cats.some((c) => c.tone === "bull" || c.kind === "trend")) score += 1.4;
  if (cats.some((c) => c.tone === "bear")) score -= 0.8;
  return score;
}

export function usdOnBook(bal: Record<string, string> | null | undefined): number {
  if (!bal) return 0;
  const keys = ["ZUSD", "USD", "USDT", "USDC", "ZUSDT", "USDT.F", "USDC.F"];
  return keys.reduce((a, k) => a + Number(bal[k] ?? 0), 0);
}
