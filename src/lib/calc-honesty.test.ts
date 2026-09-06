import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sessionProfit } from "./desk-pnl.ts";
import { lotsMark } from "./live-pnl.ts";
import { liveSleeve } from "./live-budget.ts";
import { closePnlFromCost, remainLotBasis } from "./fees.ts";
import type { Position } from "./types.ts";

function lot(partial: Partial<Position> & Pick<Position, "qty" | "entry" | "mark">): Position {
  return {
    id: "p1",
    pair: "ETHUSD",
    side: "buy",
    stop: 0,
    take: 0,
    openedAt: 1,
    mode: "live",
    ...partial,
  };
}

describe("calc honesty identities", () => {
  it("Day = closed + open, never equity - budget", () => {
    const positions = [
      lot({ qty: 0.04, entry: 2500, mark: 2498, costUsd: 100.8 }),
    ];
    const marked = lotsMark(positions, { ETHUSD: { last: 2498 } as never });
    const realized = 0;
    const day = sessionProfit(realized, marked.unrealized);
    assert.equal(day, marked.unrealized);
    assert.notEqual(day, 153 - 200);
  });

  it("sleeve Free + In lots = Desk equity", () => {
    const positions = [
      lot({ qty: 0.04, entry: 2500, mark: 2500, costUsd: 100.8 }),
    ];
    const s = liveSleeve({
      liveBudget: 200,
      liveBalance: { ZUSD: "10.30" },
      positions,
      tickers: { ETHUSD: { last: 2500 } as never },
    });
    assert.ok(Math.abs(s.cash + s.deployed - s.equity) < 1e-9);
  });

  it("after half GRID out, remaining cost matches half basis", () => {
    const remain = remainLotBasis({
      costUsd: 201.6,
      fee: 1.6,
      entry: 100,
      lotQty: 2,
      sellQty: 1,
    });
    const marked = lotsMark(
      [lot({ qty: 1, entry: 100, mark: 100, costUsd: remain.costUsd, fee: remain.fee })],
      { ETHUSD: { last: 100 } as never },
    );
    assert.ok(Math.abs(marked.unrealized - -0.8) < 1e-6);
  });
});
