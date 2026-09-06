export const VENUE_IDS: readonly ["kraken"];
export const DEFAULT_LIVE_VENUE: "kraken";
export const COMING_SOON_VENUES: readonly {
  id: string;
  label: string;
  status: string;
}[];
export function isVenueId(id: unknown): id is "kraken" | "paper";
export function getVenue(id: unknown): { id: "kraken"; label: string };
export function resolveLiveVenueId(id: unknown): "kraken";
