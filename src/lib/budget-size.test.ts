import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { budgetStake } from "./budget-size.ts";

describe("budgetStake", () => {
  it("sits at min when the edge is dead", () => {
    const usd = budgetStake({ remaining: 200, confidence: 0.4, pWin: 0.4, payoff: 1 });
    assert.ok(usd >= 12);
    assert.ok(usd < 50);
  });

  it("caps one ticket at $100 even if $200 is free", () => {
    const usd = budgetStake({ remaining: 200, confidence: 0.9, pWin: 0.7, payoff: 3 });
    assert.ok(usd > 40);
    assert.ok(usd <= 100);
  });

  it("uses the leftover $100 for the next ticket", () => {
    const next = budgetStake({ remaining: 100, confidence: 0.9, pWin: 0.7, payoff: 3 });
    assert.ok(next > 40);
    assert.ok(next <= 100);
  });

  it("never exceeds remaining cash", () => {
    const usd = budgetStake({ remaining: 30, confidence: 0.99, pWin: 0.8, payoff: 4 });
    assert.ok(usd <= 30);
    assert.ok(usd >= 12);
  });

  it("returns 0 when remaining is under the min ticket", () => {
    assert.equal(budgetStake({ remaining: 8, confidence: 0.9, pWin: 0.7, payoff: 2 }), 0);
  });

  it("caps heat tickets so they stay a small sleeve", () => {
    const usd = budgetStake({
      remaining: 200,
      confidence: 0.9,
      pWin: 0.7,
      payoff: 3,
      heat: true,
    });
    assert.ok(usd >= 12);
    assert.ok(usd <= 40);
  });
});
