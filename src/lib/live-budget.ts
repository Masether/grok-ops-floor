import { usdOnBook } from "./specialists.ts";
import type { Position, Ticker, PairId } from "./types.ts";

export const DEFAULT_LIVE_BUDGET = 200;
export const MAX_LIVE_TICKET = 100;
export const MIN_LIVE_BUDGET = 20;
export const MAX_LIVE_BUDGET = 50_000;
export const LIVE_BUDGET_PRESETS = [50, 100, 200, 500] as const;
export const MIN_LIVE_TICKET = 12;
export const MIN_LIVE_HALT_USD = 40;

export function clampLiveBudget(n: number): number {
  const x = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(x)) return DEFAULT_LIVE_BUDGET;
  return Math.min(MAX_LIVE_BUDGET, Math.max(MIN_LIVE_BUDGET, x));
}

export function usdStable(bal: Record<string, string> | null | undefined): number {
  if (!bal) return 0;
  const keys = ["ZUSD", "USD", "ZUSD.F", "USD.F", "USD.HOLD", "ZUSD.HOLD"];
  return keys.reduce((a, k) => a + Number(bal[k] ?? 0), 0);
}

export function usdtStable(bal: Record<string, string> | null | undefined): number {
  if (!bal) return 0;
  return (
    Number(bal.USDT ?? 0) + Number(bal.ZUSDT ?? 0) + Number(bal["USDT.F"] ?? 0)
  );
}

export function krakenKeysOn(keys: { apiKey?: string; apiSecret?: string } | null | undefined): {
  apiKey: string;
  apiSecret: string;
} | null {
  const apiKey = keys?.apiKey?.trim() ?? "";
  const apiSecret = keys?.apiSecret?.trim() ?? "";
  if (apiKey.length < 8 || apiSecret.length < 8) return null;
  return { apiKey, apiSecret };
}

export function hasKrakenBook(bal: Record<string, string> | null | undefined): boolean {
  return Boolean(bal && Object.keys(bal).length > 0);
}

export function livePositions(positions: Position[]): Position[] {
  return positions.filter((p) => p.mode === "live");
}

export function liveSleeve(input: {
  liveBudget: number;
  liveBalance: Record<string, string> | null | undefined;
  positions: Position[];
  tickers?: Partial<Record<PairId, Ticker>>;
}): {
  budget: number;
  venue: number;
  usd: number;
  usdt: number;
  cost: number;
  deployed: number;
  cash: number;
  equity: number;
} {
  const budget = clampLiveBudget(input.liveBudget);
  const venue = usdOnBook(input.liveBalance);
  const usd = usdStable(input.liveBalance);
  const usdt = usdtStable(input.liveBalance);
  const lots = livePositions(input.positions);
  const cost = lots.reduce((a, p) => a + p.entry * p.qty, 0);
  const deployed = lots.reduce((a, p) => {
    const mark = input.tickers?.[p.pair]?.last ?? p.mark;
    return a + mark * p.qty;
  }, 0);
  const cash = Math.max(0, Math.min(venue, Math.max(0, budget - cost)));
  return {
    budget,
    venue,
    usd,
    usdt,
    cost,
    deployed,
    cash,
    equity: cash + deployed,
  };
}
