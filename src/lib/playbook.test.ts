import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DCA,
  GRID,
  asPlaybook,
  dcaManage,
  dcaStops,
  gridManage,
  gridStops,
  macdLane,
  pickPlaybook,
  playbookWantsBuy,
  type PlaybookId,
} from "./playbook.ts";

describe("asPlaybook", () => {
  it("only accepts scalp grid dca", () => {
    assert.equal(asPlaybook("grid"), "grid");
    assert.equal(asPlaybook("nope"), "scalp");
  });
});

describe("grid", () => {
  it("sets a wide band and reduces on a rung, not a scalp timer", () => {
    const { stop, take } = gridStops(100);
    assert.ok(stop < 97);
    assert.ok(take > 102);
    const hold = gridManage({ entry: 100, mark: 100.2, stop, take, qty: 1 });
    assert.equal(hold.action, "hold");
    const reduce = gridManage({ entry: 100, mark: 101.2, stop, take, qty: 10 });
    assert.equal(reduce.action, "reduce");
    assert.ok(reduce.sellFrac > 0 && reduce.sellFrac < 1);
    const dump = gridManage({ entry: 100, mark: stop - 0.01, stop, take, qty: 1 });
    assert.equal(dump.action, "stop");
  });

  it("wants a dip add inside the grid, not a chase", () => {
    assert.equal(
      playbookWantsBuy({
        playbook: "grid",
        kind: "hold",
        rsi: 44,
        changePct: -0.2,
        hasPos: false,
        dipFromEntry: 0,
        adds: 0,
        msSinceAdd: 0,
      }),
      true,
    );
    assert.equal(
      playbookWantsBuy({
        playbook: "grid",
        kind: "hold",
        rsi: 70,
        changePct: 2,
        hasPos: false,
        dipFromEntry: 0,
        adds: 0,
        msSinceAdd: 0,
      }),
      false,
    );
  });
});

describe("dca", () => {
  it("holds through scalp windows and only stops the hard band", () => {
    const { stop, take } = dcaStops(100);
    const r = dcaManage({ openedAt: 1, entry: 100, mark: 99.5, stop, take }, 1 + 5 * 60_000);
    assert.equal(r.action, "hold");
    const hit = dcaManage({ openedAt: 1, entry: 100, mark: take + 0.01, stop, take }, 1 + 60_000);
    assert.equal(hit.action, "take");
  });

  it("adds only after a dip and cooldown", () => {
    assert.equal(
      playbookWantsBuy({
        playbook: "dca",
        kind: "hold",
        rsi: 40,
        changePct: -1,
        hasPos: true,
        dipFromEntry: DCA.dipPct,
        adds: 1,
        msSinceAdd: DCA.cooldownMs,
      }),
      true,
    );
    assert.equal(
      playbookWantsBuy({
        playbook: "dca",
        kind: "hold",
        rsi: 40,
        changePct: -1,
        hasPos: true,
        dipFromEntry: DCA.dipPct,
        adds: 1,
        msSinceAdd: 1_000,
      }),
      false,
    );
    assert.ok(GRID.slicePct < 0.2);
  });
});

describe("macd lanes + all books together", () => {
  it("flips and trends", () => {
    assert.equal(macdLane(1, -1), "up");
    assert.equal(macdLane(-1, 1), "down");
    assert.equal(macdLane(0.5, 0.8), "chop");
  });

  it("routes MACD up to scalp, chop to grid, down to dca", () => {
    const base = {
      enabled: ["scalp", "grid", "dca"] as const,
      sleeve: "core" as const,
      kind: "buy" as const,
      rsi: 42,
      changePct: -0.3,
      hasPos: false,
      dipFromEntry: 0,
      adds: 0,
      msSinceAdd: 1e12,
    };
    assert.equal(pickPlaybook({ ...base, lane: "up", enabled: [...base.enabled] }), "scalp");
    assert.equal(pickPlaybook({ ...base, lane: "chop", kind: "hold", enabled: [...base.enabled] }), "grid");
    assert.equal(pickPlaybook({ ...base, lane: "down", kind: "hold", enabled: [...base.enabled] }), "dca");
  });

  it("tilts off a book the brain has retired", () => {
    const base = {
      enabled: ["scalp", "grid", "dca"] as PlaybookId[],
      sleeve: "core" as const,
      kind: "hold" as const,
      rsi: 42,
      changePct: -0.3,
      hasPos: false,
      dipFromEntry: 0,
      adds: 0,
      msSinceAdd: 1e12,
      lane: "chop" as const,
    };
    assert.equal(pickPlaybook({ ...base, bookScore: { grid: -6, dca: 2, scalp: 0 } }), "dca");
  });

  it("keeps heat on scalp only", () => {
    assert.equal(
      pickPlaybook({
        enabled: ["scalp", "grid", "dca"],
        sleeve: "heat",
        lane: "chop",
        kind: "buy",
        rsi: 40,
        changePct: 1,
        hasPos: false,
        dipFromEntry: 0,
        adds: 0,
        msSinceAdd: 0,
      }),
      "scalp",
    );
  });

  it("VWAP stretch tilts chop to grid; volume spike tilts up to scalp", () => {
    const chop = {
      enabled: ["scalp", "grid", "dca"] as PlaybookId[],
      sleeve: "core" as const,
      kind: "hold" as const,
      rsi: 42,
      changePct: -0.3,
      hasPos: false,
      dipFromEntry: 0,
      adds: 0,
      msSinceAdd: 1e12,
      lane: "chop" as const,
    };
    assert.equal(pickPlaybook({ ...chop, lens: "grid" }), "grid");
    assert.equal(
      pickPlaybook({
        ...chop,
        lane: "up",
        kind: "buy",
        lens: "scalp",
      }),
      "scalp",
    );
  });
});
