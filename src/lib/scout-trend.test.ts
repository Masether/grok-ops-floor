import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankTrendHeat, type ScoutHit } from "./scout.ts";
import { registerPair } from "./kraken.ts";

describe("rankTrendHeat", () => {
  it("surfaces a ripping ZEC-style heat name over quiet memes", () => {
    registerPair({
      id: "ZECUSD" as never,
      kraken: "ZECUSD",
      wsSymbol: "ZEC/USD",
      resultKeys: ["XZECZUSD", "ZECUSD"],
      base: "ZEC",
      quote: "USD",
      label: "ZEC/USD",
      decimals: 4,
      ordermin: 0.01,
      sleeve: "heat",
    });
    const hits: ScoutHit[] = [
      { pair: "ETHUSD", kraken: "ETHUSD", last: 2500, liquidity: 50_000_000, changePct: 0.4 },
      { pair: "ZECUSD", kraken: "ZECUSD", last: 1180, liquidity: 40_000_000, changePct: 18 },
      { pair: "PENGUUSD", kraken: "PENGUUSD", last: 0.02, liquidity: 80_000, changePct: 0.2 },
      { pair: "BONKUSD", kraken: "BONKUSD", last: 0.00002, liquidity: 200_000, changePct: 3 },
    ];
    const hot = rankTrendHeat(hits, 5_000);
    assert.equal(hot[0]?.pair, "ZECUSD");
    assert.ok(hot.some((h) => h.pair === "BONKUSD"));
    assert.ok(!hot.some((h) => h.pair === "ETHUSD"));
  });
});
