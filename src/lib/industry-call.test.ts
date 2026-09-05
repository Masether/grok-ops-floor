import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { industryCall } from "./industry-call.ts";

const clearScalp = {
  kind: "buy" as const,
  playbook: "scalp" as const,
  daily: "long" as const,
  regime: "trend-up" as const,
  fearGreed: 50,
  pairWireTone: "bull" as const,
  spike: true,
  feesClear: true,
};

describe("industryCall", () => {
  it("allows fee-clear trend scalp", () => {
    const r = industryCall(clearScalp);
    assert.equal(r.allow, true);
    assert.equal(r.why, "clear");
  });

  it("denies cash daily", () => {
    const r = industryCall({ ...clearScalp, daily: "cash" });
    assert.equal(r.allow, false);
    assert.equal(r.why, "daily sit USD");
  });

  it("denies chop with no spike", () => {
    const daily = industryCall({
      ...clearScalp,
      daily: "chop",
      spike: false,
    });
    assert.equal(daily.allow, false);
    assert.equal(daily.why, "daily chop — no scalp");

    const tape = industryCall({
      ...clearScalp,
      daily: "long",
      regime: "chop",
      spike: false,
    });
    assert.equal(tape.allow, false);
    assert.equal(tape.why, "tape chop — no scalp");
  });

  it("denies trend-down", () => {
    const r = industryCall({ ...clearScalp, regime: "trend-down" });
    assert.equal(r.allow, false);
    assert.equal(r.why, "tape trend down — sit");
  });

  it("denies bear wire scalp", () => {
    const r = industryCall({ ...clearScalp, pairWireTone: "bear" });
    assert.equal(r.allow, false);
    assert.equal(r.why, "wire bear — skip scalp");
  });

  it("denies unpaid fees", () => {
    const r = industryCall({ ...clearScalp, feesClear: false });
    assert.equal(r.allow, false);
    assert.equal(r.why, "fees eat this clip");
  });

  it("denies greed chase", () => {
    const r = industryCall({
      ...clearScalp,
      fearGreed: 90,
      daily: "chop",
      spike: true,
    });
    assert.equal(r.allow, false);
    assert.equal(r.why, "extreme greed — no chase");
  });

  it("sell still allows", () => {
    const r = industryCall({
      ...clearScalp,
      kind: "sell",
      daily: "cash",
      regime: "trend-down",
      feesClear: false,
      pairWireTone: "bear",
    });
    assert.equal(r.allow, true);
    assert.equal(r.why, "clear");
  });
});
