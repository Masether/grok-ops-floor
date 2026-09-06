import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileLiveLotsWithWallet,
  shouldSkipBuyAlreadyHeld,
  walletHasTicket,
  walletQty,
} from "./wallet-sync.ts";
import type { Position } from "./types.ts";

function lot(partial: Partial<Position> & Pick<Position, "pair" | "qty" | "entry" | "mark">): Position {
  return {
    id: "p1",
    side: "buy",
    stop: 0,
    take: 0,
    openedAt: 1,
    mode: "live",
    ...partial,
  };
}

describe("wallet sync", () => {
  it("reads SOL qty from Kraken balance keys", () => {
    assert.ok(walletQty({ SOL: "0.194" }, "SOLUSD") > 0.19);
    assert.equal(walletHasTicket({ SOL: "0.194" }, "SOLUSD", 106, 12), true);
    assert.equal(walletHasTicket({ SOL: "0.01" }, "SOLUSD", 106, 12), false);
  });

  it("drops a local lot after a manual Kraken sell", () => {
    const r = reconcileLiveLotsWithWallet({
      positions: [lot({ pair: "SOLUSD", qty: 0.194, entry: 106, mark: 106 })],
      liveBalance: { ZUSD: "30" },
      tickers: { SOLUSD: { last: 106 } as never },
    });
    assert.equal(r.positions.length, 0);
    assert.deepEqual(r.dropped, ["SOLUSD"]);
  });

  it("adopts a Kraken holding as synced inventory (not sleeve budget)", () => {
    const r = reconcileLiveLotsWithWallet({
      positions: [],
      liveBalance: { ZUSD: "10", SOL: "0.2" },
      tickers: { SOLUSD: { last: 106 } as never },
      uid: (p) => `${p}-x`,
    });
    assert.equal(r.adopted.length, 1);
    assert.equal(r.positions[0]?.pair, "SOLUSD");
    assert.ok((r.positions[0]?.qty ?? 0) >= 0.2);
    assert.equal(r.positions[0]?.synced, true);
    assert.equal(r.positions[0]?.costUsd, 0);
  });

  it("skips a seed buy when Kraken already holds the coin", () => {
    const s = shouldSkipBuyAlreadyHeld({
      bal: { SOL: "0.2" },
      pair: "SOLUSD",
      mark: 106,
      hasLocalLot: false,
      playbook: "grid",
    });
    assert.equal(s.skip, true);
  });

  it("normalizes legacy wallet adopt so full costUsd no longer freezes the sleeve", () => {
    const r = reconcileLiveLotsWithWallet({
      positions: [
        lot({
          pair: "SOLUSD",
          qty: 0.2,
          entry: 106,
          mark: 106,
          note: "synced from Kraken wallet",
          costUsd: 21.2,
        }),
      ],
      liveBalance: { ZUSD: "80", SOL: "0.2" },
      tickers: { SOLUSD: { last: 106 } as never },
    });
    assert.equal(r.positions[0]?.synced, true);
    assert.equal(r.positions[0]?.costUsd, 0);
  });
});

describe("wallet sync BTC reserve", () => {
  it("drops an XBTUSD trading lot so it cannot invent open PnL", () => {
    const r = reconcileLiveLotsWithWallet({
      positions: [lot({ pair: "XBTUSD", qty: 0.00122, entry: 80_000, mark: 98_000 })],
      liveBalance: { ZUSD: "200", XXBT: "0.00122" },
      tickers: { XBTUSD: { last: 98_000 } as never },
    });
    assert.equal(r.positions.some((p) => p.pair === "XBTUSD"), false);
    assert.ok(r.dropped.includes("XBTUSD"));
  });
});
