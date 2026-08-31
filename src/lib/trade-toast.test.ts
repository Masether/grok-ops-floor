import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TRADE_TOAST_DEDUPE_MS,
  TRADE_TOAST_DURATION_MS,
  classifyFillToast,
  describeFillToast,
  isStopReason,
  isTakeReason,
  pickVictimForP1,
  shouldDropP3,
  shouldSkipDuplicate,
  toastDedupeKey,
} from "./trade-toast.ts";

describe("trade toast priority durations", () => {
  it("keeps P1 longer than P2 longer than P3", () => {
    assert.equal(TRADE_TOAST_DURATION_MS[1], 8000);
    assert.equal(TRADE_TOAST_DURATION_MS[2], 6000);
    assert.equal(TRADE_TOAST_DURATION_MS[3], 4000);
  });
});

describe("classifyFillToast", () => {
  it("treats every live fill as P1 live, including SL/TP", () => {
    assert.equal(classifyFillToast({ mode: "live", side: "buy", reason: "EMA cross" }), "live");
    assert.equal(classifyFillToast({ mode: "live", side: "sell", reason: "SL" }), "live");
    assert.equal(classifyFillToast({ mode: "live", side: "sell", reason: "TP" }), "live");
  });

  it("splits paper SL / TP / flat closes", () => {
    assert.equal(classifyFillToast({ mode: "paper", side: "sell", reason: "SL" }), "stop");
    assert.equal(classifyFillToast({ mode: "paper", side: "sell", reason: "TP" }), "take");
    assert.equal(
      classifyFillToast({ mode: "paper", side: "buy", reason: "EMA cross" }),
      "paper-buy",
    );
    assert.equal(
      classifyFillToast({ mode: "paper", side: "sell", reason: "EMA cross" }),
      "paper-sell",
    );
  });
});

describe("SL/TP reason tokens", () => {
  it("matches bare SL/TP without eating other words", () => {
    assert.equal(isStopReason("SL"), true);
    assert.equal(isTakeReason("TP"), true);
    assert.equal(isStopReason("EMA cross"), false);
    assert.equal(isTakeReason("EMA cross"), false);
    assert.equal(isStopReason("SETUP"), false);
  });
});

describe("describeFillToast copy", () => {
  it("formats a paper buy like PAPER BUY BTC · qty @ price", () => {
    const t = describeFillToast({
      id: "ord_1",
      pair: "XBTUSD",
      side: "buy",
      qty: 0.01,
      price: 78120,
      fillPrice: 78120,
      mode: "paper",
      reason: "EMA cross",
    });
    assert.equal(t.priority, 3);
    assert.equal(t.tone, "info");
    assert.match(t.title, /PAPER BUY BTC/);
    assert.match(t.title, /0\.01/);
    assert.match(t.title, /78120/);
  });

  it("formats a stop close with PnL", () => {
    const t = describeFillToast(
      {
        id: "ord_2",
        pair: "ETHUSD",
        side: "sell",
        qty: 0.5,
        price: 2400,
        fillPrice: 2400,
        mode: "paper",
        reason: "SL",
      },
      -12.4,
    );
    assert.equal(t.priority, 2);
    assert.equal(t.tone, "warn");
    assert.match(t.title, /STOP closed ETH/);
    assert.match(t.title, /-\$12\.40/);
  });

  it("formats a take-profit close as P2 good", () => {
    const t = describeFillToast(
      {
        id: "ord_3",
        pair: "ETHUSD",
        side: "sell",
        qty: 0.4,
        price: 2500,
        fillPrice: 2500,
        mode: "paper",
        reason: "TP",
      },
      18,
    );
    assert.equal(t.priority, 2);
    assert.equal(t.tone, "good");
    assert.match(t.title, /TAKE closed ETH/);
  });

  it("formats a live fill as P1 danger", () => {
    const t = describeFillToast({
      id: "ord_4",
      pair: "XBTUSD",
      side: "buy",
      qty: 0.01,
      price: 78120,
      fillPrice: 78120,
      mode: "live",
      reason: "EMA cross",
    });
    assert.equal(t.priority, 1);
    assert.equal(t.tone, "danger");
    assert.match(t.title, /LIVE FILL BUY BTC/);
  });
});

describe("dedupe and queue", () => {
  it("skips identical toasts inside the 2s window", () => {
    assert.equal(shouldSkipDuplicate(1000, 2500), false);
    assert.equal(shouldSkipDuplicate(1000, 2999), true);
    assert.equal(shouldSkipDuplicate(1000, 3000), false);
    assert.equal(TRADE_TOAST_DEDUPE_MS, 2000);
  });

  it("collapses P3 when a P1 is up or the queue is busy", () => {
    assert.equal(shouldDropP3(0, false), false);
    assert.equal(shouldDropP3(1, false), false);
    assert.equal(shouldDropP3(2, false), true);
    assert.equal(shouldDropP3(0, true), true);
  });

  it("makes room for P1 by dropping a P3 first", () => {
    const victim = pickVictimForP1([
      { id: "a", priority: 2 },
      { id: "b", priority: 3 },
      { id: "c", priority: 1 },
    ]);
    assert.equal(victim, "b");
  });

  it("never dismisses a P1 to make room", () => {
    const victim = pickVictimForP1([
      { id: "a", priority: 1 },
      { id: "b", priority: 1 },
      { id: "c", priority: 1 },
    ]);
    assert.equal(victim, null);
  });

  it("uses a stable id as the dedupe key when provided", () => {
    assert.equal(
      toastDedupeKey({ title: "KILL SWITCH", detail: "x", id: "kill-switch" }),
      "kill-switch",
    );
  });
});
