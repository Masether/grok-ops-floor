import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sellAllQty, shouldSweepDust } from "./dust.ts";

describe("shouldSweepDust", () => {
  it("does not dump a tradeable heat bag", () => {
    assert.equal(shouldSweepDust({ sleeve: "heat", notion: 32, minTicket: 12 }), false);
  });

  it("sweeps crumbs under the min ticket, any sleeve", () => {
    assert.equal(shouldSweepDust({ sleeve: "core", notion: 8, minTicket: 12 }), true);
    assert.equal(shouldSweepDust({ sleeve: "heat", notion: 8, minTicket: 12 }), true);
    assert.equal(shouldSweepDust({ sleeve: "core", notion: 27, minTicket: 12 }), false);
  });
});

describe("sellAllQty", () => {
  it("sells the full bag, not 99.9%", () => {
    assert.equal(sellAllQty(12.5, 1, 1), 12.5);
    assert.ok(sellAllQty(12.5, 1, 1) > 12.5 * 0.999);
  });

  it("floors to lot decimals and refuses below ordermin", () => {
    assert.equal(sellAllQty(50.9, 0, 50), 50);
    assert.equal(sellAllQty(0.4, 1, 1), 0);
  });
});
