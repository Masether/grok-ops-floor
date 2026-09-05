import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { liveEntry } from "./sharp.ts";

const base = {
  grokKind: "buy",
  readKind: "buy",
  lane: "up" as const,
  playbook: "scalp" as const,
  conf: 0.62,
  heat: false,
  changePct: 2.5,
  expectedMovePct: 0.025,
  recentPnl: [] as number[],
  sessionPnl: 0,
  budget: 200,
};

describe("liveEntry", () => {
  it("lets a tape buy through and still blocks dumps and a loss streak", () => {
    assert.equal(liveEntry(base).ok, true);
    assert.equal(liveEntry({ ...base, grokKind: "hold", readKind: "buy" }).ok, true);
    assert.equal(liveEntry({ ...base, grokKind: "sell" }).ok, false);
    assert.equal(liveEntry({ ...base, lane: "down" }).ok, false);
    assert.equal(liveEntry({ ...base, recentPnl: [-1.1, -0.8] }).ok, false);
    assert.equal(liveEntry({ ...base, recentPnl: [-0.3, -0.3] }).ok, false);
    assert.equal(liveEntry({ ...base, grokKind: "hold", readKind: "hold" }).ok, false);
    assert.equal(liveEntry({ ...base, grokKind: "hold", readKind: "hold", hot: true }).ok, true);
    assert.equal(
      liveEntry({ ...base, playbook: "grid", grokKind: "hold", readKind: "hold", lane: "chop" }).ok,
      true,
    );
    assert.equal(liveEntry({ ...base, sessionPnl: -30 }).ok, false);
    assert.equal(liveEntry({ ...base, heat: true, changePct: 0.04, lane: "down", expectedMovePct: 0.0004 }).ok, false);
    assert.equal(liveEntry({ ...base, heat: true, changePct: 2.5, expectedMovePct: 0.025 }).ok, true);
    assert.equal(liveEntry({ ...base, heat: true, hot: true, changePct: 3.2, expectedMovePct: 0.032 }).ok, true);
    assert.equal(
      liveEntry({ ...base, heat: true, hot: true, lane: "down", changePct: 1.5, expectedMovePct: 0.015 }).ok,
      true,
    );
    assert.equal(
      liveEntry({ ...base, changePct: 0.8, expectedMovePct: 0.008, hot: false }).ok,
      false,
    );
    const cashBlock = liveEntry({
      ...base,
      daily: "cash",
      regime: "trend-up",
      spike: true,
      hot: true,
      fearGreed: 50,
    });
    assert.equal(cashBlock.ok, false);
    if (!cashBlock.ok) assert.equal(cashBlock.why, "daily sit USD");
  });
});
