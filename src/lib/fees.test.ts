import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  USD_TAKER,
  blendTaker,
  coversFees,
  edgeClearsFees,
  feeAwareStops,
  feeOn,
  learnTaker,
  minTakePct,
  netPnl,
  resolveLotEntry,
  closePnlFromCost,
  reconcileClosePnl,
  remainLotBasis,
} from "./fees.ts";

describe("fees", () => {
  it("a 0.8% Kraken cut on a $70 hop is not a win at 0.2% scalp take", () => {
    const taker = learnTaker(69.6, 0.5569);
    assert.ok(taker > 0.007 && taker < 0.009);
    const net = netPnl({ entry: 69.6 / 346.29, exit: 69.43 / 346.29, qty: 346.29, taker });
    assert.ok(net < 0);
    assert.ok(minTakePct(taker) > 0.016);
  });

  it("take sits above round-trip fee plus net pad (Tier-1 0.8%)", () => {
    const band = feeAwareStops(100, false, USD_TAKER);
    assert.ok(band.takePct >= 0.008 * 2 + 0.003 + 0.001);
    assert.equal(feeOn(100, USD_TAKER), 0.8);
    assert.equal(blendTaker(0.008, 0.006), 0.008 * 0.6 + 0.006 * 0.4);
    assert.equal(edgeClearsFees(0.02, USD_TAKER), true);
    assert.equal(edgeClearsFees(0.019, USD_TAKER), false);
  });

  it("refuses a take that would leave the wallet red after fees", () => {
    assert.equal(coversFees({ entry: 100, mark: 100.4, qty: 10, taker: USD_TAKER }), false);
    assert.equal(coversFees({ entry: 100, mark: 102.2, qty: 10, taker: USD_TAKER }), true);
  });
});

describe("resolveLotEntry + netPnl guards", () => {
  it("never books sale notional as profit when entry is missing", () => {
    assert.equal(resolveLotEntry({ entry: 0, qty: 2, costUsd: 40 }), 20);
    assert.equal(netPnl({ entry: 0, exit: 10, qty: 2, taker: 0.008 }), 0);
    const ok = netPnl({ entry: 20, exit: 21, qty: 1, taker: 0.008 });
    assert.ok(ok < 1 && ok > 0);
  });
});

describe("reconcileClosePnl", () => {
  it("matches netPnl with an explicit exit fee from Kraken", () => {
    const a = reconcileClosePnl({ entry: 100, exit: 102.5, qty: 1, taker: 0.008, exitFee: 0.82 });
    const b = netPnl({ entry: 100, exit: 102.5, qty: 1, taker: 0.008, exitFee: 0.82 });
    assert.equal(a, b);
    assert.ok(a < 2.5);
  });
});


describe("closePnlFromCost + remainLotBasis", () => {
  it("full close: exit proceeds minus costUsd (entry fee already in cost)", () => {
    // Bought $100 + $0.80 fee = costUsd 100.80; sell $110 exit fee $0.88
    const pnl = closePnlFromCost({
      costUsd: 100.8,
      lotQty: 1,
      sellQty: 1,
      entry: 100,
      exit: 110,
      lotFee: 0.8,
      exitFee: 0.88,
      taker: 0.008,
    });
    assert.ok(Math.abs(pnl - (110 - 0.88 - 100.8)) < 1e-9);
  });

  it("partial GRID out pro-rates cost so remaining open is not fake-red", () => {
    const lotQty = 2;
    const sellQty = 1;
    const costUsd = 201.6; // 2 * (100 + 0.8)
    const pnl = closePnlFromCost({
      costUsd,
      lotQty,
      sellQty,
      entry: 100,
      exit: 100,
      lotFee: 1.6,
      exitFee: 0.8,
      taker: 0.008,
    });
    // Flat exit: sell half cost 100.8, get 100 - 0.8 = 99.2 → pnl -1.6 (fees)
    assert.ok(pnl < 0);
    const remain = remainLotBasis({
      costUsd,
      fee: 1.6,
      entry: 100,
      lotQty,
      sellQty,
    });
    assert.ok(Math.abs(remain.costUsd - 100.8) < 1e-9);
    assert.ok(Math.abs(remain.fee - 0.8) < 1e-9);
    // Mark flat on remainder: unrealized = 100*1 - 100.8 = -0.8 (entry fee only), not -100+
    const open = 100 * 1 - remain.costUsd;
    assert.ok(Math.abs(open - -0.8) < 1e-9);
  });

  it("does not double-count entry fee when costUsd already includes it", () => {
    const withCost = closePnlFromCost({
      costUsd: 100.8,
      lotQty: 1,
      sellQty: 1,
      entry: 100,
      exit: 100,
      lotFee: 0.8,
      exitFee: 0.8,
      taker: 0.008,
    });
    // Wrong double-count would be ~-1.6 extra; correct is 100 - 0.8 - 100.8 = -1.6 total fees once
    assert.ok(Math.abs(withCost - -1.6) < 1e-9);
  });
});
