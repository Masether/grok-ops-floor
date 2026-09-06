import { utcDay } from "./persist-shift.ts";
import type { Order } from "./types.ts";

/** Closed P&L from filled sell legs (fee-aware pnl field when present). */
export function closedRealizedFromOrders(
  orders: Array<Pick<Order, "status" | "side" | "mode" | "pnl">>,
  live: boolean,
): number {
  let sum = 0;
  for (const o of orders) {
    if (o.status !== "filled" || o.side !== "sell") continue;
    if (live ? o.mode !== "live" : o.mode === "live") continue;
    if (typeof o.pnl === "number" && Number.isFinite(o.pnl)) sum += o.pnl;
  }
  return sum;
}

/**
 * Prefer the running store total; lift it if the blotter still has a larger closed sum
 * (e.g. store lagged). Never shrink just because old fills fell out of the 80-row cap.
 */
export function syncClosedRealized(storeRealized: number, fromOrders: number): number {
  const stored = Number.isFinite(storeRealized) ? storeRealized : 0;
  const blotter = Number.isFinite(fromOrders) ? fromOrders : 0;
  if (Math.abs(blotter) > Math.abs(stored) + 1e-9) return blotter;
  return stored;
}

/** True when dayStart looks like leftover paper capital on a live sleeve. */
export function isPaperDayLeak(dayStart: number, budget: number, equity: number): boolean {
  if (!(dayStart > 0)) return false;
  if (!(budget > 0) || !(equity > 0)) return dayStart > 5_000;
  return dayStart > budget * 3 && dayStart > equity * 2;
}

/**
 * dayStart stuck on the budget label ($200) while sleeve equity is elsewhere
 * and trading P&L is tiny — invents Day ≈ equity−budget (±$100 lies).
 */
export function isBudgetDayLeak(input: {
  dayStart: number;
  budget: number;
  equity: number;
  tradePnl?: number;
}): boolean {
  const start = input.dayStart;
  const budget = input.budget;
  const equity = input.equity;
  if (!(start > 0) || !(budget > 0) || !(equity > 0)) return false;
  if (Math.abs(start - budget) > 1) return false;
  const bookGap = Math.abs(equity - start);
  if (bookGap < 5) return false;
  const trade = Number.isFinite(input.tradePnl) ? Math.abs(input.tradePnl as number) : 0;
  return bookGap > trade + 5;
}

/**
 * Keep the same-day live baseline across re-arm / key re-paste.
 * Only seed from sleeve when missing, new UTC day, or paper leak.
 */
export function dayStartOnLiveArm(input: {
  dayStartEquity: number;
  shiftStartedAt: number;
  sleeveEquity: number;
  liveBudget: number;
  now?: number;
}): { dayStartEquity: number; shiftStartedAt: number } {
  const now = input.now ?? Date.now();
  const sleeve =
    input.sleeveEquity > 0 ? input.sleeveEquity : input.liveBudget > 0 ? input.liveBudget : 0;
  const sameDay =
    input.shiftStartedAt > 0 && utcDay(input.shiftStartedAt) === utcDay(now);
  const keep =
    sameDay &&
    input.dayStartEquity > 0 &&
    !isPaperDayLeak(input.dayStartEquity, input.liveBudget, sleeve || input.dayStartEquity) &&
    !isBudgetDayLeak({
      dayStart: input.dayStartEquity,
      budget: input.liveBudget,
      equity: sleeve || input.dayStartEquity,
      tradePnl: 0,
    });
  if (keep) {
    return {
      dayStartEquity: input.dayStartEquity,
      shiftStartedAt: input.shiftStartedAt,
    };
  }
  return {
    dayStartEquity: sleeve > 0 ? sleeve : input.dayStartEquity > 0 ? input.dayStartEquity : input.liveBudget,
    shiftStartedAt: sameDay && input.shiftStartedAt > 0 ? input.shiftStartedAt : now,
  };
}

/**
 * Live day base for meters: trust a real dayStart. Only snap to equity for paper leaks
 * (or missing start) so Day does not force to ~$0 on every thin wallet / re-arm.
 */
export function resolveLiveDayBase(input: {
  dayStart: number;
  budget: number;
  equity: number;
  openLots: number;
  tradePnl?: number;
}): number {
  const start = input.dayStart;
  if (!(start > 0)) {
    return input.equity > 0 ? input.equity : input.budget > 0 ? input.budget : 0;
  }
  if (isPaperDayLeak(start, input.budget, input.equity) && !(input.openLots > 0)) {
    return input.equity > 0 ? input.equity : start;
  }
  if (
    isBudgetDayLeak({
      dayStart: start,
      budget: input.budget,
      equity: input.equity,
      tradePnl: input.tradePnl,
    })
  ) {
    return input.equity > 0 ? input.equity : start;
  }
  return start;
}

