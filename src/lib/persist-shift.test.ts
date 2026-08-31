import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { EquityPoint, TradeSignal } from "./types.ts";
import {
  EQUITY_PERSIST_CAP,
  SIGNAL_PERSIST_CAP,
  hydratePersistedShift,
  markedEquityFromBook,
  sliceShiftForPersist,
  utcDay,
  type ShiftHydrateCurrent,
} from "./persist-shift.ts";

function point(i: number): EquityPoint {
  return {
    t: 1_000 + i,
    equity: 10_000 + i,
    cash: 10_000,
    unrealized: i,
    scanner: 0.2,
    signal: 0.3,
    risk: 0.1,
    runner: 0.4,
  };
}

function signal(i: number): TradeSignal {
  return {
    id: `sig_${i}`,
    pair: "XBTUSD",
    kind: "buy",
    confidence: 0.5,
    reason: "test",
    rsi: 40,
    emaFast: 1,
    emaSlow: 1,
    macdHist: 0,
    price: 80_000,
    ts: 1_000 + i,
  };
}

function current(over: Partial<ShiftHydrateCurrent> = {}): ShiftHydrateCurrent {
  return {
    cash: 10_000,
    positions: [],
    dayStartEquity: 10_000,
    shiftStartedAt: Date.UTC(2026, 7, 31, 12, 0, 0),
    equityHistory: [],
    signals: [],
    ...over,
  };
}

describe("utcDay", () => {
  it("formats a UTC calendar date", () => {
    assert.equal(utcDay(Date.UTC(2026, 7, 31, 23, 59, 0)), "2026-08-31");
    assert.equal(utcDay(Date.UTC(2026, 8, 1, 0, 0, 1)), "2026-09-01");
  });
});

describe("markedEquityFromBook", () => {
  it("uses last marks, preferring ticker last when present", () => {
    assert.equal(
      markedEquityFromBook({
        cash: 10_000,
        positions: [{ pair: "XBTUSD", qty: 0.1, mark: 50_000 }],
      }),
      15_000,
    );
    assert.equal(
      markedEquityFromBook({
        cash: 10_000,
        positions: [{ pair: "XBTUSD", qty: 0.1, mark: 50_000 }],
        tickers: { XBTUSD: { last: 51_000 } },
      }),
      15_100,
    );
  });
});

describe("sliceShiftForPersist", () => {
  it("caps equityHistory at 90, signals at 12, and forces liveArmed false", () => {
    const equityHistory = Array.from({ length: 100 }, (_, i) => point(i));
    const signals = Array.from({ length: 20 }, (_, i) => signal(i));
    const sliced = sliceShiftForPersist({ equityHistory, signals });
    assert.equal(sliced.equityHistory.length, EQUITY_PERSIST_CAP);
    assert.equal(sliced.equityHistory[0]?.t, point(10).t);
    assert.equal(sliced.signals.length, SIGNAL_PERSIST_CAP);
    assert.equal(sliced.signals[0]?.id, "sig_8");
    assert.equal(sliced.liveArmed, false);
  });
});

describe("hydratePersistedShift", () => {
  it("keeps dayStartEquity on the same UTC date", () => {
    const now = Date.UTC(2026, 7, 31, 18, 0, 0);
    const out = hydratePersistedShift(
      {
        cash: 12_000,
        dayStartEquity: 11_000,
        shiftStartedAt: Date.UTC(2026, 7, 31, 1, 0, 0),
        equityHistory: [point(1), point(2)],
        signals: [signal(1)],
        liveArmed: true,
      },
      current(),
      now,
    );
    assert.equal(out.dayStartEquity, 11_000);
    assert.equal(out.shiftStartedAt, Date.UTC(2026, 7, 31, 1, 0, 0));
    assert.equal(out.equityHistory.length, 2);
    assert.equal(out.signals.length, 1);
    assert.equal(out.liveArmed, false);
  });

  it("rolls dayStartEquity to marked equity when shiftStartedAt is a previous UTC date", () => {
    const now = Date.UTC(2026, 7, 31, 0, 1, 0);
    const out = hydratePersistedShift(
      {
        cash: 9_000,
        positions: [{ pair: "ETHUSD", qty: 2, mark: 2_500 }],
        dayStartEquity: 10_000,
        shiftStartedAt: Date.UTC(2026, 7, 30, 22, 0, 0),
        liveArmed: true,
      },
      current(),
      now,
    );
    assert.equal(out.dayStartEquity, 14_000);
    assert.equal(out.shiftStartedAt, now);
    assert.equal(out.liveArmed, false);
  });

  it("does not let a persisted liveArmed true survive merge", () => {
    const out = hydratePersistedShift(
      { liveArmed: true, cash: 10_000, shiftStartedAt: Date.UTC(2026, 7, 31, 8, 0, 0) },
      current(),
      Date.UTC(2026, 7, 31, 9, 0, 0),
    );
    assert.equal(out.liveArmed, false);
  });

  it("restores capped equityHistory and signals from persist", () => {
    const equityHistory = Array.from({ length: 95 }, (_, i) => point(i));
    const signals = Array.from({ length: 15 }, (_, i) => signal(i));
    const out = hydratePersistedShift(
      {
        cash: 10_000,
        shiftStartedAt: Date.UTC(2026, 7, 31, 8, 0, 0),
        equityHistory,
        signals,
      },
      current({ equityHistory: [], signals: [] }),
      Date.UTC(2026, 7, 31, 9, 0, 0),
    );
    assert.equal(out.equityHistory.length, 90);
    assert.equal(out.signals.length, 12);
  });
});
