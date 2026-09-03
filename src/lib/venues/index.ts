import { getVenue as getVenueMeta, resolveLiveVenueId } from "./catalog.mjs";
import { krakenAdapter } from "./kraken.ts";
import { paperAdapter } from "./paper.ts";
import type { VenueAdapter, VenueId } from "./types.ts";

export type { VenueAdapter, VenueId, VenueKeys } from "./types.ts";
export {
  COMING_SOON_VENUES,
  DEFAULT_LIVE_VENUE,
  VENUE_IDS,
  getVenue as getVenueMeta,
  isVenueId,
  resolveLiveVenueId,
} from "./catalog.mjs";

const adapters: Record<VenueId, VenueAdapter> = {
  paper: paperAdapter,
  kraken: krakenAdapter,
};

function asVenueId(id: unknown): VenueId {
  return id === "paper" ? "paper" : "kraken";
}

/** Throws on unknown id. Use getLiveVenue in the runner so a bad id cannot crash a fill. */
export function getVenue(id: string): VenueAdapter {
  const meta = getVenueMeta(id);
  return adapters[asVenueId(meta.id)];
}

export function getLiveVenue(_id?: string): VenueAdapter {
  return krakenAdapter;
}
