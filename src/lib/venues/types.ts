import type { PairId } from "../types";

export type VenueId = "paper" | "kraken";

export type VenueKeys = {
  apiKey: string;
  apiSecret: string;
};

export type VenueAdapter = {
  id: VenueId;
  label: string;
  testConnection(
    keys: VenueKeys,
  ): Promise<
    { ok: true; balance: Record<string, string> } | { ok: false; error: string }
  >;
  fetchBalance(keys: VenueKeys): Promise<Record<string, string>>;
  placeMarketOrder(
    args: VenueKeys & {
      pair: PairId;
      side: "buy" | "sell";
      volume: string;
    },
  ): Promise<{ txid: string; descr: string }>;
  cancelAll(keys: VenueKeys): Promise<{ count: number }>;
};
