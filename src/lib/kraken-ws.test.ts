import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asLiveCandle, mergeLiveCandle, ohlcTime } from "./kraken-ws.ts";

describe("mergeLiveCandle", () => {
  it("replaces the forming 1m bar and appends a new minute", () => {
    const a = { time: 1_000, open: 10, high: 11, low: 9, close: 10.5, volume: 2 };
    const b = { time: 1_000, open: 10, high: 12, low: 9, close: 11, volume: 3 };
    const c = { time: 61_000, open: 11, high: 11.2, low: 10.8, close: 11.1, volume: 1 };
    assert.equal(mergeLiveCandle([a], b)[0]?.close, 11);
    assert.equal(mergeLiveCandle([a], c).length, 2);
  });
});

describe("asLiveCandle", () => {
  it("reads interval_begin", () => {
    const t = ohlcTime({
      symbol: "ETH/USD",
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
      interval_begin: "2026-09-04T11:00:00.000Z",
    });
    assert.equal(t, Date.parse("2026-09-04T11:00:00.000Z"));
    const bar = asLiveCandle({
      symbol: "ETH/USD",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 4,
      interval_begin: "2026-09-04T11:00:00.000Z",
    });
    assert.equal(bar?.close, 11);
  });
});
