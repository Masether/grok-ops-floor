/** Desk overlay math — display only. Does not change halt / size / live gates. */

export type DayAlertLevel = "ok" | "warn" | "alert" | "halt";

/** Day-loss used-of-cap thresholds (percent of maxDailyLoss). */
export const DAY_WARN_OF_HALT_PCT = 50;
export const DAY_ALERT_OF_HALT_PCT = 80;

/** Remaining distance to stop, as % of entry, that flashes the lot row. */
export const NEAR_STOP_PCT = 0.3;

/** `amount` as a percent of `capital`. 0 when capital is not usable. */
export function pctOfCapital(amount: number, capital: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(capital) || capital <= 0) return 0;
  return (amount / capital) * 100;
}

export function equityMultiple(equity: number, startingCash: number): number {
  if (!Number.isFinite(equity) || !Number.isFinite(startingCash) || startingCash <= 0) {
    return 1;
  }
  return equity / startingCash;
}

export function fillWinRatePct(wins: number, losses: number): number | null {
  const n = wins + losses;
  if (!(n > 0)) return null;
  return (wins / n) * 100;
}

/**
 * Day PnL vs the halt cap.
 * `haltBase` should be day-start equity (same base the engine uses).
 * `maxDailyLossPct` is a fraction (0.04 = 4%).
 */
export function dayLossAlert(input: {
  dayPnl: number;
  haltBase: number;
  maxDailyLossPct: number;
}): {
  level: DayAlertLevel;
  dayPnlPct: number;
  usedOfHaltPct: number;
} {
  const haltBase = Number.isFinite(input.haltBase) ? input.haltBase : 0;
  const capFrac = Number.isFinite(input.maxDailyLossPct) ? input.maxDailyLossPct : 0;
  const dayPnl = Number.isFinite(input.dayPnl) ? input.dayPnl : 0;
  const dayPnlPct = pctOfCapital(dayPnl, haltBase);
  const maxLoss = haltBase * capFrac;
  const loss = dayPnl < 0 ? -dayPnl : 0;
  const usedOfHaltPct = maxLoss > 0 ? (loss / maxLoss) * 100 : 0;

  let level: DayAlertLevel = "ok";
  if (maxLoss > 0 && dayPnl <= -maxLoss) level = "halt";
  else if (usedOfHaltPct >= DAY_ALERT_OF_HALT_PCT) level = "alert";
  else if (usedOfHaltPct >= DAY_WARN_OF_HALT_PCT) level = "warn";

  return { level, dayPnlPct, usedOfHaltPct };
}

export function lotMetrics(input: {
  entry: number;
  mark: number;
  stop: number;
  take: number;
  qty: number;
}): {
  pnl: number;
  fromEntryPct: number;
  distStopPct: number;
  distTakePct: number;
  nearStop: boolean;
  nearTake: boolean;
  underwater: boolean;
} {
  const entry = Number.isFinite(input.entry) ? input.entry : 0;
  const mark = Number.isFinite(input.mark) ? input.mark : 0;
  const stop = Number.isFinite(input.stop) ? input.stop : 0;
  const take = Number.isFinite(input.take) ? input.take : 0;
  const qty = Number.isFinite(input.qty) ? input.qty : 0;
  const pnl = (mark - entry) * qty;
  const fromEntryPct = pctOfCapital(mark - entry, entry);
  const distStopPct = pctOfCapital(mark - stop, entry);
  const distTakePct = pctOfCapital(take - mark, entry);
  return {
    pnl,
    fromEntryPct,
    distStopPct,
    distTakePct,
    nearStop: distStopPct <= NEAR_STOP_PCT,
    nearTake: distTakePct <= NEAR_STOP_PCT,
    underwater: pnl < 0,
  };
}

export type FillLeg = "in" | "out";

export function fillLeg(order: { side: string; reason: string }): FillLeg {
  const r = order.reason.toUpperCase();
  if (order.side === "sell" || /\b(TP|SL|FLAT|CLOSE)\b/.test(r)) return "out";
  return "in";
}

export function fillWhy(reason: string): string {
  const u = reason.toUpperCase();
  if (u.includes("TIME TP")) return "time take";
  if (u.includes("TIME SL")) return "time stop";
  if (u.includes("TP")) return "take profit";
  if (u.includes("SL")) return "stop loss";
  if (u.includes("CLOSE")) return "you closed";
  if (u.includes("MANUAL")) return "you";
  if (u.includes("DEMO")) return "demo";
  const cut = reason.split("·")[0]?.trim() ?? reason;
  return cut.slice(0, 28) || "fill";
}
