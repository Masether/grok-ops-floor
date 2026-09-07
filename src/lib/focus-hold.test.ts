import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOLD_FOCUS_PAIRS,
  HOLD_FOCUS_RELEASE_BTC,
  defaultHoldFocus,
} from "./focus-hold.ts";

describe("hold focus", () => {
  it("defaults off with TAO and 82k release", () => {
    const d = defaultHoldFocus();
    assert.equal(d.on, false);
    assert.deepEqual(d.pairs, HOLD_FOCUS_PAIRS);
    assert.equal(d.releaseBtcUsd, HOLD_FOCUS_RELEASE_BTC);
    assert.equal(HOLD_FOCUS_RELEASE_BTC, 82_000);
    assert.ok(HOLD_FOCUS_PAIRS.includes("TAOUSD"));
  });
});
