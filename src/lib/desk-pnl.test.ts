import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NEAR_STOP_PCT,
  bookDayPnl,
  bookTotal,
  dayLossAlert,
  equityMultiple,
  fillLeg,
  fillWhy,
  fillWinRatePct,
  haltCapUsd,
  lotMetrics,
  pctOfCapital,
  profitBarPct,
  sessionProfit,
} from "./desk-pnl.ts";

describe("pctOfCapital", () => {
  it("returns amount as percent of capital", () => {
    assert.equal(pctOfCapital(320, 10_000), 3.2);
    assert.equal(pctOfCapital(-320, 10_000), -3.2);
    assert.equal(pctOfCapital(0, 10_000), 0);
  });

  it("is 0 when capital is missing", () => {
    assert.equal(pctOfCapital(50, 0), 0);
    assert.equal(pctOfCapital(50, -1), 0);
    assert.equal(pctOfCapital(50, Number.NaN), 0);
  });
});

describe("bookDayPnl", () => {
  it("is equity minus day start", () => {
    assert.equal(bookDayPnl(200, 200), 0);
    assert.equal(bookDayPnl(212, 200), 12);
  });
});

describe("sessionProfit", () => {
  it("adds realized and open mark, and desk = cash + lots", () => {
    assert.equal(sessionProfit(8, 4), 12);
    assert.equal(sessionProfit(-3, 0), -3);
    assert.equal(bookTotal(180, 20), 200);
    assert.equal(profitBarPct(20, 200), 10);
    assert.equal(profitBarPct(-40, 200), -20);
  });
});

describe("equityMultiple", () => {
  it("is equity / starting cash", () => {
    assert.equal(equityMultiple(12_000, 10_000), 1.2);
    assert.equal(equityMultiple(8_000, 10_000), 0.8);
    assert.equal(equityMultiple(10_000, 10_000), 1);
  });

  it("defaults to 1x when starting cash is unusable", () => {
    assert.equal(equityMultiple(9_000, 0), 1);
  });
});

describe("fillWinRatePct", () => {
  it("is TP / (TP+SL)", () => {
    assert.equal(fillWinRatePct(3, 1), 75);
    assert.equal(fillWinRatePct(0, 2), 0);
  });

  it("is null with no TP/SL fills", () => {
    assert.equal(fillWinRatePct(0, 0), null);
  });
});

describe("dayLossAlert", () => {
  const cap = { haltBase: 10_000, maxDailyLossPct: 0.04 };

  it("is ok on profit and small losses", () => {
    assert.equal(dayLossAlert({ ...cap, dayPnl: 80 }).level, "ok");
    assert.equal(dayLossAlert({ ...cap, dayPnl: 0 }).level, "ok");
    assert.equal(dayLossAlert({ ...cap, dayPnl: -199 }).level, "ok");
  });

  it("warns at 50% of the daily halt cap", () => {
    const r = dayLossAlert({ ...cap, dayPnl: -200 });
    assert.equal(r.level, "warn");
    assert.equal(r.dayPnlPct, -2);
    assert.equal(r.usedOfHaltPct, 50);
  });

  it("alerts at 80% of halt (day loss 3.2% on a 4% cap)", () => {
    const r = dayLossAlert({ ...cap, dayPnl: -320 });
    assert.equal(r.level, "alert");
    assert.equal(r.dayPnlPct, -3.2);
    assert.equal(r.usedOfHaltPct, 80);
  });

  it("is halt at or over the cap", () => {
    assert.equal(dayLossAlert({ ...cap, dayPnl: -400 }).level, "halt");
    assert.equal(dayLossAlert({ ...cap, dayPnl: -401 }).level, "halt");
    assert.equal(dayLossAlert({ ...cap, dayPnl: -400 }).usedOfHaltPct, 100);
  });

  it("stays ok when the cap is unset", () => {
    assert.equal(dayLossAlert({ dayPnl: -500, haltBase: 10_000, maxDailyLossPct: 0 }).level, "ok");
  });

  it("does not treat a $100 book sitting in cash as a 100% loss", () => {
    const dayPnl = bookDayPnl(100, 100);
    assert.equal(dayPnl, 0);
    const r = dayLossAlert({
      dayPnl,
      haltBase: 100,
      maxDailyLossPct: 0.04,
      minHaltUsd: 40,
    });
    assert.equal(r.level, "ok");
    assert.equal(r.dayPnlPct, 0);
  });

  it("does not halt a scalp stop under the $40 live floor", () => {
    const r = dayLossAlert({
      dayPnl: -12,
      haltBase: 200,
      maxDailyLossPct: 0.04,
      minHaltUsd: 40,
    });
    assert.equal(r.level, "ok");
    assert.equal(haltCapUsd(200, 0.04, 40), 40);
  });
});

describe("lotMetrics", () => {
  it("marks underwater lots red-path and computes % from entry", () => {
    const m = lotMetrics({ entry: 100, mark: 99, stop: 98.5, take: 102.5, qty: 2 });
    assert.equal(m.pnl, -2);
    assert.equal(m.fromEntryPct, -1);
    assert.equal(m.underwater, true);
    assert.equal(m.nearStop, false);
  });

  it(`flashes when remaining stop distance is <= ${NEAR_STOP_PCT}% of entry`, () => {
    const m = lotMetrics({ entry: 1000, mark: 997, stop: 994, take: 1025, qty: 1 });
    assert.equal(m.distStopPct, 0.3);
    assert.equal(m.nearStop, true);
  });

  it("is near take when mark is within 0.3% of TP", () => {
    const m = lotMetrics({ entry: 100, mark: 102.3, stop: 98.5, take: 102.5, qty: 1 });
    assert.ok(m.distTakePct <= NEAR_STOP_PCT);
    assert.equal(m.nearTake, true);
    assert.equal(m.underwater, false);
  });
});

describe("fillLeg / fillWhy", () => {
  it("buy is IN, sell is OUT", () => {
    assert.equal(fillLeg({ side: "buy", reason: "rsi cross" }), "in");
    assert.equal(fillLeg({ side: "sell", reason: "SL" }), "out");
  });

  it("labels the exit", () => {
    assert.equal(fillWhy("TIME TP"), "time take");
    assert.equal(fillWhy("SL"), "stop loss");
    assert.equal(fillWhy("manual ticket"), "you");
    assert.equal(fillWhy("CLOSE"), "you closed");
    assert.equal(fillLeg({ side: "sell", reason: "CLOSE" }), "out");
  });
});
