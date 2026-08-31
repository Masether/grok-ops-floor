import type { VenueAdapter } from "./types";

/** Paper fills stay in the engine. This adapter is a no-op live book. */
export const paperAdapter: VenueAdapter = {
  id: "paper",
  label: "Paper",
  async testConnection() {
    return { ok: true, balance: {} };
  },
  async fetchBalance() {
    return {};
  },
  async placeMarketOrder() {
    throw new Error("Paper venue has no live book");
  },
  async cancelAll() {
    return { count: 0 };
  },
};
