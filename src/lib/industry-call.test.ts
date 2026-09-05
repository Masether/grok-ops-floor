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

  it("denies trend-down scalp but allows grid", () => {
    const scalp = industryCall({ ...clearScalp, regime: "trend-down" });
    assert.equal(scalp.allow, false);
    assert.match(scalp.why, /trend down/);
    const grid = industryCall({ ...clearScalp, playbook: "grid", regime: "trend-down", spike: false });
    assert.equal(grid.allow, true);
  });

  it("denies bear wire scalp", () => {
    const r = industryCall({ ...clearScalp, pairWireTone: "bear" });
    assert.equal(r.allow, false);
    assert.equal(r.why, "wire bear — skip scalp");
  });

  it("denies unpaid fees only when there is no spike", () => {
    const noSpike = industryCall({ ...clearScalp, feesClear: false, spike: false });
    assert.equal(noSpike.allow, false);
    assert.equal(noSpike.why, "fees eat this clip");
    const withSpike = industryCall({ ...clearScalp, feesClear: false, spike: true });
    assert.equal(withSpike.allow, true);
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
