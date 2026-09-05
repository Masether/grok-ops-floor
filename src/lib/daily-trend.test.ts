import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dailyStance } from "./daily-trend.ts";

function ramp(from: number, to: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(from + ((to - from) * i) / (n - 1));
  return out;
}

describe("dailyStance", () => {
  it("goes long on a sustained uptrend", () => {
    const r = dailyStance(ramp(80, 140, 80));
    assert.equal(r.stance, "long");
    assert.equal(r.allowBuy, true);
    assert.equal(r.allowScalp, true);
  });

  it("sits in cash on a sustained downtrend", () => {
    const r = dailyStance(ramp(140, 80, 80));
    assert.equal(r.stance, "cash");
    assert.equal(r.allowBuy, false);
    assert.equal(r.allowScalp, false);
  });

  it("blocks scalp in chop", () => {
    const closes = Array.from({ length: 80 }, () => 100);
    const r = dailyStance(closes);
    assert.equal(r.allowScalp, false);
    assert.equal(r.allowBuy, true);
  });
});
