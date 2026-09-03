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
  playbookWantsBuy,
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
    const reduce = gridManage({ entry: 100, mark: 100.7, stop, take, qty: 1 });
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
