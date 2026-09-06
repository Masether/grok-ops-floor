/** After a live win, pause new buys so the USD hit is visible on Kraken. */

export const PROFIT_SHOW_MS = 75_000;
export const PROFIT_SHOW_MIN_USD = 0.5;

export function profitShowUntil(now: number, holdMs = PROFIT_SHOW_MS): number {
  return now + holdMs;
}

/**
 * Blocks new buys while the look window is open, or while the user asked to
 * check Kraken first (sticky — no auto-timeout until Continue).
 */
export function profitShowBlocksBuys(
  now: number,
  until: number,
  sticky = false,
): boolean {
  if (sticky) return true;
  return until > 0 && now < until;
}

export function profitShowSecsLeft(
  now: number,
  until: number,
  sticky = false,
): number {
  if (sticky) return 0;
  if (!profitShowBlocksBuys(now, until, false)) return 0;
  return Math.max(1, Math.ceil((until - now) / 1000));
}

/** Copy for sizeTicket / tape when buys are held after a live win. */
export function profitShowHoldWhy(
  now: number,
  until: number,
  sticky = false,
): string {
  if (sticky) {
    return "win sitting as Kraken USD — tap Continue buy when ready";
  }
  const secs = profitShowSecsLeft(now, until, false);
  return `win sitting as Kraken USD — look first, new buys in ${secs}s`;
}
