import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { livePnl, lotsMark, pnlRange } from "./live-pnl.ts";
import type { Position, Ticker } from "./types.ts";

const tick = (last: number): Ticker => ({
  pair: "ETHUSD",
  last,
  bid: last,
  ask: last,
  open: last,
  high: last,
  low: last,
  volume: 1,
  changePct: 0,
  vwap: last,
  ts: 1,
});

const lot: Position = {
  id: "p1",
  pair: "ETHUSD",
  side: "buy",
  qty: 0.01,
  entry: 2000,
  mark: 2000,
  stop: 1980,
  take: 2040,
  openedAt: 1,
  mode: "live",
};

describe("livePnl", () => {
  it("marks unrealized off the live last, not the stale lot mark", () => {
    const marked = lotsMark([lot], { ETHUSD: tick(2010) });
    assert.equal(marked.lots, 20.1);
    assert.equal(marked.unrealized, 0.1);
    const snap = livePnl({
      realized: 1.5,
      positions: [lot],
      tickers: { ETHUSD: tick(2010) },
    });
    assert.equal(snap.profit, 1.6);
    assert.deepEqual(pnlRange([0, 2, -1], 1.6), { high: 2, low: -1 });
  });
});
