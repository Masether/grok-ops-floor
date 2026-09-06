/** After a live win, pause new buys so the USD hit is visible on Kraken. */

export const PROFIT_SHOW_MS = 75_000;
export const PROFIT_SHOW_MIN_USD = 0.5;

export function profitShowUntil(now: number, holdMs = PROFIT_SHOW_MS): number {
  return now + holdMs;
}

export function profitShowBlocksBuys(now: number, until: number): boolean {
  return until > 0 && now < until;
}

export function profitShowSecsLeft(now: number, until: number): number {
  if (!profitShowBlocksBuys(now, until)) return 0;
  return Math.max(1, Math.ceil((until - now) / 1000));
}
