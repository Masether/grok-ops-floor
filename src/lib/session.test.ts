import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHART_INTERVAL,
  DEFAULT_SESSION_MINUTES,
  asChartInterval,
  chartIntervalLabel,
  normalizeSessionMinutes,
  sessionEnded,
  sessionEndsAtFromMinutes,
  sessionRemainingMs,
} from "./session.ts";

describe("sessionEndsAtFromMinutes", () => {
  it("returns null when minutes is 0 (until I stop)", () => {
    assert.equal(sessionEndsAtFromMinutes(0, 1_000), null);
  });

  it("adds minutes to now", () => {
    assert.equal(sessionEndsAtFromMinutes(15, 1_000), 1_000 + 15 * 60_000);
    assert.equal(sessionEndsAtFromMinutes(240, 0), 240 * 60_000);
  });
});

describe("sessionRemainingMs", () => {
  it("returns null when there is no end", () => {
    assert.equal(sessionRemainingMs(null, 5_000), null);
  });

  it("returns remaining milliseconds", () => {
    assert.equal(sessionRemainingMs(10_000, 4_000), 6_000);
  });

  it("clamps to 0 when already past", () => {
    assert.equal(sessionRemainingMs(1_000, 4_000), 0);
  });
});

describe("sessionEnded", () => {
  it("is false when no clock is set", () => {
    assert.equal(sessionEnded(null, 9_000), false);
  });

  it("is true at or after endsAt", () => {
    assert.equal(sessionEnded(5_000, 5_000), true);
    assert.equal(sessionEnded(5_000, 5_001), true);
  });

  it("is false before endsAt", () => {
    assert.equal(sessionEnded(5_000, 4_999), false);
  });
});

describe("normalizeSessionMinutes", () => {
  it("defaults garbage / negative to 24/7", () => {
    assert.equal(normalizeSessionMinutes(-1), DEFAULT_SESSION_MINUTES);
    assert.equal(normalizeSessionMinutes("nope"), DEFAULT_SESSION_MINUTES);
    assert.equal(DEFAULT_SESSION_MINUTES, 0);
  });

  it("keeps 0 and positive integers", () => {
    assert.equal(normalizeSessionMinutes(0), 0);
    assert.equal(normalizeSessionMinutes(60), 60);
  });
});

describe("asChartInterval", () => {
  it("accepts Kraken OHLC minutes and defaults otherwise", () => {
    assert.equal(asChartInterval(15), 15);
    assert.equal(asChartInterval(7), DEFAULT_CHART_INTERVAL);
    assert.equal(asChartInterval("60"), 60);
  });
});

describe("chartIntervalLabel", () => {
  it("labels minutes and hours", () => {
    assert.equal(chartIntervalLabel(1), "1m");
    assert.equal(chartIntervalLabel(240), "4h");
  });
});
