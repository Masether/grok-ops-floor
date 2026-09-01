import { toast } from "sonner";
import { money, px, qty } from "./format.ts";
import { PAIR_BY_ID } from "./kraken.ts";
import { useFloor } from "./store.ts";
import type { Order, Side, TradeMode } from "./types.ts";

export type TradeToastPriority = 1 | 2 | 3;
export type TradeToastTone = "danger" | "good" | "warn" | "info";

export type TradeToastInput = {
  priority: TradeToastPriority;
  title: string;
  detail?: string;
  tone: TradeToastTone;
  id?: string;
};

export const TRADE_TOAST_DURATION_MS: Record<TradeToastPriority, number> = {
  1: 8000,
  2: 6000,
  3: 4000,
};

export const TRADE_TOAST_DEDUPE_MS = 2000;
export const TRADE_TOAST_VISIBLE_CAP = 3;
/** P3 collapses once this many toasts are already up, or any P1 is showing. */
export const TRADE_TOAST_P3_BUSY = 2;

const TONE_COLOR: Record<TradeToastTone, string> = {
  danger: "var(--color-danger)",
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  info: "var(--color-info)",
};

type ActiveToast = {
  id: string | number;
  priority: TradeToastPriority;
  key: string;
};

const recent = new Map<string, number>();
const active: ActiveToast[] = [];
const pending: TradeToastInput[] = [];
let flushScheduled = false;

export function toastDedupeKey(input: Pick<TradeToastInput, "title" | "detail" | "id">): string {
  return input.id ?? `${input.title}\n${input.detail ?? ""}`;
}

export function shouldSkipDuplicate(
  lastAt: number | undefined,
  now: number,
  windowMs = TRADE_TOAST_DEDUPE_MS,
): boolean {
  return lastAt != null && now - lastAt < windowMs;
}

export function shouldDropP3(activeCount: number, hasP1: boolean): boolean {
  return hasP1 || activeCount >= TRADE_TOAST_P3_BUSY;
}

export function pickVictimForP1(
  rows: { id: string | number; priority: TradeToastPriority }[],
): string | number | null {
  const p3 = rows.find((r) => r.priority === 3);
  if (p3) return p3.id;
  if (rows.length >= TRADE_TOAST_VISIBLE_CAP) {
    const p2 = rows.find((r) => r.priority === 2);
    if (p2) return p2.id;
  }
  return null;
}

export function isStopReason(reason: string): boolean {
  return reason === "SL" || /(^|[^A-Za-z])SL([^A-Za-z]|$)/.test(reason);
}

export function isTakeReason(reason: string): boolean {
  return reason === "TP" || /(^|[^A-Za-z])TP([^A-Za-z]|$)/.test(reason);
}

export type FillToastKind = "live" | "stop" | "take" | "paper-buy" | "paper-sell";

export function classifyFillToast(order: {
  mode: TradeMode;
  side: Side;
  reason: string;
}): FillToastKind {
  if (order.mode === "live") return "live";
  if (isStopReason(order.reason)) return "stop";
  if (isTakeReason(order.reason)) return "take";
  return order.side === "buy" ? "paper-buy" : "paper-sell";
}

function pairBase(pair: Order["pair"]): string {
  return PAIR_BY_ID[pair]?.base ?? pair;
}

function qtyLabel(order: Pick<Order, "pair" | "qty">): string {
  const decimals = Math.min(PAIR_BY_ID[order.pair]?.decimals ?? 6, 6);
  return qty(order.qty, decimals);
}

export function describeFillToast(
  order: Pick<Order, "id" | "pair" | "side" | "qty" | "price" | "fillPrice" | "mode" | "reason">,
  pnl?: number,
): TradeToastInput {
  const kind = classifyFillToast(order);
  const base = pairBase(order.pair);
  const fill = order.fillPrice ?? order.price;
  const q = qtyLabel(order);
  const price = px(fill);
  const side = order.side.toUpperCase();
  const pnlText = pnl != null ? money(pnl) : undefined;
  const id = `fill-${order.id}`;

  if (kind === "live") {
    const exit = isStopReason(order.reason) ? "STOP" : isTakeReason(order.reason) ? "TAKE" : null;
    return {
      priority: 1,
      title: exit
        ? `LIVE ${exit} ${base}${pnlText ? ` · ${pnlText}` : ""}`
        : `LIVE FILL ${side} ${base} · ${q} @ ${price}`,
      detail: exit ? `${side} ${q} @ ${price}` : order.reason,
      tone: "danger",
      id,
    };
  }
  if (kind === "stop") {
    return {
      priority: 2,
      title: `STOP closed ${base} · ${pnlText ?? ""}`.replace(/ · $/, ""),
      detail: `${q} @ ${price}`,
      tone: "warn",
      id,
    };
  }
  if (kind === "take") {
    return {
      priority: 2,
      title: `TAKE closed ${base} · ${pnlText ?? ""}`.replace(/ · $/, ""),
      detail: `${q} @ ${price}`,
      tone: "good",
      id,
    };
  }
  return {
    priority: 3,
    title: `PAPER ${side} ${base} · ${q} @ ${price}`,
    detail: order.reason,
    tone: "info",
    id,
  };
}

