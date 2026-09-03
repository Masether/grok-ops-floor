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
  changePct: 0.8,
  recentPnl: [] as number[],
  sessionPnl: 0,
  budget: 200,
};

describe("liveEntry", () => {
  it("passes a clean scalp and blocks a fee-burn streak", () => {
    assert.equal(liveEntry(base).ok, true);
    assert.equal(liveEntry({ ...base, grokKind: "hold", conf: 0.62 }).ok, true);
    assert.equal(liveEntry({ ...base, grokKind: "sell" }).ok, false);
    assert.equal(liveEntry({ ...base, grokKind: "hold", conf: 0.4 }).ok, false);
    assert.equal(liveEntry({ ...base, lane: "chop" }).ok, false);
    assert.equal(liveEntry({ ...base, recentPnl: [-1.1, -0.8] }).ok, false);
    assert.equal(liveEntry({ ...base, sessionPnl: -14 }).ok, false);
  });
});
