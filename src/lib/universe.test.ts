import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultTradeBook, pickHotBook } from "./universe.ts";

describe("defaultTradeBook", () => {
  it("lights core majors plus a small heat pocket", () => {
    const d = defaultTradeBook();
    assert.ok(d.includes("ETHUSD"));
    assert.ok(d.includes("SOLUSD"));
    assert.ok(d.includes("PEPEUSD"));
    assert.ok(!d.includes("XBTUSD"));
  });
});

describe("pickHotBook", () => {
  it("keeps majors when all lanes are on and tape is cold", () => {
    const d = pickHotBook({}, ["hot", "rising", "meme"]);
    assert.ok(d.includes("ETHUSD"));
    assert.ok(d.includes("SOLUSD"));
  });
});
