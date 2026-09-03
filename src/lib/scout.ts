/** Scout: scan the tape, drop anything under $10k liquidity, keep a hot book. */

export const MIN_LIQUIDITY_USD = 10_000;
export const SCOUT_KEEP = 16;

export type ScoutHit = {
  pair: string;
  kraken: string;
  last: number;
  liquidity: number;
  changePct: number;
};

export function rankScout(hits: ScoutHit[], minLiq = MIN_LIQUIDITY_USD): {
  kept: ScoutHit[];
  dropped: number;
  scanned: number;
} {
  const scanned = hits.length;
  const liquid = hits.filter((h) => h.liquidity >= minLiq && h.last > 0);
  const dropped = scanned - liquid.length;
  const kept = [...liquid]
    .sort((a, b) => Math.abs(b.changePct) * Math.log10(b.liquidity + 10) - Math.abs(a.changePct) * Math.log10(a.liquidity + 10))
    .slice(0, SCOUT_KEEP);
  return { kept, dropped, scanned };
}
