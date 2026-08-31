/**
 * Venue id registry. Live adapters live in index.ts so tests do not import
 * Kraken REST server functions.
 */

export const VENUE_IDS = ["paper", "kraken"];
export const DEFAULT_LIVE_VENUE = "kraken";

export const COMING_SOON_VENUES = [
  { id: "binance", label: "Binance", status: "next" },
  { id: "coinbase", label: "Coinbase", status: "next" },
  { id: "bybit", label: "Bybit", status: "next" },
];

/** @param {unknown} id */
export function isVenueId(id) {
  return id === "paper" || id === "kraken";
}

/** @param {unknown} id */
export function getVenue(id) {
  if (id === "paper") return { id: "paper", label: "Paper" };
  if (id === "kraken") return { id: "kraken", label: "Kraken" };
  throw new Error(`Unknown venue: ${String(id)}`);
}

/** Live runner: unknown ids fall back to Kraken instead of throwing mid-ticket.
 * @param {unknown} id
 */
export function resolveLiveVenueId(id) {
  if (isVenueId(id)) return /** @type {"paper" | "kraken"} */ (id);
  return DEFAULT_LIVE_VENUE;
}
