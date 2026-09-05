import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hugeSpike, volumeRatio } from "./spike-alert.ts";

describe("hugeSpike", () => {
  it("needs a live tape rip or a fresh trend wire, not a 24h scout print", () => {
    assert.equal(hugeSpike({ oneMinPct: 0.1, threePct: 0.2, volRatio: 1.1, lane: "up" }).ok, false);
    assert.equal(hugeSpike({ oneMinPct: 1.2, threePct: 1.4, volRatio: 2, lane: "up" }).ok, true);
    assert.equal(hugeSpike({ oneMinPct: 1.2, threePct: 1.4, volRatio: 2, lane: "down" }).ok, false);
    assert.equal(
      hugeSpike({
        oneMinPct: 0.4,
        threePct: 0.5,
        volRatio: 1.1,
        lane: "up",
        wireKind: "trend",
        wireAgeMs: 5 * 60_000,
      }).ok,
      false,
    );
    const wire = hugeSpike({
      oneMinPct: 0.75,
      threePct: 0.9,
      volRatio: 1.1,
      lane: "up",
      wireKind: "trend",
      wireAgeMs: 5 * 60_000,
    });
    assert.equal(wire.ok, true);
    if (wire.ok) assert.equal(wire.source, "wire");
    assert.equal(
      hugeSpike({
        oneMinPct: 0.75,
        threePct: 0.9,
        volRatio: 1.1,
        lane: "up",
        wireKind: "macro",
        wireAgeMs: 5 * 60_000,
      }).ok,
      false,
    );
  });

  it("volume ratio uses the last bar vs the prior average", () => {
    assert.ok(volumeRatio([1, 1, 1, 1, 1, 1, 3]) > 2);
  });
});
