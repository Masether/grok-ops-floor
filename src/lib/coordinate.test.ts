import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runDebate } from "./coordinate.ts";
import { SOURCE_TOTAL, hitSources } from "./sources.ts";
import type { WireItem } from "./types.ts";

describe("sources catalog", () => {
  it("is 140+ connected desks", () => {
    assert.ok(SOURCE_TOTAL >= 140, `got ${SOURCE_TOTAL}`);
  });

  it("counts Kraken tape as live when a ticker is on", () => {
    const h = hitSources({
      hasTicker: true,
      wireTitles: [],
      wireSources: [],
      fearGreed: false,
      volSpike: false,
    });
    assert.ok(h.market >= 8);
    assert.equal(h.total, SOURCE_TOTAL);
  });
});

const bearWire: WireItem[] = [
  {
    id: "w1",
    title: "SEC charges exchange after exploit",
    source: "CoinDesk",
    url: "",
    ts: 1,
    tone: "bear",
    pairs: ["ETHUSD"],
    orgs: ["SEC"],
    kind: "news",
    note: "bear",
  },
];

describe("runDebate", () => {
  it("keeps the challenge instead of trusting the first buy", () => {
    const d = runDebate({
      pair: "ETHUSD",
      setupKind: "buy",
      setupNote: "PRICE BUY · RSI 58",
      priceScore: 0.28,
      liqScore: -0.2,
      arbScore: 0.1,
      riskScore: 0.2,
      flowOk: false,
      flowNote: "spread wide",
      veto: false,
      tickerOk: true,
      volumes: [1, 1, 1, 8],
      wire: bearWire,
      fearGreed: { value: 28, label: "Fear" },
    });
    const challenge = d.rounds.find((r) => r.role === "challenge");
    assert.equal(challenge?.kind, "sell");
    assert.equal(challenge?.kept, true);
    assert.ok(d.dissent);
    assert.equal(d.dissent?.kind, "sell");
    assert.ok(d.dissent!.bots >= 8);
    assert.equal(d.kind, "buy");
    assert.match(d.grok, /dissent kept/i);
    assert.match(d.rounds.find((r) => r.role === "data")!.note, /CONTRADICTION/);
  });

  it("can still merge a clean setup, with dissent on the tape", () => {
    const d = runDebate({
      pair: "XBTUSD",
      setupKind: "buy",
      setupNote: "PRICE BUY · RSI 55",
      priceScore: 0.72,
      liqScore: 0.5,
      arbScore: 0.4,
      riskScore: 0.4,
      flowOk: true,
      flowNote: "flow clean",
      veto: false,
      tickerOk: true,
      volumes: [2, 2, 2, 2],
      wire: [],
      fearGreed: { value: 55, label: "Neutral" },
    });
    assert.equal(d.kind, "buy");
    assert.ok(d.dissent);
    assert.equal(d.dissent?.kind, "sell");
    assert.match(d.grok, /dissent kept/i);
  });

  it("risk veto holds and still keeps the opposing ticket", () => {
    const d = runDebate({
      pair: "SOLUSD",
      setupKind: "buy",
      setupNote: "PRICE BUY",
      priceScore: 0.6,
      liqScore: 0.2,
      arbScore: 0.2,
      riskScore: -0.8,
      flowOk: true,
      flowNote: "flow clean",
      veto: true,
      tickerOk: true,
      volumes: [1, 1, 1],
      wire: [],
      fearGreed: null,
    });
    assert.equal(d.kind, "hold");
    assert.ok(d.dissent);
    assert.match(d.rounds.find((r) => r.role === "risk")!.note, /veto/i);
  });
});