/** Prefer the healthier book when cloud profile would wipe a local profit meter. */
export function mergeRemotePnlFields<T extends {
  realized: number;
  lifetimePnl?: number;
  dayStartEquity: number;
  lastEngineAt?: number;
  shiftStartedAt?: number;
  orders?: unknown[];
}>(local: T, remote: T): Pick<T, "realized" | "dayStartEquity"> & {
  lifetimePnl: number;
  shiftStartedAt: number;
  orders: T["orders"];
} {
  const localLife = typeof local.lifetimePnl === "number" ? local.lifetimePnl : 0;
  const remoteLife = typeof remote.lifetimePnl === "number" ? remote.lifetimePnl : localLife;
  const remoteEmpty =
    Math.abs(remote.realized) < 1e-9 &&
    Math.abs(remoteLife) < 1e-9 &&
    (!Array.isArray(remote.orders) || remote.orders.length === 0);
  const localHasBook =
    Math.abs(local.realized) > 1e-9 ||
    Math.abs(localLife) > 1e-9 ||
    (Array.isArray(local.orders) && local.orders.length > 0);
  if (remoteEmpty && localHasBook) {
    return {
      realized: local.realized,
      lifetimePnl: localLife,
      dayStartEquity: local.dayStartEquity,
      shiftStartedAt: local.shiftStartedAt ?? remote.shiftStartedAt ?? 0,
      orders: local.orders ?? remote.orders,
    };
  }
  return {
    realized: remote.realized,
    lifetimePnl: remoteLife,
    dayStartEquity: remote.dayStartEquity,
    shiftStartedAt: remote.shiftStartedAt ?? local.shiftStartedAt ?? 0,
    orders: Array.isArray(remote.orders) ? remote.orders : local.orders,
  };
}


/** Keep the richer P&L book when disk/rehydrate is stale or empty. */
export function preferRicherBook<T extends {
  realized?: number;
  lifetimePnl?: number;
  orders?: unknown[];
  lastEngineAt?: number;
  dayStartEquity?: number;
  equityHistory?: unknown[];
}>(disk: T, memory: T): T {
  const dEng = typeof disk.lastEngineAt === "number" ? disk.lastEngineAt : 0;
  const mEng = typeof memory.lastEngineAt === "number" ? memory.lastEngineAt : 0;
  if (mEng > dEng) return { ...disk, ...memory };
  if (dEng > mEng) return { ...memory, ...disk };

  const dOrders = Array.isArray(disk.orders) ? disk.orders.length : 0;
  const mOrders = Array.isArray(memory.orders) ? memory.orders.length : 0;
  const dReal = typeof disk.realized === "number" ? Math.abs(disk.realized) : 0;
  const mReal = typeof memory.realized === "number" ? Math.abs(memory.realized) : 0;
  const dLife = typeof disk.lifetimePnl === "number" ? Math.abs(disk.lifetimePnl) : 0;
  const mLife = typeof memory.lifetimePnl === "number" ? Math.abs(memory.lifetimePnl) : 0;

  const memoryRicher = mOrders > dOrders || mReal > dReal + 1e-9 || mLife > dLife + 1e-9;
  return memoryRicher ? { ...disk, ...memory } : { ...memory, ...disk };
}


/** True when the cloud book should replace local (richer lots/fills, or same richness and newer). */
export function shouldApplyRemoteBook(
  local: {
    lastEngineAt?: number;
    positions?: unknown[];
    orders?: unknown[];
    realized?: number;
  },
  remote: {
    lastEngineAt?: number;
    positions?: unknown[];
    orders?: unknown[];
    realized?: number;
  },
): boolean {
  const lPos = Array.isArray(local.positions) ? local.positions.length : 0;
  const rPos = Array.isArray(remote.positions) ? remote.positions.length : 0;
  const lOrd = Array.isArray(local.orders) ? local.orders.length : 0;
  const rOrd = Array.isArray(remote.orders) ? remote.orders.length : 0;
  const lReal = Math.abs(typeof local.realized === "number" ? local.realized : 0);
  const rReal = Math.abs(typeof remote.realized === "number" ? remote.realized : 0);
  const lEng = typeof local.lastEngineAt === "number" ? local.lastEngineAt : 0;
  const rEng = typeof remote.lastEngineAt === "number" ? remote.lastEngineAt : 0;

  const remoteEmpty = rPos === 0 && rOrd === 0 && rReal < 1e-9;
  const localHasBook = lPos > 0 || lOrd > 0 || lReal > 1e-9;
  // Empty/stale cloud must never wipe a phone journal on reopen.
  if (remoteEmpty && localHasBook) return false;

  const remoteRicher = rPos > lPos || rOrd > lOrd || rReal > lReal + 1e-9;
  const localRicher = lPos > rPos || lOrd > rOrd || lReal > rReal + 1e-9;
  if (remoteRicher && !localRicher) return true;
  if (localRicher && !remoteRicher) return false;
  // Same richness: allow remote if not older — heartbeat must not invent "newer" alone.
  return rEng >= lEng;
}

/** Prefer the non-empty journal side. Empty arrays never beat a live book. */
export function pickJournal<T>(disk: T[] | undefined, memory: T[] | undefined): T[] {
  const d = Array.isArray(disk) ? disk : [];
  const m = Array.isArray(memory) ? memory : [];
  if (d.length === 0 && m.length > 0) return m;
  if (m.length === 0 && d.length > 0) return d;
  return d.length >= m.length ? d : m;
}

