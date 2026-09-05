/** Heat is a small pocket. Core keeps the rest so fees on memes don't eat the bag. */

import { getPair, PAIR_BY_ID, HEAT_MAX_LOTS } from "./kraken.ts";
import type { PairId, Position, Ticker } from "./types.ts";

export const HEAT_BUDGET_PCT = 0.1;
export const HEAT_DAY_SLEEP_USD = 2;
export const GROW_READY_USD = 50_000;

/** Poly stays off until the Kraken wallet itself is $50k — not lifetime PnL. */
export function fatBook(walletUsd: number): boolean {
  return Number.isFinite(walletUsd) && walletUsd >= GROW_READY_USD;
}

/** Heat only adds when the day is not already leaking. Core still exits. */
export function heatAllowed(dayPnl: number): boolean {
  return Number.isFinite(dayPnl) && dayPnl > -HEAT_DAY_SLEEP_USD;
}

export function pairSleeve(pair: PairId): "core" | "heat" | "stock" {
  return (getPair(pair) ?? PAIR_BY_ID[pair])?.sleeve ?? "core";
}

export function heatOpenUsd(
  positions: Position[],
  tickers?: Partial<Record<PairId, Ticker>>,
): number {
  let n = 0;
  for (const p of positions) {
    if (pairSleeve(p.pair) !== "heat") continue;
    const px = tickers?.[p.pair]?.last ?? p.mark;
    n += Math.max(0, px * p.qty);
  }
  return n;
}

/** Cash heat is allowed to spend this tick. 0 when the pocket is full. */
export function heatCashLeft(input: {
  usd: number;
  budget: number;
  heatOpen: number;
}): number {
  const cap = Math.max(0, input.budget * HEAT_BUDGET_PCT);
  const room = Math.max(0, cap - input.heatOpen);
  return Math.min(Math.max(0, input.usd), room);
}

export function heatLotCount(positions: Position[]): number {
  return positions.filter((p) => pairSleeve(p.pair) === "heat").length;
}

/** Scan at least 6 core names; heat gets at most HEAT_MAX_LOTS extra seats. */
export function splitHunt<T extends { pair: PairId }>(
  ranked: T[],
  open: Set<string>,
  take = 8,
): T[] {
  const core: T[] = [];
  const heat: T[] = [];
  for (const row of ranked) {
    if (open.has(row.pair)) continue;
    if (pairSleeve(row.pair) === "heat") heat.push(row);
    else core.push(row);
  }
  const held = ranked.filter((r) => open.has(r.pair));
  const coreTake = Math.max(1, take - HEAT_MAX_LOTS);
  return [...held, ...core.slice(0, coreTake), ...heat.slice(0, HEAT_MAX_LOTS)].slice(0, take + held.length);
}
