/** Scout Kraken USD books. Heat-only keeps every liquid meme Kraken actually lists. */

import { getPair } from "./kraken.ts";

export const MIN_LIQUIDITY_USD = 5_000;
export const SCOUT_KEEP = 16;
export const MEME_WATCH_CAP = 64;

export type ScoutHit = {
  pair: string;
  kraken: string;
  last: number;
  liquidity: number;
  changePct: number;
};

const SKIP_BASE =
  /^(USD|USDT|USDC|DAI|EUR|GBP|AUD|CAD|CHF|JPY|PYUSD|USDG|XBT|BTC|ETH|SOL|XRP|ADA|DOT|LINK|AVAX|SUI|TAO|NEAR|ATOM|LTC|BCH|XMR|FIL|UNI|AAVE|MKR|SNX|TRX|BNB)$/i;

export function isKrakenMeme(hit: ScoutHit): boolean {
  const def = getPair(hit.pair);
  if (def?.sleeve === "core" || def?.sleeve === "stock") return false;
  if (/xUSD$/i.test(hit.pair)) return false;
  const base = def?.base ?? hit.pair.replace(/USD$/i, "");
  if (SKIP_BASE.test(base)) return false;
  return true;
}

export function rankScout(hits: ScoutHit[], minLiq = MIN_LIQUIDITY_USD): {
  kept: ScoutHit[];
  dropped: number;
  scanned: number;
} {
  const scanned = hits.length;
  const liquid = hits.filter((h) => h.liquidity >= minLiq && h.last > 0);
  const dropped = scanned - liquid.length;
  const kept = [...liquid]
    .sort(
      (a, b) =>
        b.changePct * Math.log10(b.liquidity + 10) - a.changePct * Math.log10(a.liquidity + 10),
    )
    .slice(0, SCOUT_KEEP);
  return { kept, dropped, scanned };
}

/** Every liquid Kraken USD meme, hottest first. Not pump.fun — Kraken listed only. */
export function rankMemeScout(hits: ScoutHit[], minLiq = MIN_LIQUIDITY_USD): {
  kept: ScoutHit[];
  dropped: number;
  scanned: number;
} {
  const scanned = hits.length;
  const memes = hits.filter((h) => h.last > 0 && h.liquidity >= minLiq && isKrakenMeme(h));
  const dropped = scanned - memes.length;
  const kept = [...memes].sort(
    (a, b) =>
      Math.abs(b.changePct) * Math.log10(b.liquidity + 10) -
      Math.abs(a.changePct) * Math.log10(a.liquidity + 10),
  );
  return { kept: kept.slice(0, MEME_WATCH_CAP), dropped, scanned };
}
