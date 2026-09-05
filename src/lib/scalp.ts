/** Heat: follow the spike. 15% of peak profit down → full close to USD. No half-sell. */

import { coversFees, minTakePct, netPnl, MIN_NET_USD, USD_TAKER } from "./fees.ts";

export const SCALP = {
  maxHoldMs: 3 * 60_000,
  growHoldMs: 20_000,
  deadMs: 12_000,
  fastTakeMs: 5_000,
  clipMs: 10_000,
  stopPct: 0.0035,
  takePct: 0.0105,
  heatStopPct: 0.012,
  heatTakePct: 0.04,
  trailArmPct: 0.0012,
  trailGapPct: 0.0018,
  growPct: 0.0006,
  cooldownMs: 8_000,
  minConf: 0.34,
  cutUsd: 0.3,
  hardCutUsd: 0.6,
  heatCutUsd: 0.3,
  heatDeadMs: 2 * 60_000,
  heatGiveback: 0.15,
  heatPeakMinUsd: 2,
} as const;

export type ScalpAction = "hold" | "stop" | "take" | "time";

export function scalpStops(entry: number, heat: boolean, taker = USD_TAKER): { stop: number; take: number } {
  const stopPct = heat ? SCALP.heatStopPct : SCALP.stopPct;
  const takePct = Math.max(heat ? SCALP.heatTakePct : SCALP.takePct, minTakePct(taker));
  return { stop: entry * (1 - stopPct), take: entry * (1 + takePct) };
}

export function scalpManage(
  p: {
    openedAt: number;
    entry: number;
    mark: number;
    stop: number;
    take: number;
    qty?: number;
    heat?: boolean;
    fading?: boolean;
    banked?: boolean;
    peakPnlUsd?: number;
    costUsd?: number;
  },
  now = Date.now(),
  taker = USD_TAKER,
): { action: ScalpAction; stop: number; sellFrac: number } {
  const age = now - p.openedAt;
  const pnlPct = p.entry > 0 ? (p.mark - p.entry) / p.entry : 0;
  const growing = pnlPct > SCALP.growPct;
  const need = minTakePct(taker);
  const qty = p.qty ?? 0;
  const netUsd = netPnl({ entry: p.entry, exit: p.mark, qty: Math.max(qty, 0), taker });
  const peak = Math.max(p.peakPnlUsd ?? netUsd, netUsd);
  const paid =
    coversFees({ entry: p.entry, mark: p.mark, qty, taker }) &&
    (qty > 0 ? netUsd >= MIN_NET_USD : true);
  const usd = qty > 0 ? (p.mark - p.entry) * qty : 0;
  const cut = p.heat ? SCALP.heatCutUsd : SCALP.cutUsd;
  let stop = p.stop;
  if (!p.heat) {
    if (pnlPct >= SCALP.trailArmPct) {
      stop = Math.max(stop, p.entry * 1.0002);
      stop = Math.max(stop, p.mark * (1 - SCALP.trailGapPct));
    }
    if (pnlPct >= need * 0.55) {
      stop = Math.max(stop, p.entry * (1 + need * 0.2));
    }
  } else if (peak >= SCALP.heatPeakMinUsd && qty > 0) {
    stop = Math.max(stop, p.entry + (peak * (1 - SCALP.heatGiveback)) / qty);
  }
  const out = (action: ScalpAction, sellFrac: number) => ({ action, stop, sellFrac });
  if (p.heat && p.fading) return out("stop", 1);
  if (qty > 0 && usd <= -SCALP.hardCutUsd) return out("stop", 1);
  if (qty > 0 && usd <= -cut) return out("stop", 1);
  if (p.heat && peak >= SCALP.heatPeakMinUsd && netUsd <= peak * (1 - SCALP.heatGiveback)) {
    return out(paid || netUsd > 0 ? "take" : "stop", 1);
  }
  if (p.mark <= stop) return out("stop", 1);
  if (p.heat) {
    if (age >= SCALP.heatDeadMs && pnlPct <= 0) return out("time", 1);
    return out("hold", 0);
  }
  if (p.mark >= p.take && paid) return out("take", 1);
  if (age >= SCALP.fastTakeMs && paid) return out("take", 1);
  if (age >= SCALP.maxHoldMs && paid) return out("take", 1);
  if (age >= SCALP.maxHoldMs && pnlPct <= 0) return out("time", 1);
  if (age >= SCALP.growHoldMs && !growing && pnlPct <= 0) return out("time", 1);
  if (age >= SCALP.deadMs && pnlPct <= 0) return out("time", 1);
  return out("hold", 0);
}
