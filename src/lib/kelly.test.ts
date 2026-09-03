import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KELLY_CAP, kellyFraction, kellyStake } from "./kelly.ts";

describe("kelly", () => {
  it("caps at 6% even on a fat edge", () => {
    const f = kellyFraction(0.7, 3);
    assert.ok(f > 0);
    assert.ok(f <= KELLY_CAP);
  });

  it("kills a no-edge bet", () => {
    assert.equal(kellyFraction(0.4, 1), 0);
    assert.equal(kellyStake({ pWin: 0.4, payoff: 1, bankroll: 200 }), 0);
  });

  it("sizes $200 bankroll under $12", () => {
    const usd = kellyStake({ pWin: 0.55, payoff: 2, bankroll: 200 });
    assert.ok(usd <= 200 * KELLY_CAP + 1e-9);
    assert.ok(usd > 0);
  });
});
