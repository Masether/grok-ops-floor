/** Kelly stake. Hard cap 6% of bankroll — Risk kills more than it approves. */

export const KELLY_CAP = 0.06;

export function kellyFraction(pWin: number, payoff: number): number {
  if (!(payoff > 0) || !(pWin > 0) || pWin >= 1) return 0;
  const q = 1 - pWin;
  const f = (payoff * pWin - q) / payoff;
  if (!Number.isFinite(f) || f <= 0) return 0;
  return Math.min(KELLY_CAP, f);
}

export function kellyStake(input: {
  pWin: number;
  payoff: number;
  bankroll: number;
  cap?: number;
}): number {
  const cap = input.cap ?? KELLY_CAP;
  const f = Math.min(cap, kellyFraction(input.pWin, input.payoff));
  if (!(input.bankroll > 0) || f <= 0) return 0;
  return input.bankroll * f;
}
