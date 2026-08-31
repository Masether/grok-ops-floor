export const VENUE_IDS: readonly ["paper", "kraken"];
export const DEFAULT_LIVE_VENUE: "kraken";
export const COMING_SOON_VENUES: readonly {
  id: string;
  label: string;
  status: "next";
}[];
export function isVenueId(id: unknown): id is "paper" | "kraken";
export function getVenue(id: unknown): { id: "paper" | "kraken"; label: string };
export function resolveLiveVenueId(id: unknown): "paper" | "kraken";
