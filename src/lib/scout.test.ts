import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MIN_LIQUIDITY_USD, rankScout } from "./scout.ts";

describe("scout", () => {
  it("drops books under $10k liquidity", () => {
    const { kept, dropped, scanned } = rankScout([
      { pair: "XBTUSD", kraken: "XBTUSD", last: 60_000, liquidity: 5_000_000, changePct: 1 },
      { pair: "DEADUSD", kraken: "DEADUSD", last: 0.01, liquidity: 500, changePct: 40 },
      { pair: "PEPEUSD", kraken: "PEPEUSD", last: 0.00001, liquidity: 12_000, changePct: 8 },
    ]);
    assert.equal(scanned, 3);
    assert.equal(dropped, 1);
    assert.equal(kept.length, 2);
    assert.ok(kept.every((h) => h.liquidity >= MIN_LIQUIDITY_USD));
  });
});
