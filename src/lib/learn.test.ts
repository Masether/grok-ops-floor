import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BRAIN,
  learnFromClose,
  pairMinConf,
  setupAllowed,
  type Brain,
} from "./learn.ts";

function fresh(over: Partial<Brain> = {}): Brain {
  return {
    ...DEFAULT_BRAIN,
    ...over,
    pairBias: { ...DEFAULT_BRAIN.pairBias, ...(over.pairBias ?? {}) },
    setupScore: { ...DEFAULT_BRAIN.setupScore, ...(over.setupScore ?? {}) },
    lessons: over.lessons ? over.lessons.slice() : [],
  };
}

describe("learnFromClose win", () => {
  it("widens RSI bands, lifts sizeTilt, and credits pairBias", () => {
    const next = learnFromClose(fresh(), {
      pair: "XBTUSD",
      pnl: 12.5,
      reason: "EMA cross",
    });
    assert.equal(next.samples, 1);
    assert.equal(next.wins, 1);
    assert.equal(next.losses, 0);
    assert.equal(next.streak, 1);
    assert.ok(next.rsiBuy < DEFAULT_BRAIN.rsiBuy);
    assert.ok(next.rsiSell > DEFAULT_BRAIN.rsiSell);
    assert.ok(next.sizeTilt > DEFAULT_BRAIN.sizeTilt);
    assert.ok(next.minConf < DEFAULT_BRAIN.minConf);
    assert.equal(next.pairBias.XBTUSD, 0.06);
    assert.equal(next.setupScore.cross, 1);
    assert.equal(next.lessons.length, 1);
    assert.equal(next.lessons[0]?.win, true);
    assert.equal(next.lessons[0]?.pair, "XBTUSD");
    assert.equal(next.lessons[0]?.pnl, 12.5);
    assert.match(next.lastNote, /kept XBTUSD/);
  });
});

describe("learnFromClose loss", () => {
  it("tightens RSI bands, cuts sizeTilt, and debits pairBias", () => {
    const next = learnFromClose(fresh(), {
      pair: "ETHUSD",
      pnl: -8.25,
      reason: "Oversold RSI fade",
    });
    assert.equal(next.samples, 1);
    assert.equal(next.wins, 0);
    assert.equal(next.losses, 1);
    assert.equal(next.streak, -1);
    assert.ok(next.rsiBuy > DEFAULT_BRAIN.rsiBuy);
    assert.ok(next.rsiSell < DEFAULT_BRAIN.rsiSell);
    assert.ok(next.sizeTilt < DEFAULT_BRAIN.sizeTilt);
    assert.ok(next.minConf > DEFAULT_BRAIN.minConf);
    assert.equal(next.pairBias.ETHUSD, -0.09);
    assert.ok(next.setupScore.rsi < 0);
    assert.equal(next.lessons[0]?.win, false);
    assert.match(next.lastNote, /cut ETHUSD/);
  });
});

describe("learnFromClose lessons cap", () => {
  it("keeps only the last 24 lessons", () => {
    let brain = fresh();
    for (let i = 0; i < 30; i++) {
      brain = learnFromClose(brain, {
        pair: "SOLUSD",
        pnl: i % 2 === 0 ? 1 : -1,
        reason: "momentum burst",
      });
    }
    assert.equal(brain.samples, 30);
    assert.equal(brain.lessons.length, 24);
    assert.equal(brain.lessons[0]?.pair, "SOLUSD");
  });

  it("does not learn when the brain is disabled", () => {
    const off = fresh({ enabled: false });
    const next = learnFromClose(off, { pair: "XBTUSD", pnl: 4, reason: "cross" });
    assert.equal(next, off);
    assert.equal(next.samples, 0);
    assert.equal(next.lessons.length, 0);
  });
});

describe("setupAllowed", () => {
  it("blocks a setup once setupScore is very negative", () => {
    assert.equal(setupAllowed(fresh(), "rsi"), true);
    assert.equal(
      setupAllowed(fresh({ setupScore: { cross: 0, rsi: -5, momentum: 0 } }), "rsi"),
      false,
    );
    assert.equal(
      setupAllowed(fresh({ setupScore: { cross: 0, rsi: -4.9, momentum: 0 } }), "rsi"),
      true,
    );
    assert.equal(setupAllowed(fresh(), "unknown"), true);

    let brain = fresh();
    for (let i = 0; i < 4; i++) {
      brain = learnFromClose(brain, {
        pair: "PEPEUSD",
        pnl: -3,
        reason: "Overbought RSI",
      });
    }
    assert.equal(setupAllowed(brain, "rsi"), false);
    assert.equal(setupAllowed(brain, "cross"), true);
    assert.equal(setupAllowed(brain, "unknown"), true);
  });
});

describe("pairMinConf", () => {
  it("eases confidence on a biased pair and clamps the floor", () => {
    const brain = fresh({
      minConf: 0.48,
      pairBias: { XBTUSD: 0.5, ETHUSD: -0.5 },
    });
    assert.ok(Math.abs(pairMinConf(brain, "XBTUSD") - (0.48 - 0.5 * 0.12)) < 1e-12);
    assert.ok(Math.abs(pairMinConf(brain, "ETHUSD") - (0.48 + 0.5 * 0.12)) < 1e-12);
    assert.equal(pairMinConf(brain, "SOLUSD"), 0.48);

    const tight = fresh({ minConf: 0.36, pairBias: { XBTUSD: 0.5 } });
    assert.equal(pairMinConf(tight, "XBTUSD"), 0.32);
  });
});
