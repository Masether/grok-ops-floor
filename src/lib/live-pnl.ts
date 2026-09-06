import type { PairId, Position, Ticker } from "./types.ts";
import { sessionProfit } from "./desk-pnl.ts";
import { isBtcUsd } from "./kraken.ts";
import { isSyncedLot } from "./live-budget.ts";

export function lotsMark(
  positions: Position[],
  tickers?: Partial<Record<PairId, Ticker>>,
): { lots: number; cost: number; unrealized: number } {
  let lots = 0;
  let cost = 0;
  let unrealized = 0;
  for (const p of positions) {
    const mark = tickers?.[p.pair]?.last ?? p.mark;
    const qty = p.qty;
    const notion = mark * qty;
    lots += notion;
    // Synced bags + BTC reserve: track mark, never invent trade open P&L.
    if (isSyncedLot(p) || isBtcUsd(p.pair)) {
      cost += notion;
      continue;
    }
    // costUsd includes entry fee when set — stops fresh buys looking like instant losses.
    const basis =
      typeof p.costUsd === "number" && p.costUsd > 0 ? p.costUsd : p.entry * qty;
    cost += basis;
    unrealized += notion - basis;
  }
  return { lots, cost, unrealized };
}

export function livePnl(input: {
  realized: number;
  positions: Position[];
  tickers?: Partial<Record<PairId, Ticker>>;
}): { realized: number; unrealized: number; profit: number; lots: number } {
  const marked = lotsMark(input.positions, input.tickers);
  return {
    realized: Number.isFinite(input.realized) ? input.realized : 0,
    unrealized: marked.unrealized,
    profit: sessionProfit(input.realized, marked.unrealized),
    lots: marked.lots,
  };
}

export function pnlRange(points: number[], live: number): { high: number; low: number } {
  let high = live;
  let low = live;
  for (const n of points) {
    if (!Number.isFinite(n)) continue;
    if (n > high) high = n;
    if (n < low) low = n;
  }
  return { high, low };
}
