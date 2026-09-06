/**
 * Venue id registry. Live adapters live in index.ts so tests do not import
 * Kraken REST server functions.
 */

export const VENUE_IDS = ["kraken"];
export const DEFAULT_LIVE_VENUE = "kraken";

export const COMING_SOON_VENUES = [
  { id: "binance", label: "Binance", status: "next" },
  { id: "coinbase", label: "Coinbase", status: "next" },
  { id: "bybit", label: "Bybit", status: "next" },
];

/** @param {unknown} id */
export function isVenueId(id) {
  return id === "kraken" || id === "paper";
}

/** @param {unknown} id */
export function getVenue(id) {
  // Legacy "paper" id maps to Kraken — this desk is live-only.
  if (id === "paper" || id === "kraken") return { id: "kraken", label: "Kraken" };
  throw new Error(`Unknown venue: ${String(id)}`);
}

/** Live runner: unknown / paper ids fall back to Kraken. */
/** @param {unknown} [_id] */
export function resolveLiveVenueId(_id) {
  return "kraken";
}
