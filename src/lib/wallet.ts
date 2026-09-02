/** In-app bot wallet: sweep profits off the desk, convert, never send to a seed. */

import type { PairId } from "./types";

export const SWEEP_MIN = 0.5;
export const SEND_MIN_USD = 1;

export type VaultLot = {
  pair: PairId;
  qty: number;
  cost: number;
};

export type ExternalDest = "kraken" | "coinbase";

export function sweepableProfit(realized: number, sweptTotal: number, cash: number): number {
  const due = realized - sweptTotal;
  if (!(due > 0) || !(cash > 0)) return 0;
  const n = Math.min(due, cash);
  if (n < SWEEP_MIN) return 0;
  return Math.round(n * 100) / 100;
}

export function applyConvertUsd(
  fundingCash: number,
  vault: VaultLot[],
  pair: PairId,
  usd: number,
  price: number,
): { ok: true; fundingCash: number; vault: VaultLot[] } | { ok: false; reason: string } {
  const n = Math.round(usd * 100) / 100;
  if (!(n > 0) || !(price > 0)) return { ok: false, reason: "Enter an amount." };
  if (n > fundingCash + 1e-9) return { ok: false, reason: "Not enough in the bot wallet." };
  const qty = n / price;
  const lots = vault.slice();
  const i = lots.findIndex((l) => l.pair === pair);
  if (i >= 0) {
    const cur = lots[i]!;
    lots[i] = { pair, qty: cur.qty + qty, cost: cur.cost + n };
  } else {
    lots.push({ pair, qty, cost: n });
  }
  return { ok: true, fundingCash: fundingCash - n, vault: lots };
}

export function applyConvertCoin(
  fundingCash: number,
  vault: VaultLot[],
  pair: PairId,
  qty: number,
  price: number,
): { ok: true; fundingCash: number; vault: VaultLot[] } | { ok: false; reason: string } {
  if (!(qty > 0) || !(price > 0)) return { ok: false, reason: "Enter an amount." };
  const i = vault.findIndex((l) => l.pair === pair);
  const lot = i >= 0 ? vault[i] : null;
  if (!lot || qty > lot.qty + 1e-12) return { ok: false, reason: "Not enough of that coin in the wallet." };
  const usd = Math.round(qty * price * 100) / 100;
  const leftQty = lot.qty - qty;
  const lots = vault.slice();
  if (leftQty <= 1e-12) lots.splice(i, 1);
  else {
    const leftCost = lot.cost * (leftQty / lot.qty);
    lots[i] = { pair, qty: leftQty, cost: leftCost };
  }
  return { ok: true, fundingCash: fundingCash + usd, vault: lots };
}

export function applySendUsd(
  fundingCash: number,
  amount: number,
): { ok: true; fundingCash: number } | { ok: false; reason: string } {
  const n = Math.round(amount * 100) / 100;
  if (!(n >= SEND_MIN_USD)) return { ok: false, reason: "Minimum send is $1." };
  if (n > fundingCash + 1e-9) return { ok: false, reason: "Not enough USD in the bot wallet." };
  return { ok: true, fundingCash: Math.round((fundingCash - n) * 100) / 100 };
}

export function applySendCoin(
  vault: VaultLot[],
  pair: PairId,
  qty: number,
  price: number,
): { ok: true; vault: VaultLot[]; usd: number } | { ok: false; reason: string } {
  if (!(qty > 0) || !(price > 0)) return { ok: false, reason: "Enter an amount." };
  const i = vault.findIndex((l) => l.pair === pair);
  const lot = i >= 0 ? vault[i] : null;
  if (!lot || qty > lot.qty + 1e-12) return { ok: false, reason: "Not enough of that coin in the wallet." };
  const usd = Math.round(qty * price * 100) / 100;
  if (usd < SEND_MIN_USD) return { ok: false, reason: "Minimum send is $1." };
  const leftQty = lot.qty - qty;
  const lots = vault.slice();
  if (leftQty <= 1e-12) lots.splice(i, 1);
  else {
    const leftCost = lot.cost * (leftQty / lot.qty);
    lots[i] = { pair, qty: leftQty, cost: leftCost };
  }
  return { ok: true, vault: lots, usd };
}

export function vaultMark(vault: VaultLot[], last: Partial<Record<PairId, number>>): number {
  return vault.reduce((a, l) => a + (last[l.pair] ?? 0) * l.qty, 0);
}
