import { getVenue as getVenueMeta, resolveLiveVenueId } from "./catalog.mjs";
import { krakenAdapter } from "./kraken.ts";
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
  kraken: krakenAdapter,
};

/** Throws on unknown id. Paper → Kraken. */
export function getVenue(id: string): VenueAdapter {
  getVenueMeta(id); // validate / coerce
  return adapters.kraken;
}

export function getLiveVenue(_id?: string): VenueAdapter {
  return krakenAdapter;
}

// keep resolve import used for callers that still pass venue ids
void resolveLiveVenueId;
