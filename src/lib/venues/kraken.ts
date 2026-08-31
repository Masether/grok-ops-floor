import {
  cancelAllOrders,
  fetchBalance,
  placeMarketOrder,
} from "../kraken-api";
import type { VenueAdapter } from "./types";

/** Thin wrap of existing Kraken REST server functions. Do not rewrite the API. */
export const krakenAdapter: VenueAdapter = {
  id: "kraken",
  label: "Kraken",
  async testConnection(keys) {
    try {
      const balance = await fetchBalance({ data: keys });
      return { ok: true, balance };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Kraken auth failed",
      };
    }
  },
  async fetchBalance(keys) {
    return fetchBalance({ data: keys });
  },
  async placeMarketOrder(args) {
    return placeMarketOrder({
      data: {
        apiKey: args.apiKey,
        apiSecret: args.apiSecret,
        pair: args.pair,
        side: args.side,
        volume: args.volume,
      },
    });
  },
  async cancelAll(keys) {
    return cancelAllOrders({ data: keys });
  },
};
