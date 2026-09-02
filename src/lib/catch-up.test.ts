import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { replayAway, type AwayBook, type AwayBar } from "./catch-up.ts";

function rising(pair: AwayBar["pair"], start: number, n: number, px = 100): AwayBar[] {
  const out: AwayBar[] = [];
  let p = px;
  for (let i = 0; i < n; i++) {
    p *= 1.0012;
    out.push({
      time: start + i * 60_000,
      pair,
      high: p * 1.0004,
      low: p * 0.9996,
      close: p,
      volume: 120,
    });
  }
  return out;
}

describe("replayAway", () => {
  it("opens and takes a rising lot instead of sitting idle", () => {
    const book: AwayBook = {
      cash: 10_000,
      realized: 0,
      positions: [],
      orders: [],
      risk: { sizePct: 0.05, maxPositions: 4 },
      pairs: ["SUIUSD"],
    };
    const { book: next, report } = replayAway(book, rising("SUIUSD", 1_000, 24, 0.72));
    assert.ok(report.fills >= 1, "expected at least one away fill");
    assert.ok(next.orders.length >= 1);
    assert.ok(next.cash !== 10_000 || next.positions.length > 0);
  });

  it("does not invent fills on an empty tape", () => {
    const book: AwayBook = {
      cash: 10_000,
      realized: 0,
      positions: [],
      orders: [],
      risk: { sizePct: 0.05, maxPositions: 4 },
      pairs: ["SUIUSD"],
    };
    const { report } = replayAway(book, []);
    assert.equal(report.fills, 0);
  });
});
