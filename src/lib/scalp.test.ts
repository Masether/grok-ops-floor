import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SCALP, scalpManage, scalpStops } from "./scalp.ts";

describe("scalpStops", () => {
  it("sets a stop under entry and a take above round-trip fees", () => {
    const { stop, take } = scalpStops(100, false);
    assert.equal(stop, 99.65);
    assert.ok(take >= 102.15);
  });
});

describe("scalpManage", () => {
  const base = { openedAt: 1_000, entry: 100, mark: 100.1, stop: 99.65, take: 102.2 };

  it("holds a fresh lot that has not cleared fees", () => {
    const r = scalpManage(base, 1_000 + 3_000);
    assert.equal(r.action, "hold");
  });

  it("takes at the stretch target once fees are covered", () => {
    const r = scalpManage({ ...base, mark: 102.3 }, 1_000 + 6_000);
    assert.equal(r.action, "take");
  });

  it("clips in seconds once the move covers fees", () => {
    const r = scalpManage({ ...base, mark: 102.3 }, 1_000 + SCALP.fastTakeMs);
    assert.equal(r.action, "take");
  });

  it("stops a drop", () => {
    const r = scalpManage({ ...base, mark: 99.5 }, 1_000 + 5_000);
    assert.equal(r.action, "stop");
  });

  it("cuts a dead lot after ~12s", () => {
    const r = scalpManage({ ...base, mark: 99.95 }, 1_000 + SCALP.deadMs);
    assert.equal(r.action, "time");
  });

  it("lets a still-growing lot run past 20s", () => {
    const tinyGreen = scalpManage({ ...base, mark: 100.02 }, 1_000 + SCALP.growHoldMs);
    assert.equal(tinyGreen.action, "hold");
    const live = scalpManage({ ...base, mark: 100.2 }, 1_000 + SCALP.growHoldMs);
    assert.equal(live.action, "hold");
  });

  it("does not bank a take until Kraken fees are covered", () => {
    const r = scalpManage({ ...base, mark: 100.4, qty: 10 }, 1_000 + SCALP.fastTakeMs);
    assert.equal(r.action, "hold");
  });

  it("holds a mark that used to clear old fees but not Tier-1 RT", () => {
    const r = scalpManage({ ...base, mark: 101.4 }, 1_000 + SCALP.fastTakeMs);
    assert.equal(r.action, "hold");
  });

  it("cuts on -$0.30 even if the % stop has not printed", () => {
    const r = scalpManage(
      { ...base, mark: 99.8, stop: 90, qty: 2 },
      1_000 + 2_000,
    );
    assert.equal(r.action, "stop");
  });

  it("dumps heat the moment it fades", () => {
    const r = scalpManage(
      { ...base, mark: 100.2, heat: true, fading: true, qty: 10 },
      1_000 + 2_000,
    );
    assert.equal(r.action, "stop");
  });

  it("trails a heat spike instead of clipping the wick", () => {
    const r = scalpManage(
      { ...base, mark: 105, take: 104, heat: true, qty: 4 },
      1_000 + 8_000,
    );
    assert.equal(r.action, "hold");
  });

  it("follows a fat meme spike instead of banking half", () => {
    const r = scalpManage(
      { ...base, mark: 600, take: 104, heat: true, qty: 0.3, costUsd: 30, peakPnlUsd: 149 },
      1_000 + 8_000,
    );
    assert.equal(r.action, "hold");
  });

  it("closes the rest if profit gives back 15% from the peak", () => {
    const r = scalpManage(
      {
        ...base,
        mark: 520,
        take: 104,
        heat: true,
        qty: 0.3,
        costUsd: 30,
        banked: true,
        peakPnlUsd: 150,
      },
      1_000 + 12_000,
    );
    assert.equal(r.action, "take");
    assert.equal(r.sellFrac, 1);
  });

  it("watches a small heat green instead of clipping dollars", () => {
    const r = scalpManage(
      { ...base, mark: 101.3, take: 104, heat: true, qty: 20 },
      1_000 + 8_000,
    );
    assert.equal(r.action, "hold");
  });

  it("does not bank the remaining heat slice twice", () => {
    const r = scalpManage(
      { ...base, mark: 105, take: 104, heat: true, banked: true, qty: 5 },
      1_000 + 8_000,
    );
    assert.equal(r.action, "hold");
  });

  it("does not clock-out a growing heat lot", () => {
    const r = scalpManage(
      { ...base, mark: 101.5, take: 104, heat: true, qty: 20 },
      1_000 + 3 * 60_000,
    );
    assert.equal(r.action, "hold");
  });
});
