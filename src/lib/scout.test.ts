import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MIN_LIQUIDITY_USD, rankMemeScout, rankScout } from "./scout.ts";

describe("scout", () => {
  it("drops books under the liquidity floor", () => {
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

  it("heat scout keeps Kraken memes and skips majors", () => {
    const { kept } = rankMemeScout([
      { pair: "ETHUSD", kraken: "ETHUSD", last: 2_400, liquidity: 50_000_000, changePct: 1 },
      { pair: "BONKUSD", kraken: "BONKUSD", last: 0.00002, liquidity: 80_000, changePct: 12 },
      { pair: "USDTUSD", kraken: "USDTUSD", last: 1, liquidity: 9_000_000, changePct: 0.01 },
      { pair: "PEPEUSD", kraken: "PEPEUSD", last: 0.00001, liquidity: 40_000, changePct: 6 },
    ]);
    const ids = kept.map((h) => h.pair);
    assert.ok(ids.includes("BONKUSD"));
    assert.ok(ids.includes("PEPEUSD"));
    assert.ok(!ids.includes("ETHUSD"));
    assert.ok(!ids.includes("USDTUSD"));
  });
});
