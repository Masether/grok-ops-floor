/** Flatten crumbs, and size sells so Kraken doesn't leave change. */

export function shouldSweepDust(input: {
  sleeve?: string;
  notion: number;
  minTicket: number;
}): boolean {
  void input.sleeve;
  return input.notion > 0 && input.notion < input.minTicket;
}

/** Full bag, floored to the pair's lot size. No 0.999 haircut. */
export function sellAllQty(held: number, decimals: number, ordermin: number): number {
  if (!(held > 0)) return 0;
  const places = Math.min(Math.max(Math.floor(decimals), 0), 10);
  const f = 10 ** places;
  const qty = Math.floor(held * f + 1e-9) / f;
  if (qty < ordermin) return 0;
  return qty;
}
