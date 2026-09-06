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


  it("synced bags: Free + In lots (deployed) = Desk; synced add 0 open PnL", () => {
    const positions = [
      lot({
        qty: 0.2,
        entry: 106,
        mark: 110,
        pair: "SOLUSD",
        synced: true,
        note: "synced from Kraken wallet",
        costUsd: 0,
      }),
      lot({ qty: 0.04, entry: 2500, mark: 2500, costUsd: 100.8 }),
    ];
    const tickers = {
      SOLUSD: { last: 110 } as never,
      ETHUSD: { last: 2500 } as never,
    };
    const s = liveSleeve({
      liveBudget: 200,
      liveBalance: { ZUSD: "85" },
      positions,
      tickers,
    });
    const marked = lotsMark(positions, tickers);
    // Sleeve In lots excludes synced; desk exposure must use deployed (not marked.lots).
    assert.equal(s.deployed, 0.04 * 2500);
    assert.ok(marked.lots > s.deployed, "lotsMark still sees synced notion");
    assert.equal(marked.unrealized, 0.04 * 2500 - 100.8);
    assert.ok(Math.abs(s.cash + s.deployed - s.equity) < 1e-9);
    assert.ok(Math.abs(sessionProfit(0, marked.unrealized) - marked.unrealized) < 1e-9);
  });

  it("synced-only book invents no Day open PnL", () => {
    const positions = [
      lot({
        qty: 0.2,
        entry: 106,
        mark: 110,
        pair: "SOLUSD",
        synced: true,
        note: "synced from Kraken wallet",
        costUsd: 0,
      }),
    ];
    const marked = lotsMark(positions, { SOLUSD: { last: 110 } as never });
    assert.equal(marked.unrealized, 0);
    assert.equal(sessionProfit(0, marked.unrealized), 0);
    const s = liveSleeve({
      liveBudget: 200,
      liveBalance: { ZUSD: "85", SOL: "0.2" },
      positions,
      tickers: { SOLUSD: { last: 110 } as never },
    });
    assert.equal(s.cost, 0);
    assert.equal(s.deployed, 0);
    assert.equal(s.cash, 85);
    assert.equal(s.equity, 85);
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
