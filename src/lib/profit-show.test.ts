import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROFIT_SHOW_MS,
  profitShowBlocksBuys,
  profitShowSecsLeft,
  profitShowUntil,
} from "./profit-show.ts";

describe("profitShow", () => {
  it("blocks buys only while the look window is open", () => {
    const now = 1_000_000;
    const until = profitShowUntil(now, 75_000);
    assert.equal(until, now + 75_000);
    assert.equal(profitShowBlocksBuys(now, until), true);
    assert.equal(profitShowBlocksBuys(until, until), false);
    assert.equal(profitShowBlocksBuys(until + 1, until), false);
    assert.equal(PROFIT_SHOW_MS, 75_000);
  });

  it("reports whole seconds left", () => {
    assert.equal(profitShowSecsLeft(1000, 3500), 3);
    assert.equal(profitShowSecsLeft(3500, 3500), 0);
  });
});
