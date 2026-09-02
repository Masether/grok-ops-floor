import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SCALP, scalpManage, scalpStops } from "./scalp.ts";

describe("scalpStops", () => {
  it("sets a tight 0.35/1.05 band on core", () => {
    const { stop, take } = scalpStops(100, false);
    assert.equal(stop, 99.65);
    assert.ok(Math.abs(take - 101.05) < 1e-9);
  });
});

describe("scalpManage", () => {
  const base = { openedAt: 1_000, entry: 100, mark: 100.1, stop: 99.65, take: 101.05 };

  it("holds a fresh growing lot", () => {
    const r = scalpManage(base, 1_000 + 30_000);
    assert.equal(r.action, "hold");
  });

  it("takes at the scalp target", () => {
    const r = scalpManage({ ...base, mark: 101.1 }, 1_000 + 10_000);
    assert.equal(r.action, "take");
  });

  it("stops a drop", () => {
    const r = scalpManage({ ...base, mark: 99.5 }, 1_000 + 5_000);
    assert.equal(r.action, "stop");
  });

  it("cuts a dead lot after ~75s", () => {
    const r = scalpManage({ ...base, mark: 99.95 }, 1_000 + SCALP.deadMs);
    assert.equal(r.action, "time");
  });

  it("holds past 2m only if still growing", () => {
    const dead = scalpManage({ ...base, mark: 100.02 }, 1_000 + SCALP.growHoldMs);
    assert.equal(dead.action, "time");
    const live = scalpManage({ ...base, mark: 100.2 }, 1_000 + SCALP.growHoldMs);
    assert.equal(live.action, "hold");
  });

  it("flattens at 5m even if green", () => {
    const r = scalpManage({ ...base, mark: 100.3 }, 1_000 + SCALP.maxHoldMs);
    assert.equal(r.action, "time");
  });
});
