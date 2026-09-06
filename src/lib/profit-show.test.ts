import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROFIT_SHOW_MS,
  profitShowBlocksBuys,
  profitShowHoldWhy,
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

  it("sticky hold blocks forever until Continue clears it", () => {
    const now = 1_000_000;
    const until = profitShowUntil(now);
    assert.equal(profitShowBlocksBuys(now + PROFIT_SHOW_MS + 1, until, false), false);
    assert.equal(profitShowBlocksBuys(now + PROFIT_SHOW_MS + 1, until, true), true);
    assert.equal(profitShowBlocksBuys(now, 0, true), true);
    assert.equal(profitShowSecsLeft(now, until, true), 0);
  });

  it("hold copy switches when sticky", () => {
    const now = 1_000_000;
    const until = profitShowUntil(now);
    assert.match(profitShowHoldWhy(now, until, false), /new buys in \d+s/);
    assert.match(profitShowHoldWhy(now, until, true), /Continue buy/);
  });
});
