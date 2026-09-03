import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mispricing, pricerQuiet } from "./pricer.ts";

describe("pricer", () => {
  it("stays quiet under 8% on heat", () => {
    assert.equal(pricerQuiet(0.07, "heat"), true);
    assert.equal(pricerQuiet(0.09, "heat"), false);
  });

  it("marks the gap", () => {
    assert.ok(Math.abs(mispricing(108, 100) - 0.08) < 1e-9);
  });
});
