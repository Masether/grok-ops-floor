import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closedRealizedFromOrders,
  dayStartOnLiveArm,
  isBudgetDayLeak,
  isPaperDayLeak,
  mergeRemotePnlFields,
  pickJournal,
  preferRicherBook,
  resolveLiveDayBase,
  shouldApplyRemoteBook,
  syncClosedRealized,
} from "./book-sync.ts";

describe("syncClosedRealized", () => {
  it("keeps store total when blotter truncated", () => {
    assert.equal(syncClosedRealized(5.25, 1.1), 5.25);
  });
  it("lifts store when blotter is ahead", () => {
    assert.equal(syncClosedRealized(1, 4.2), 4.2);
  });
});

describe("closedRealizedFromOrders", () => {
  it("sums live sell fills only", () => {
    const orders = [
      { status: "filled" as const, side: "sell" as const, mode: "live" as const, pnl: 2 },
      { status: "filled" as const, side: "buy" as const, mode: "live" as const, pnl: undefined },
      { status: "filled" as const, side: "sell" as const, mode: "live" as const, pnl: -0.5 },
    ];
    assert.equal(closedRealizedFromOrders(orders, true), 1.5);
    assert.equal(closedRealizedFromOrders(orders, false), 0);
  });
});

describe("resolveLiveDayBase", () => {
  it("trusts a same-session dayStart on a thin wallet", () => {
    assert.equal(
      resolveLiveDayBase({ dayStart: 26.7, budget: 200, equity: 28.1, openLots: 0 }),
      26.7,
    );
  });
  it("snaps paper $10k leak to live equity", () => {
    assert.equal(
      resolveLiveDayBase({ dayStart: 10_000, budget: 200, equity: 26.7, openLots: 0 }),
      26.7,
    );
  });
  it("keeps dayStart with open lots even if outside budget band", () => {
    assert.equal(
      resolveLiveDayBase({ dayStart: 195, budget: 200, equity: 210, openLots: 2 }),
      195,
    );
  });
});

describe("dayStartOnLiveArm", () => {
  const day = Date.UTC(2026, 8, 6, 12, 0, 0);
  it("keeps same-day baseline across re-arm", () => {
    const out = dayStartOnLiveArm({
      dayStartEquity: 195,
      shiftStartedAt: day - 3_600_000,
      sleeveEquity: 210,
      liveBudget: 200,
      now: day,
    });
    assert.equal(out.dayStartEquity, 195);
    assert.equal(out.shiftStartedAt, day - 3_600_000);
  });
  it("seeds from sleeve on first arm", () => {
    const out = dayStartOnLiveArm({
      dayStartEquity: 0,
      shiftStartedAt: 0,
      sleeveEquity: 200,
      liveBudget: 200,
      now: day,
    });
    assert.equal(out.dayStartEquity, 200);
    assert.equal(out.shiftStartedAt, day);
  });
  it("repairs paper leak on arm", () => {
    const out = dayStartOnLiveArm({
      dayStartEquity: 10_000,
      shiftStartedAt: day - 1_000,
      sleeveEquity: 180,
      liveBudget: 200,
      now: day,
    });
    assert.equal(out.dayStartEquity, 180);
  });
});

describe("mergeRemotePnlFields", () => {
  it("does not let an empty remote wipe a local book", () => {
    const out = mergeRemotePnlFields(
      {
        realized: 4.5,
        lifetimePnl: 12,
        dayStartEquity: 190,
        lastEngineAt: 100,
        shiftStartedAt: 50,
        orders: [{ id: "a" }],
      },
      {
        realized: 0,
        lifetimePnl: 0,
        dayStartEquity: 200,
        lastEngineAt: 200,
        shiftStartedAt: 60,
        orders: [],
      },
    );
    assert.equal(out.realized, 4.5);
    assert.equal(out.lifetimePnl, 12);
    assert.equal(out.dayStartEquity, 190);
    assert.equal((out.orders as { id: string }[]).length, 1);
  });
});

describe("isPaperDayLeak", () => {
  it("flags paper capital on a live sleeve", () => {
    assert.equal(isPaperDayLeak(10_000, 200, 26.7), true);
    assert.equal(isPaperDayLeak(195, 200, 210), false);
  });
});

describe("preferRicherBook", () => {
  it("keeps in-memory fills when disk is empty/stale", () => {
    const out = preferRicherBook(
      { realized: 0, lifetimePnl: 0, orders: [], lastEngineAt: 100 },
      { realized: 0.17, lifetimePnl: 0.17, orders: [{ id: "a" }, { id: "b" }], lastEngineAt: 200 },
    );
    assert.equal(out.realized, 0.17);
    assert.equal((out.orders as unknown[]).length, 2);
  });
});

describe("budget dayStart must not invent Day P&L", () => {
  it("flags $200 budget baseline vs $91 or $227 sleeve with flat trade", () => {
    assert.equal(
      isBudgetDayLeak({ dayStart: 200, budget: 200, equity: 91.94, tradePnl: 0.16 }),
      true,
    );
    assert.equal(
      isBudgetDayLeak({ dayStart: 200, budget: 200, equity: 227.85, tradePnl: -0.04 }),
      true,
    );
    assert.equal(
      isBudgetDayLeak({ dayStart: 200, budget: 200, equity: 200.1, tradePnl: 0.1 }),
      false,
    );
  });

  it("resolveLiveDayBase snaps off budget leak to sleeve equity", () => {
    assert.equal(
      resolveLiveDayBase({
        dayStart: 200,
        budget: 200,
        equity: 91.94,
        openLots: 4,
        tradePnl: 0.16,
      }),
      91.94,
    );
  });
});

describe("shouldApplyRemoteBook", () => {
  it("lets a richer older book win over a heartbeat-newer empty local", () => {
    assert.equal(
      shouldApplyRemoteBook(
        { lastEngineAt: 500, positions: [], orders: [], realized: 0 },
        { lastEngineAt: 100, positions: [{ id: "a" }, { id: "b" }], orders: [{ id: "o" }], realized: 0 },
      ),
      true,
    );
  });
  it("keeps a richer local when remote is thinner", () => {
    assert.equal(
      shouldApplyRemoteBook(
        { lastEngineAt: 200, positions: [{ id: "a" }], orders: [{ id: "o" }, { id: "p" }], realized: 1 },
        { lastEngineAt: 100, positions: [], orders: [], realized: 0 },
      ),
      false,
    );
  });
});

describe("pickJournal", () => {
  it("never lets an empty reopen wipe a filled blotter", () => {
    assert.deepEqual(pickJournal([], [{ id: "a" }]), [{ id: "a" }]);
    assert.deepEqual(pickJournal([{ id: "d" }, { id: "e" }], []), [{ id: "d" }, { id: "e" }]);
  });
});

describe("shouldApplyRemoteBook empty remote", () => {
  it("rejects an empty newer cloud book over a local journal", () => {
    assert.equal(
      shouldApplyRemoteBook(
        { lastEngineAt: 10, positions: [{ id: "p" }], orders: [{ id: "o" }], realized: 2 },
        { lastEngineAt: 9999, positions: [], orders: [], realized: 0 },
      ),
      false,
    );
  });
});
