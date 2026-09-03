/** Ticket from min up to $100 each. The rest of the $200 keeps trading. */

import { kellyFraction } from "./kelly.ts";
import { MAX_LIVE_TICKET, MIN_LIVE_TICKET } from "./live-budget.ts";

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function budgetStake(input: {
  remaining: number;
  confidence: number;
  pWin: number;
  payoff: number;
  heat?: boolean;
  minTicket?: number;
  maxTicket?: number;
}): number {
  const minN = input.minTicket ?? MIN_LIVE_TICKET;
  const remaining = Math.max(0, input.remaining);
  if (remaining < minN) return 0;
  const cap = input.maxTicket ?? MAX_LIVE_TICKET;
  const maxN = Math.min(remaining * 0.98, cap);
  const f = kellyFraction(input.pWin, input.payoff);
  const edge = f <= 0 ? 0.18 : clamp(f / 0.06, 0.18, 1);
  const conf = clamp((input.confidence - 0.32) / 0.55, 0.12, 1);
  let usd = minN + (maxN - minN) * edge * conf;
  if (input.heat) usd = Math.min(usd, remaining * 0.45);
  usd = clamp(usd, minN, maxN);
  return Math.round(usd * 100) / 100;
}
