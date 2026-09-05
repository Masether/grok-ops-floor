import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoBotReady } from "./auto-bot.ts";

const keys = { apiKey: "aaaaaaaa", apiSecret: "bbbbbbbbbbbbbbbb" };

describe("autoBotReady", () => {
  it("blocks until keys, auth, and USD are real", () => {
    assert.equal(
      autoBotReady({ launched: true, keys, keysOk: null, autoTrade: true, floorOpen: true, liveArmed: true, liveBalance: null }).ok,
      false,
    );
    assert.equal(
      autoBotReady({ launched: true, keys: { apiKey: "", apiSecret: "" }, keysOk: null, autoTrade: true, floorOpen: true, liveArmed: true, liveBalance: null }).ok,
      false,
    );
    assert.equal(
      autoBotReady({ launched: true, keys, keysOk: false, autoTrade: true, floorOpen: true, liveArmed: true, liveBalance: { ZUSD: "80" } }).ok,
      false,
    );
    assert.equal(
      autoBotReady({ launched: true, keys, keysOk: true, autoTrade: true, floorOpen: true, liveArmed: true, liveBalance: { ZUSD: "5" } }).ok,
      false,
    );
    assert.equal(
      autoBotReady({ launched: true, keys, keysOk: true, autoTrade: true, floorOpen: true, liveArmed: true, liveBalance: { ZUSD: "40" } }).ok,
      true,
    );
  });
});
