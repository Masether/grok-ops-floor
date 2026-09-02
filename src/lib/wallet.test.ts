import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyConvertCoin,
  applyConvertUsd,
  applySendCoin,
  applySendUsd,
  sweepableProfit,
} from "./wallet.ts";

describe("sweepableProfit", () => {
  it("sweeps only realized profit sitting as free cash", () => {
    assert.equal(sweepableProfit(40, 0, 100), 40);
    assert.equal(sweepableProfit(40, 0, 12), 12);
    assert.equal(sweepableProfit(40, 40, 100), 0);
    assert.equal(sweepableProfit(-8, 0, 100), 0);
    assert.equal(sweepableProfit(0.2, 0, 100), 0);
  });
});

describe("convert", () => {
  it("buys a coin from the bot wallet and sells it back", () => {
    const buy = applyConvertUsd(100, [], "XBTUSD", 50, 100_000);
    assert.equal(buy.ok, true);
    if (!buy.ok) return;
    assert.equal(buy.fundingCash, 50);
    assert.equal(buy.vault[0]?.qty, 0.0005);
    const sell = applyConvertCoin(buy.fundingCash, buy.vault, "XBTUSD", 0.0005, 110_000);
    assert.equal(sell.ok, true);
    if (!sell.ok) return;
    assert.equal(sell.fundingCash, 105);
    assert.equal(sell.vault.length, 0);
  });
});

describe("send out", () => {
  it("sends USD off the bot wallet to an external dest", () => {
    const res = applySendUsd(80, 25);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.fundingCash, 55);
  });

  it("refuses a send bigger than the wallet", () => {
    const res = applySendUsd(10, 25);
    assert.equal(res.ok, false);
  });

  it("sends a coin lot without converting back to USD", () => {
    const buy = applyConvertUsd(200, [], "XBTUSD", 100, 100_000);
    assert.equal(buy.ok, true);
    if (!buy.ok) return;
    const send = applySendCoin(buy.vault, "XBTUSD", 0.001, 100_000);
    assert.equal(send.ok, true);
    if (!send.ok) return;
    assert.equal(send.usd, 100);
    assert.equal(send.vault.length, 0);
  });
});
