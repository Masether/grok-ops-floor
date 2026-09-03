import { usdOnBook } from "./specialists.ts";
import type { Position, Ticker, PairId } from "./types.ts";

export const DEFAULT_LIVE_BUDGET = 200;
export const LIVE_WORKING_CAP = 100;
export const MIN_LIVE_BUDGET = 20;
export const MAX_LIVE_BUDGET = 50_000;
export const LIVE_BUDGET_PRESETS = [50, 100, 200, 500] as const;
export const MIN_LIVE_TICKET = 12;

export function clampLiveBudget(n: number): number {
  const x = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(x)) return DEFAULT_LIVE_BUDGET;
  return Math.min(MAX_LIVE_BUDGET, Math.max(MIN_LIVE_BUDGET, x));
}

export function usdStable(bal: Record<string, string> | null | undefined): number {
  if (!bal) return 0;
  return Number(bal.ZUSD ?? 0) + Number(bal.USD ?? 0);
}

export function usdtStable(bal: Record<string, string> | null | undefined): number {
  if (!bal) return 0;
  return (
    Number(bal.USDT ?? 0) + Number(bal.ZUSDT ?? 0) + Number(bal["USDT.F"] ?? 0)
  );
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
  const working = Math.min(budget, LIVE_WORKING_CAP);
  const venue = usdOnBook(input.liveBalance);
  const usd = usdStable(input.liveBalance);
  const usdt = usdtStable(input.liveBalance);
  const lots = livePositions(input.positions);
  const cost = lots.reduce((a, p) => a + p.entry * p.qty, 0);
  const deployed = lots.reduce((a, p) => {
    const mark = input.tickers?.[p.pair]?.last ?? p.mark;
    return a + mark * p.qty;
  }, 0);
  const cash = Math.max(0, Math.min(venue, Math.max(0, budget - cost), Math.max(0, working - cost)));
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