function deskLaunched(): boolean {
  try {
    return Boolean(useFloor.getState().launched);
  } catch {
    return false;
  }
}

function pruneRecent(now: number) {
  for (const [key, ts] of recent) {
    if (now - ts > TRADE_TOAST_DEDUPE_MS * 4) recent.delete(key);
  }
}

function dropActive(id: string | number) {
  const i = active.findIndex((row) => row.id === id);
  if (i >= 0) active.splice(i, 1);
}

function toneStyle(tone: TradeToastTone): Record<string, string> {
  const color = TONE_COLOR[tone];
  return {
    background: "#12141e",
    color: "#e8edf5",
    border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
    borderLeft: `3px solid ${color}`,
  };
}

function showOne(input: TradeToastInput) {
  const key = toastDedupeKey(input);
  if (active.some((row) => row.key === key)) return;

  if (input.priority === 1 && active.length >= TRADE_TOAST_VISIBLE_CAP) {
    const victim = pickVictimForP1(active);
    if (victim != null) {
      toast.dismiss(victim);
      dropActive(victim);
    }
  }

  const duration = TRADE_TOAST_DURATION_MS[input.priority];
  const id = input.id ?? key;
  const payload = {
    id,
    description: input.detail,
    duration,
    style: toneStyle(input.tone),
    className: `trade-toast trade-toast-p${input.priority}`,
    closeButton: input.priority === 1,
    onAutoClose: () => dropActive(id),
    onDismiss: () => dropActive(id),
  };

  const shown =
    input.tone === "danger"
      ? toast.error(input.title, payload)
      : input.tone === "good"
        ? toast.success(input.title, payload)
        : input.tone === "warn"
          ? toast.warning(input.title, payload)
          : toast.message(input.title, payload);

  active.push({ id: shown, priority: input.priority, key });
}

function flushTradeToasts() {
  flushScheduled = false;
  const batch = pending.splice(0);
  batch.sort((a, b) => a.priority - b.priority);
  const batchHasP1 = batch.some((row) => row.priority === 1);
  for (const item of batch) {
    const hasP1 = batchHasP1 || active.some((row) => row.priority === 1);
    if (item.priority === 3 && shouldDropP3(active.length, hasP1)) continue;
    showOne(item);
  }
}

/** In-app popup for major trade events. No-op when the desk is not launched. */
export function pushTradeToast(input: TradeToastInput): void {
  if (typeof window === "undefined") return;
  if (!deskLaunched()) return;

  const now = Date.now();
  const key = toastDedupeKey(input);
  if (shouldSkipDuplicate(recent.get(key), now)) return;
  recent.set(key, now);
  pruneRecent(now);

  pending.push(input);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushTradeToasts);
}

export function toastOrderFill(
  order: Pick<Order, "id" | "pair" | "side" | "qty" | "price" | "fillPrice" | "mode" | "reason">,
  pnl?: number,
): void {
  pushTradeToast(describeFillToast(order, pnl));
}

export function toastLiveReject(order: Pick<Order, "pair" | "side">, detail: string): void {
  const base = pairBase(order.pair);
  pushTradeToast({
    priority: 1,
    title: `LIVE REJECT ${order.side.toUpperCase()} ${base}`,
    detail,
    tone: "danger",
    id: `live-reject-${order.pair}-${order.side}`,
  });
}

export function toastKillSwitch(): void {
  pushTradeToast({
    priority: 1,
    title: "KILL SWITCH",
    detail: "Floor halted — runner frozen",
    tone: "danger",
    id: "kill-switch",
  });
}

export function toastDailyLossHalt(): void {
  pushTradeToast({
    priority: 1,
    title: "DAILY LOSS HALT",
    detail: "Daily loss limit hit — runner is blocked",
    tone: "danger",
    id: "daily-loss-halt",
  });
}

export function toastVenueBlock(detail: string, title = "KRAKEN ERROR"): void {
  pushTradeToast({
    priority: 1,
    title,
    detail,
    tone: "danger",
    id: `venue-block-${title}`,
  });
}

export function toastSessionEnded(): void {
  pushTradeToast({
    priority: 2,
    title: "SESSION ENDED",
    detail: "Clock ran out — new entries stopped, book kept. Stops still watch open lots.",
    tone: "warn",
    id: "session-ended",
  });
}

/** Test-only: clear dedupe / queue state. */
export function resetTradeToastsForTests(): void {
  recent.clear();
  active.length = 0;
  pending.length = 0;
  flushScheduled = false;
}
