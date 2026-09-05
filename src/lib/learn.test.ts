import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BRAIN,
  DESK_RULES,
  bookAllowed,
  hourQuiet,
  kindFromReason,
  learnFromClose,
  learnFromIndustry,
  learnFromMiss,
  pairBlocked,
  pairMinConf,
  setupAllowed,
  type Brain,
} from "./learn.ts";
import type { WireItem } from "./types.ts";

function fresh(over: Partial<Brain> = {}): Brain {
  return {
    ...DEFAULT_BRAIN,
    ...over,
    pairBias: { ...DEFAULT_BRAIN.pairBias, ...(over.pairBias ?? {}) },
    setupScore: { ...DEFAULT_BRAIN.setupScore, ...(over.setupScore ?? {}) },
    bookScore: { ...DEFAULT_BRAIN.bookScore, ...(over.bookScore ?? {}) },
    hourScore: over.hourScore ? over.hourScore.slice() : DEFAULT_BRAIN.hourScore.slice(),
    rejectCount: { ...DEFAULT_BRAIN.rejectCount, ...(over.rejectCount ?? {}) },
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

describe("brain books and hours", () => {
  it("credits the playbook and hour on a win, ignores dust", () => {
    const scalp = learnFromClose(fresh(), {
      pair: "ETHUSD",
      pnl: 0.4,
      reason: "SCALP clip",
      hour: 14,
    });
    assert.ok(scalp.bookScore.scalp > 0);
    assert.ok((scalp.hourScore[14] ?? 0) > 0);
    const dust = learnFromClose(fresh(), {
      pair: "BONKUSD",
      pnl: -0.2,
      reason: "DUST USD",
      hour: 3,
    });
    assert.equal(dust.samples, 0);
    assert.equal(dust.bookScore.scalp, 0);
  });

  it("retires a book and a dead hour after enough cuts", () => {
    let brain = fresh({ samples: 8 });
    for (let i = 0; i < 5; i++) {
      brain = learnFromClose(brain, {
        pair: "SOLUSD",
        pnl: -0.4,
        reason: "GRID add",
        hour: 3,
      });
    }
    assert.equal(bookAllowed(brain, "grid"), false);
    assert.equal(bookAllowed(brain, "scalp"), true);
    assert.equal(hourQuiet(brain, 3), true);
    assert.equal(hourQuiet(brain, 15), false);
  });

  it("journals rejects without counting them as fills, then retires the pair", () => {
    assert.equal(kindFromReason("KRAKEN REJECT EAPI:Invalid nonce"), "reject");
    assert.equal(kindFromReason("hard stop -$0.30"), "stop");
    let brain = fresh();
    for (let i = 0; i < 4; i++) {
      brain = learnFromMiss(brain, { pair: "SOLUSD", reason: "REJECT EAPI" });
    }
    assert.equal(brain.samples, 0);
    assert.equal(brain.rejectCount.SOLUSD, 4);
    assert.equal(pairBlocked(brain, "SOLUSD"), true);
    assert.equal(pairBlocked(brain, "ETHUSD"), false);
  });
});

describe("learnFromIndustry", () => {
  it("cuts scalp bookScore in chop/cash and bumps slightly on long+trend wire", () => {
    assert.match(DESK_RULES, /unpaid fees/i);
    const wire: WireItem[] = [
      {
        id: "w1",
        title: "BTC rips",
        source: "test",
        url: "https://example.com",
        ts: Date.now(),
        tone: "bull",
        pairs: ["XBTUSD"],
        orgs: [],
        kind: "trend",
        note: "trend",
      },
    ];
    const chop = learnFromIndustry(fresh(), { wire: [], fearGreed: { value: 50, label: "Neutral" }, dailyStance: "chop" });
    assert.ok(chop.bookScore.scalp < 0);
    assert.match(chop.lastNote, /chop/);

    const cash = learnFromIndustry(fresh(), { wire: [], fearGreed: { value: 12, label: "Extreme Fear" }, dailyStance: "cash" });
    assert.ok(cash.bookScore.scalp <= chop.bookScore.scalp);
    assert.ok(cash.sizeTilt < DEFAULT_BRAIN.sizeTilt);

    const long = learnFromIndustry(fresh(), { wire, fearGreed: { value: 55, label: "Neutral" }, dailyStance: "long" });
    assert.ok(long.bookScore.scalp > 0);
    assert.ok((long.pairBias.XBTUSD ?? 0) > 0);
    assert.match(long.lastNote, /long/);
  });

  it("learns harder from X social wire than plain news", () => {
    const mk = (kind: WireItem["kind"], source: string): WireItem => ({
      id: `x-${kind}-${source}`,
      title: "ETH surge on CT",
      source,
      url: "https://x.com/example/status/1",
      ts: Date.now(),
      tone: "bull",
      pairs: ["ETHUSD"],
      orgs: [],
      kind,
      note: "X tape",
    });
    const news = learnFromIndustry(fresh(), {
      wire: [mk("news", "Cointelegraph")],
      fearGreed: { value: 50, label: "Neutral" },
    });
    const social = learnFromIndustry(fresh(), {
      wire: [mk("social", "X"), mk("social", "X"), mk("social", "X")],
      fearGreed: { value: 50, label: "Neutral" },
    });
    assert.ok((social.pairBias.ETHUSD ?? 0) > (news.pairBias.ETHUSD ?? 0));
    assert.ok(social.bookScore.scalp > 0);
    assert.match(social.lastNote, /X /);
  });
});
