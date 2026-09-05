import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  USD_TAKER,
  blendTaker,
  coversFees,
  feeAwareStops,
  feeOn,
  learnTaker,
  minTakePct,
  netPnl,
} from "./fees.ts";

describe("fees", () => {
  it("a 0.8% Kraken cut on a $70 hop is not a win at 0.2% scalp take", () => {
    const taker = learnTaker(69.6, 0.5569);
    assert.ok(taker > 0.007 && taker < 0.009);
    const net = netPnl({ entry: 69.6 / 346.29, exit: 69.43 / 346.29, qty: 346.29, taker });
    assert.ok(net < 0);
    assert.ok(minTakePct(taker) > 0.016);
  });

  it("take sits above round-trip fee plus a 0.3% net", () => {
    const band = feeAwareStops(100, false, USD_TAKER);
    assert.ok(band.takePct >= 0.004 * 2 + 0.003 + 0.001);
    assert.equal(feeOn(100, USD_TAKER), 0.4);
    assert.equal(blendTaker(0.004, 0.008), 0.004 * 0.6 + 0.008 * 0.4);
  });

  it("refuses a take that would leave the wallet red after fees", () => {
    assert.equal(coversFees({ entry: 100, mark: 100.4, qty: 10, taker: USD_TAKER }), false);
    assert.equal(coversFees({ entry: 100, mark: 101.2, qty: 10, taker: USD_TAKER }), true);
  });
});
