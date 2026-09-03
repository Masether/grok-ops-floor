import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampLiveBudget, liveSleeve, DEFAULT_LIVE_BUDGET, hasKrakenBook, krakenKeysOn, liveDayBase, restoreLiveBudget, spotQty, usdStable } from "./live-budget.ts";
import type { Position } from "./types.ts";

function lot(partial: Pick<Position, "qty" | "entry" | "mark">): Position {
  return {
    id: "p1",
    pair: "XBTUSD",
    side: "buy",
    stop: 0,
    take: 0,
    openedAt: 1,
    mode: "live",
    ...partial,
  };
}

describe("clampLiveBudget", () => {
  it("defaults and clamps", () => {
    assert.equal(clampLiveBudget(Number.NaN), DEFAULT_LIVE_BUDGET);
    assert.equal(clampLiveBudget(10), 20);
    assert.equal(clampLiveBudget(200), 200);
    assert.equal(clampLiveBudget(99_999), 50_000);
    assert.equal(restoreLiveBudget(100), 200);
    assert.equal(restoreLiveBudget(200), 200);
    assert.equal(liveDayBase({ dayStart: 200, budget: 200, equity: 100, openLots: 0 }), 100);
    assert.equal(liveDayBase({ dayStart: 200, budget: 200, equity: 180, openLots: 1 }), 200);
  });
});

describe("usdStable", () => {
  it("reads ZUSD and HOLD, not USDT", () => {
    assert.equal(usdStable({ ZUSD: "180", USDT: "50" }), 180);
    assert.equal(usdStable({ "USD.HOLD": "20", USD: "10" }), 30);
    assert.equal(hasKrakenBook({}), false);
    assert.equal(hasKrakenBook({ ZUSD: "1" }), true);
    assert.equal(krakenKeysOn({ apiKey: "short", apiSecret: "x".repeat(20) }), null);
    assert.ok(krakenKeysOn({ apiKey: "k".repeat(10), apiSecret: "s".repeat(10) }));
    assert.equal(spotQty({ XETH: "0.0049" }, "ETH"), 0.0049);
    assert.equal(spotQty({ ZUSD: "200" }, "WIF"), 0);
  });
});

describe("liveSleeve", () => {
  it("caps a fat Kraken wallet to the $200 budget", () => {
    const s = liveSleeve({
      liveBudget: 200,
      liveBalance: { USDT: "5000" },
      positions: [],
    });
    assert.equal(s.cash, 200);
    assert.equal(s.equity, 200);
    assert.equal(s.usdt, 5000);
  });

  it("uses only what's on Kraken when the wallet is thinner than the budget", () => {
    const s = liveSleeve({
      liveBudget: 200,
      liveBalance: { USDT: "80" },
      positions: [],
    });
    assert.equal(s.cash, 80);
    assert.equal(s.equity, 80);
  });

  it("marks a dump against the budget, not the rest of the wallet", () => {
    const s = liveSleeve({
      liveBudget: 200,
      liveBalance: { ZUSD: "4960" },
      positions: [lot({ qty: 0.0005, entry: 80_000, mark: 40_000 })],
    });
    assert.equal(s.cost, 40);
    assert.equal(s.deployed, 20);
    assert.equal(s.cash, 160);
    assert.equal(s.equity, 180);
  });
});
