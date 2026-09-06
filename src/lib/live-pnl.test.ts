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
    assert.equal(Number(marked.unrealized.toFixed(4)), 0.1);
    const snap = livePnl({
      realized: 1.5,
      positions: [lot],
      tickers: { ETHUSD: tick(2010) },
    });
    assert.equal(Number(snap.profit.toFixed(4)), 1.6);
    assert.deepEqual(pnlRange([0, 2, -1], 1.6), { high: 2, low: -1 });
  });
});

describe("lotsMark fee basis", () => {
  it("counts entry fee in cost so a flat mark is not a fake loss", () => {
    const lot = {
      id: "p1",
      pair: "ETHUSD" as const,
      side: "buy" as const,
      qty: 0.01,
      entry: 2000,
      mark: 2000,
      stop: 0,
      take: 0,
      openedAt: 1,
      mode: "live" as const,
      costUsd: 20.16, // 20 notional + 0.16 fee
    };
    const marked = lotsMark([lot], { ETHUSD: { last: 2000 } as never });
    assert.ok(marked.unrealized < 0);
    assert.ok(marked.unrealized > -0.2);
    assert.equal(Number(marked.unrealized.toFixed(2)), -0.16);
  });
});
