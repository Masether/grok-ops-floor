import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LAUNCH_DEFAULTS,
  asFraction,
  clampLaunch,
  inferLaunched,
  launchPreviewLine,
  rejectWalletSecret,
  ticketNotional,
} from "./launch.mjs";

describe("asFraction", () => {
  it("treats values above 1 as percents", () => {
    assert.equal(asFraction(2, 0.02), 0.02);
    assert.equal(asFraction(1.5, 0.02), 0.015);
    assert.equal(asFraction(0.02, 0.01), 0.02);
  });
});

describe("clampLaunch", () => {
  it("defaults a blank payload", () => {
    const p = clampLaunch({});
    assert.equal(p.startingCash, 10_000);
    assert.equal(p.sizePct, 0.05);
    assert.equal(p.stopPct, 0.015);
    assert.equal(p.takePct, 0.025);
    assert.equal(p.maxDailyLossPct, 0.04);
    assert.equal(p.maxPositions, 5);
  });

  it("clamps percents and capital", () => {
    const p = clampLaunch({
      startingCash: 50,
      sizePct: 50,
      stopPct: 0,
      takePct: 99,
      maxDailyLossPct: 0.5,
      maxPositions: 99,
    });
    assert.equal(p.startingCash, 100);
    assert.equal(p.sizePct, 0.08);
    assert.equal(p.stopPct, 0.005);
    assert.equal(p.takePct, 0.08);
    assert.equal(p.maxDailyLossPct, 0.15);
    assert.equal(p.maxPositions, 6);
  });

  it("accepts percent-form inputs matching the launch card", () => {
    const p = clampLaunch({
      startingCash: 10_000,
      sizePct: 2,
      stopPct: 1.5,
      takePct: 2.5,
      maxDailyLossPct: 4,
      maxPositions: 5,
    });
    assert.equal(p.sizePct, 0.02);
    assert.equal(p.stopPct, 0.015);
    assert.equal(p.takePct, 0.025);
    assert.equal(p.maxDailyLossPct, 0.04);
  });
});

describe("ticketNotional", () => {
  it("is capital times sizePct", () => {
    assert.equal(ticketNotional(10_000, 0.02), 200);
    assert.equal(ticketNotional(10_000, 2), 200);
    assert.equal(ticketNotional(5000, LAUNCH_DEFAULTS.sizePct), 250);
  });
});

describe("launchPreviewLine", () => {
  it("matches the $10,000 book copy", () => {
    assert.equal(
      launchPreviewLine({
        startingCash: 10_000,
        sizePct: 0.02,
        stopPct: 0.015,
        takePct: 0.025,
      }),
      "A $10,000 book → ~$200 per ticket, stop 1.5%, take 2.5%. Paper. Can still lose.",
    );
  });
});

describe("inferLaunched", () => {
  it("respects an explicit launched flag", () => {
    assert.equal(inferLaunched({ launched: false, orders: [{}] }), false);
    assert.equal(inferLaunched({ launched: true, orders: [] }), true);
  });

  it("grandfathers a book that already has activity", () => {
    assert.equal(inferLaunched({ orders: [{ id: "1" }] }), true);
    assert.equal(inferLaunched({ positions: [{ id: "1" }] }), true);
    assert.equal(inferLaunched({ briefs: 3 }), true);
    assert.equal(inferLaunched({ orders: [], positions: [], briefs: 0 }), false);
    assert.equal(inferLaunched({}), false);
    assert.equal(inferLaunched(null), false);
  });
});

describe("rejectWalletSecret", () => {
  it("rejects seed phrases and hex private keys, allows API secrets", () => {
    const seed =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    assert.match(rejectWalletSecret(seed) ?? "", /seed phrase/);
    assert.match(
      rejectWalletSecret("0x" + "ab".repeat(32)) ?? "",
      /private keys/,
    );
    assert.equal(rejectWalletSecret("kR4k3n-api-key-looking-thing"), null);
    assert.equal(rejectWalletSecret(""), null);
  });
});
