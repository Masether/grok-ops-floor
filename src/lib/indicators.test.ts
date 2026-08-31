import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bollingerBands,
  ema,
  macdHistSeries,
  macdSeries,
  sma,
  smaSeries,
  stochasticSeries,
} from "./indicators.ts";

describe("smaSeries", () => {
  it("matches trailing sma at the last bar", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const series = smaSeries(values, 4);
    assert.equal(series.length, 10);
    assert.equal(series[9], sma(values, 4));
    assert.equal(series[3], (1 + 2 + 3 + 4) / 4);
  });
});

describe("bollingerBands", () => {
  it("centers on SMA and widens with k", () => {
    const values = [10, 11, 12, 11, 10, 13, 14, 13, 12, 15];
    const a = bollingerBands(values, 5, 2);
    const b = bollingerBands(values, 5, 1);
    const last = values.length - 1;
    assert.equal(a.mid[last], smaSeries(values, 5)[last]);
    assert.ok(a.upper[last]! > a.mid[last]!);
    assert.ok(a.lower[last]! < a.mid[last]!);
    assert.ok(a.upper[last]! - a.mid[last]! > b.upper[last]! - b.mid[last]!);
  });
});

describe("macdSeries", () => {
  it("hist matches the existing histogram helper", () => {
    const values = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 4);
    const full = macdSeries(values);
    const hist = macdHistSeries(values);
    assert.equal(full.hist.length, hist.length);
    for (let i = 0; i < hist.length; i++) {
      assert.ok(Math.abs(full.hist[i]! - hist[i]!) < 1e-9);
    }
  });
});

describe("stochasticSeries", () => {
  it("pins %K at 100 on a high close of the window", () => {
    const highs = [10, 11, 12, 13, 20];
    const lows = [8, 8, 9, 9, 10];
    const closes = [9, 10, 11, 12, 20];
    const { k, d } = stochasticSeries(highs, lows, closes, 5, 3);
    assert.equal(k[4], 100);
    assert.equal(d.length, 5);
  });
});

describe("ema", () => {
  it("reacts faster than SMA on a step", () => {
    const values = [10, 10, 10, 10, 10, 20];
    const e = ema(values, 3);
    const s = smaSeries(values, 3);
    assert.ok(e[5]! > s[5]!);
  });
});
