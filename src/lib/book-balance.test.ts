import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fatBook,
  GROW_READY_USD,
  heatAllowed,
  heatCashLeft,
  splitHunt,
} from "./book-balance.ts";
import { HEAT_MAX_LOTS } from "./kraken.ts";
import type { PairId } from "./types.ts";

describe("heatAllowed", () => {
  it("sleeps heat when the day is already leaking", () => {
    assert.equal(heatAllowed(0.4), true);
    assert.equal(heatAllowed(-1.5), true);
    assert.equal(heatAllowed(-2.1), false);
  });
});

describe("heatCashLeft", () => {
  it("caps heat at 10% of the budget", () => {
    const left = heatCashLeft({ usd: 200, budget: 200, heatOpen: 0 });
    assert.equal(left, 20);
  });
});

describe("fatBook", () => {
  it("is only fat at $50k wallet", () => {
    assert.equal(fatBook(GROW_READY_USD), true);
    assert.equal(fatBook(GROW_READY_USD - 1), false);
  });
});

describe("splitHunt", () => {
  it("does not let heat names crowd core off the tape", () => {
    const ranked = [
      { pair: "BONKUSD" as PairId },
      { pair: "WIFUSD" as PairId },
      { pair: "PEPEUSD" as PairId },
      { pair: "PENGUUSD" as PairId },
      { pair: "ETHUSD" as PairId },
      { pair: "SOLUSD" as PairId },
    ];
    const picked = splitHunt(ranked, new Set(), 8);
    const ids = picked.map((r) => r.pair);
    assert.ok(ids.includes("ETHUSD"));
    assert.ok(ids.includes("SOLUSD"));
    assert.ok(
      ids.filter((id) => id === "BONKUSD" || id === "WIFUSD" || id === "PEPEUSD" || id === "PENGUUSD")
        .length <= HEAT_MAX_LOTS,
    );
  });
});
