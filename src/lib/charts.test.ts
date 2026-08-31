import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_INDICATORS,
  DEFAULT_CHART_TYPE,
  asChartType,
  capChartDrawings,
  cycleIndicatorParams,
  indexOfTime,
  indicatorParamLabel,
  nextPreset,
  normalizeChartDrawings,
  normalizeChartIndicators,
} from "./charts.ts";

describe("asChartType", () => {
  it("accepts candles, bars, line and aliases", () => {
    assert.equal(asChartType("candles"), "candles");
    assert.equal(asChartType("bars"), "bars");
    assert.equal(asChartType("line"), "line");
    assert.equal(asChartType("candlestick"), "candles");
    assert.equal(asChartType("ohlc"), "bars");
    assert.equal(asChartType("nope"), DEFAULT_CHART_TYPE);
  });
});

describe("normalizeChartIndicators", () => {
  it("defaults EMA + RSI + Volume on", () => {
    const list = normalizeChartIndicators(undefined);
    const on = Object.fromEntries(list.map((x) => [x.id, x.on]));
    assert.equal(on.ema, true);
    assert.equal(on.rsi, true);
    assert.equal(on.volume, true);
    assert.equal(on.sma, false);
    assert.equal(on.macd, false);
    assert.equal(on.bb, false);
    assert.equal(on.stoch, false);
    assert.equal(list.find((x) => x.id === "ema")?.fast, 12);
    assert.equal(list.find((x) => x.id === "ema")?.slow, 26);
    assert.equal(list.find((x) => x.id === "rsi")?.period, 14);
  });

  it("merges persisted toggles and clamps periods", () => {
    const list = normalizeChartIndicators([
      { id: "sma", on: true, period: 999 },
      { id: "ema", on: false, fast: 9, slow: 21 },
      { id: "ghost", on: true },
    ]);
    assert.equal(list.length, DEFAULT_CHART_INDICATORS.length);
    assert.equal(list.find((x) => x.id === "sma")?.on, true);
    assert.equal(list.find((x) => x.id === "sma")?.period, 200);
    assert.equal(list.find((x) => x.id === "ema")?.on, false);
    assert.equal(list.find((x) => x.id === "ema")?.fast, 9);
    assert.equal(list.length, 7);
  });
});

describe("cycleIndicatorParams", () => {
  it("walks EMA 12/26 → 20/50 → 9/21", () => {
    const ema = DEFAULT_CHART_INDICATORS.find((x) => x.id === "ema")!;
    const a = { ...ema, ...cycleIndicatorParams(ema) };
    assert.deepEqual({ fast: a.fast, slow: a.slow }, { fast: 20, slow: 50 });
    const b = { ...a, ...cycleIndicatorParams(a) };
    assert.deepEqual({ fast: b.fast, slow: b.slow }, { fast: 9, slow: 21 });
    const c = { ...b, ...cycleIndicatorParams(b) };
    assert.deepEqual({ fast: c.fast, slow: c.slow }, { fast: 12, slow: 26 });
  });

  it("labels params", () => {
    const ema = DEFAULT_CHART_INDICATORS.find((x) => x.id === "ema")!;
    assert.equal(indicatorParamLabel(ema), "12/26");
    const rsi = DEFAULT_CHART_INDICATORS.find((x) => x.id === "rsi")!;
    assert.equal(indicatorParamLabel(rsi), "14");
  });
});

describe("nextPreset", () => {
  it("wraps around", () => {
    assert.equal(nextPreset(14, [7, 14, 21]), 21);
    assert.equal(nextPreset(21, [7, 14, 21]), 7);
    assert.equal(nextPreset(3, [7, 14, 21]), 7);
  });
});

describe("normalizeChartDrawings", () => {
  it("keeps valid hline/trend per known pair", () => {
    const out = normalizeChartDrawings({
      XBTUSD: [
        { id: "a", kind: "hline", price: 100 },
        { id: "b", kind: "trend", t1: 1, p1: 2, t2: 3, p2: 4 },
        { id: "bad" },
      ],
      NOPE: [{ id: "z", kind: "hline", price: 1 }],
    });
    assert.equal(out.XBTUSD?.length, 2);
    assert.equal(Object.keys(out).includes("NOPE"), false);
  });
});

describe("capChartDrawings", () => {
  it("keeps the last 40 per pair", () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({
      id: `h${i}`,
      kind: "hline" as const,
      price: i,
    }));
    const out = capChartDrawings({ XBTUSD: rows });
    assert.equal(out.XBTUSD?.length, 40);
    assert.equal(out.XBTUSD?.[0]?.id, "h5");
  });
});

describe("indexOfTime", () => {
  it("picks the nearest bar", () => {
    assert.equal(indexOfTime([100, 200, 300], 240), 1);
    assert.equal(indexOfTime([100, 200, 300], 10), 0);
  });
});
