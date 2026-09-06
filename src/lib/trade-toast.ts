import { type CSSProperties, type MouseEvent } from "react";
import { toast } from "sonner";
import { money, px, qty } from "./format.ts";
import { PAIR_BY_ID } from "./kraken.ts";
import { PROFIT_SHOW_MS } from "./profit-show.ts";
import { useFloor } from "./store.ts";
import type { Order, Side, TradeMode } from "./types.ts";

export type TradeToastPriority = 1 | 2 | 3;
export type TradeToastTone = "danger" | "good" | "warn" | "info";

export type TradeToastAction = {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

export type TradeToastInput = {
  priority: TradeToastPriority;
  title: string;
  detail?: string;
  tone: TradeToastTone;
  id?: string;
  /** Override priority default duration (use Infinity to stick). */
  durationMs?: number;
  action?: TradeToastAction;
  cancel?: TradeToastAction;
  /** Extra class on the toast (e.g. trade-toast-win). */
  className?: string;
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

export type FillToastKind = "live" | "stop" | "take";

export function classifyFillToast(order: {
  mode: TradeMode;
  side: Side;
  reason: string;
}): FillToastKind {
  // Live-only desk — every fill is a live toast.
  void order;
  return "live";
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

function actionBtnStyle(tone: TradeToastTone): CSSProperties {
  const color = TONE_COLOR[tone];
  return {
    background: `color-mix(in oklab, ${color} 22%, transparent)`,
    color,
    border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
    fontFamily: "var(--font-display)",
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    minHeight: 36,
    padding: "0 12px",
  };
}

function cancelBtnStyle(): CSSProperties {
  return {
    background: "rgba(255,255,255,0.08)",
    color: "#e8edf5",
    border: "1px solid rgba(255,255,255,0.14)",
    fontFamily: "var(--font-display)",
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    minHeight: 36,
    padding: "0 12px",
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

  const duration = input.durationMs ?? TRADE_TOAST_DURATION_MS[input.priority];
  const id = input.id ?? key;
  const payload: Parameters<typeof toast.message>[1] = {
    id,
    description: input.detail,
    duration,
    style: toneStyle(input.tone),
    className: `trade-toast trade-toast-p${input.priority}${input.className ? ` ${input.className}` : ""}`,
    closeButton: input.priority === 1,
    onAutoClose: () => dropActive(id),
    onDismiss: () => dropActive(id),
  };
  if (input.action) {
    payload.action = {
      label: input.action.label,
      onClick: input.action.onClick,
    };
    payload.actionButtonStyle = actionBtnStyle(input.tone);
  }
  if (input.cancel) {
    payload.cancel = {
      label: input.cancel.label,
      onClick: input.cancel.onClick,
    };
    payload.cancelButtonStyle = cancelBtnStyle();
  }

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

export function toastAwayReplay(awayMs: number, fills: number, pnl: number): void {
  const mins = Math.max(1, Math.round(awayMs / 60_000));
  pushTradeToast({
    priority: 2,
    title: `AWAY ${mins}m`,
    detail: fills
      ? `${fills} paper fills · ${money(pnl)}. Replay of the tape — not a background run.`
      : "Book kept. No paper fills in the gap.",
    tone: fills === 0 ? "info" : pnl >= 0 ? "good" : "warn",
    id: `away-${mins}`,
  });
}

export function toastOrderFill(
  order: Pick<Order, "id" | "pair" | "side" | "qty" | "price" | "fillPrice" | "mode" | "reason">,
  pnl?: number,
): void {
  pushTradeToast(describeFillToast(order, pnl));
}

export function toastSweep(amount: number): void {
  pushTradeToast({
    priority: 3,
    title: `SWEEP ${money(amount)}`,
    detail: "Profit parked in the bot wallet — convert or send out from Move money",
    tone: "good",
    id: `sweep-${Math.round(amount * 100)}`,
  });
}

function callReleaseProfitShowBuys() {
  void import("./engine-call.ts").then((m) => m.releaseProfitShowBuys());
}

function callHoldProfitShowForKrakenCheck() {
  void import("./engine-call.ts").then((m) => m.holdProfitShowForKrakenCheck());
}

function showStickyKrakenWin(amount: number, id: string) {
  const title = `YOU MADE ${money(amount)}`;
  const key = toastDedupeKey({ title, detail: "sticky", id });
  dropActive(id);
  const payload = {
    id,
    description: "Free USD refreshing — tap Continue buy when ready",
    duration: Number.POSITIVE_INFINITY,
    style: toneStyle("good"),
    className: "trade-toast trade-toast-p2 trade-toast-win",
    closeButton: false,
    dismissible: false,
    action: {
      label: "Continue buy",
      onClick: () => {
        callReleaseProfitShowBuys();
      },
    },
    actionButtonStyle: actionBtnStyle("good"),
    onAutoClose: () => dropActive(id),
    onDismiss: () => dropActive(id),
  };
  const shown = toast.success(title, payload);
  active.push({ id: shown, priority: 2, key });
}

/** Live win — make the USD hit obvious before the next buy. */
export function toastKrakenWin(amount: number): void {
  const id = `kraken-win-${Math.round(amount * 100)}-${Date.now() % 10_000}`;
  pushTradeToast({
    priority: 2,
    title: `YOU MADE ${money(amount)}`,
    detail: "After fees · sitting as USD on Kraken — Continue buy, or check Free USD first",
    tone: "good",
    id,
    durationMs: PROFIT_SHOW_MS,
    className: "trade-toast-win",
    action: {
      label: "Continue buy",
      onClick: () => {
        callReleaseProfitShowBuys();
      },
    },
    cancel: {
      label: "Check Kraken first",
      onClick: () => {
        callHoldProfitShowForKrakenCheck();
        // cancel always dismisses — re-show sticky Continue-only banner
        queueMicrotask(() => showStickyKrakenWin(amount, id));
      },
    },
  });
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
