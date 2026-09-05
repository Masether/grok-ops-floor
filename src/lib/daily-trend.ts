import { ema } from "./indicators.ts";

/** Daily EMA 21/55 — Grok's capital gate. Long the trend, sit USD when it dies. */
export type DailyStance = "long" | "cash" | "chop";

export type DailyRead = {
  stance: DailyStance;
  note: string;
  allowBuy: boolean;
  allowScalp: boolean;
};

export function dailyStance(closes: number[]): DailyRead {
  if (closes.length < 60) {
    return {
      stance: "chop",
      note: "daily cold — not enough bars",
      allowBuy: true,
      allowScalp: false,
    };
  }
  const e21 = ema(closes, 21);
  const e55 = ema(closes, 55);
  const last = closes[closes.length - 1] ?? 0;
  const fast = e21[e21.length - 1] ?? 0;
  const slow = e55[e55.length - 1] ?? 0;
  if (fast > slow && last > slow) {
    return {
      stance: "long",
      note: "daily 21>55 — ride the trend",
      allowBuy: true,
      allowScalp: true,
    };
  }
  if (fast < slow && last < slow) {
    return {
      stance: "cash",
      note: "daily 21<55 — sit USD",
      allowBuy: false,
      allowScalp: false,
    };
  }
  return {
    stance: "chop",
    note: "daily chop — grid/DCA only",
    allowBuy: true,
    allowScalp: false,
  };
}
