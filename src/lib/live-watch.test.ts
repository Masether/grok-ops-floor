import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BTC_BOOK_MIN_USD, HEAT_PAIRS, btcBookArmed, isBtcQuote, liveWatchPairs } from "./kraken.ts";
import type { PairId } from "./types.ts";

describe("liveWatchPairs", () => {
  it("heat-only book is memes", () => {
    const heat = liveWatchPairs(["ETHUSD", "ETHXBT"] as PairId[], 400, true);
    assert.ok(heat.includes("BONKUSD"));
    assert.ok(heat.includes("DOGEUSD"));
    assert.ok(heat.includes("SHIBUSD"));
    assert.ok(!heat.includes("ETHUSD"));
    assert.ok(heat.every((id) => !isBtcQuote(id)));
  });

  it("full USD book until BTC is worth $1000", () => {
    assert.equal(btcBookArmed(400), false);
    assert.equal(btcBookArmed(BTC_BOOK_MIN_USD), true);
    const usdOnly = liveWatchPairs(["ETHXBT", "ETHUSD", "SOLUSD"] as PairId[], 400, false);
    assert.ok(usdOnly.includes("ETHUSD"));
    assert.ok(HEAT_PAIRS.some((id) => usdOnly.includes(id)));
    assert.ok(usdOnly.every((id) => !isBtcQuote(id)));
  });

  it("adds BTC twins once the bag is $1000", () => {
    const both = liveWatchPairs(["ETHUSD"], 1_200, false);
    assert.ok(both.some((id) => isBtcQuote(id)));
    assert.ok(both.includes("ETHUSD"));
  });
});
