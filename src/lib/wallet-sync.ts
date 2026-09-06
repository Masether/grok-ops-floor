/** Reconcile local live lots with Kraken Balance — buys, refresh, key re-arm, manual sells. */

import { getPair, isBtcUsd, PAIRS } from "./kraken.ts";
import { MIN_LIVE_TICKET, spotQty } from "./live-budget.ts";
import type { PairId, Position, Ticker } from "./types.ts";

/** Spot qty of a pair's base on the Kraken wallet. */
export function walletQty(
  bal: Record<string, string> | null | undefined,
  pair: PairId,
): number {
  const def = getPair(pair);
  if (!def || !bal) return 0;
  return spotQty(bal, def.base);
}

/** True when Kraken already holds a ticket-sized pile of this pair. */
export function walletHasTicket(
  bal: Record<string, string> | null | undefined,
  pair: PairId,
  mark: number,
  minUsd = MIN_LIVE_TICKET,
): boolean {
  if (!(mark > 0)) return false;
  const qty = walletQty(bal, pair);
  return qty * mark >= minUsd;
}

export type WalletReconcileResult = {
  positions: Position[];
  dropped: PairId[];
  adopted: PairId[];
  resized: PairId[];
};

/**
 * Drop lots Kraken no longer holds (manual sell / external flat).
 * Resize lots down to wallet qty. Adopt missing USD majors as synced inventory
 * (manage/sell only — does not consume sleeve cash or seed maxPositions).
 */
export function reconcileLiveLotsWithWallet(input: {
  positions: Position[];
  liveBalance: Record<string, string> | null | undefined;
  tickers?: Partial<Record<PairId, Ticker>>;
  now?: number;
  uid?: (prefix: string) => string;
}): WalletReconcileResult {
  const bal = input.liveBalance;
  const now = input.now ?? Date.now();
  const makeId = input.uid ?? ((p: string) => `${p}-${now}`);
  const dropped: PairId[] = [];
  const resized: PairId[] = [];
  const open = new Set<PairId>();

  const next: Position[] = [];
  for (const p of input.positions) {
    if (p.mode !== "live") {
      next.push(p);
      continue;
    }
    if (isBtcUsd(p.pair)) {
      next.push(p);
      open.add(p.pair);
      continue;
    }
    const def = getPair(p.pair);
    if (!def) {
      next.push(p);
      open.add(p.pair);
      continue;
    }
    const held = spotQty(bal, def.base);
    const mark = input.tickers?.[p.pair]?.last ?? p.mark;
    const dust = def.ordermin > 0 ? def.ordermin * 0.5 : 1e-8;
    // Manual sell / external flat — lot gone on Kraken.
    if (!(held > dust) || (mark > 0 && held * mark < 0.5)) {
      dropped.push(p.pair);
      continue;
    }
    open.add(p.pair);
    // Legacy wallet adopts booked full costUsd and froze the sleeve — normalize.
    const legacySynced =
      p.synced === true || p.note === "synced from Kraken wallet";
    const base = legacySynced ? { ...p, synced: true as const, costUsd: 0 } : p;
    if (held + 1e-12 < p.qty * 0.98) {
      const frac = held / p.qty;
      resized.push(p.pair);
      next.push({
        ...base,
        qty: held,
        costUsd: legacySynced
          ? 0
          : typeof base.costUsd === "number" && base.costUsd > 0
            ? base.costUsd * frac
            : base.entry * held,
        fee: typeof base.fee === "number" ? base.fee * frac : base.fee,
        mark,
      });
    } else {
      next.push({ ...base, mark });
    }
  }

  const adopted: PairId[] = [];
  if (bal) {
    for (const def of PAIRS) {
      if (isBtcUsd(def.id) || def.quote !== "USD") continue;
      if (open.has(def.id)) continue;
      const qty = spotQty(bal, def.base);
      const mark = input.tickers?.[def.id]?.last ?? 0;
      if (!(qty > 0) || !(mark > 0)) continue;
      if (qty * mark < MIN_LIVE_TICKET) continue;
      adopted.push(def.id);
      open.add(def.id);
      next.push({
        id: makeId("pos"),
        pair: def.id,
        side: "buy",
        qty,
        entry: mark,
        mark,
        stop: mark * 0.985,
        take: mark * 1.02,
        openedAt: now,
        mode: "live",
        note: "synced from Kraken wallet",
        synced: true,
        adds: 1,
        book: "grid",
        // External inventory — do not consume the $200 sleeve (cost counted 0 in liveSleeve).
        costUsd: 0,
        peakPnlUsd: 0,
      });
    }
  }

  return { positions: next, dropped, adopted, resized };
}

/** Should we skip a fresh seed buy because Kraken already holds this coin? */
export function shouldSkipBuyAlreadyHeld(input: {
  bal: Record<string, string> | null | undefined;
  pair: PairId;
  mark: number;
  hasLocalLot: boolean;
  playbook: "scalp" | "grid" | "dca";
}): { skip: boolean; why: string } {
  if (input.hasLocalLot) {
    // Adds still allowed by playbook — wallet check is for "already owned, no local lot".
    return { skip: false, why: "" };
  }
  if (isBtcUsd(input.pair)) {
    return { skip: true, why: "BTC is the reserve — not bought as a scalp" };
  }
  if (walletHasTicket(input.bal, input.pair, input.mark)) {
    return {
      skip: true,
      why: "already on Kraken — synced lot, no duplicate buy",
    };
  }
  return { skip: false, why: "" };
}

export { isSyncedLot } from "./live-budget.ts";
