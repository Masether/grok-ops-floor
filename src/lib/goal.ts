/**
 * Goal planner: money target + deadline → ticket size / risk levels.
 * Pure helper. Never promises the goal will be hit. Does not arm live.
 */

import { clampLaunch, ticketNotional } from "./launch.mjs";
import { DEFAULT_SESSION_MINUTES } from "./session";

export type Feasibility = "easy" | "stretch" | "unrealistic";
export type GoalLevelId = "steady" | "balanced" | "push";

export type GoalLevel = {
  id: GoalLevelId;
  label: string;
  sizePct: number;
  stopPct: number;
  takePct: number;
  maxDailyLossPct: number;
  maxPositions: number;
  ticketUsd: number;
  note: string;
  feasibility: Feasibility;
  requiredDailyPct: number;
};

export type GoalPlan = {
  capital: number;
  goalProfit: number;
  days: number;
  requiredReturn: number;
  simpleDaily: number;
  requiredDailyPct: number;
  suggestedSessionMinutes: number;
  recommended: GoalLevelId;
  recommendNote: string;
  wild: boolean;
  levels: GoalLevel[];
  needLine: string;
};

export const GOAL_DEFAULTS = {
  goalProfit: 10_000,
  days: 7,
  capital: 10_000,
  level: "balanced" as GoalLevelId,
};

/** Preset profit targets (USD). Custom field accepts any other amount. */
export const GOAL_PRESETS = [1_000, 5_000, 10_000, 20_000, 50_000, 100_000] as const;

/** Preset deadlines. Custom field accepts any other day count >= 1. */
export const DAY_PRESETS = [7, 14, 30] as const;

export const GOAL_BOUNDS = {
  goalProfit: { min: 1, max: 10_000_000 },
  days: { min: 1, max: 365 },
};

/** requiredReturn / day under this → easy */
export const EASY_DAILY = 0.01;
/** requiredReturn / day under this → stretch; at or above → unrealistic */
export const STRETCH_DAILY = 0.04;

const TRADING_DAY_MINUTES = 8 * 60;
const CALENDAR_DAY_MINUTES = 24 * 60;

type LevelTemplate = {
  id: GoalLevelId;
  label: string;
  sizeMin: number;
  sizeMax: number;
  stopPct: number;
  takePct: number;
  maxDailyLossPct: number;
  maxPositions: number;
};

const LEVEL_TEMPLATES: LevelTemplate[] = [
  {
    id: "steady",
    label: "Steady",
    sizeMin: 0.01,
    sizeMax: 0.02,
    stopPct: 0.008,
    takePct: 0.012,
    maxDailyLossPct: 0.02,
    maxPositions: 3,
  },
  {
    id: "balanced",
    label: "Balanced",
    sizeMin: 0.02,
    sizeMax: 0.02,
    stopPct: 0.015,
    takePct: 0.025,
    maxDailyLossPct: 0.04,
    maxPositions: 5,
  },
  {
    id: "push",
    label: "Push",
    sizeMin: 0.05,
    sizeMax: 0.08,
    stopPct: 0.025,
    takePct: 0.06,
    maxDailyLossPct: 0.08,
    maxPositions: 6,
  },
];

const RECOMMEND_ORDER: GoalLevelId[] = ["balanced", "steady", "push"];

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeGoalProfit(n: unknown): number {
  const v = Math.round(Number(n));
  return clamp(v, GOAL_BOUNDS.goalProfit.min, GOAL_BOUNDS.goalProfit.max);
}

export function normalizeGoalDays(n: unknown): number {
  const v = Math.round(Number(n));
  return clamp(v, GOAL_BOUNDS.days.min, GOAL_BOUNDS.days.max);
}

export function asGoalLevel(value: unknown): GoalLevelId {
  if (value === "steady" || value === "balanced" || value === "push") return value;
  return GOAL_DEFAULTS.level;
}

export function isGoalPreset(n: number): boolean {
  return (GOAL_PRESETS as readonly number[]).includes(n);
}

export function isDayPreset(n: number): boolean {
  return (DAY_PRESETS as readonly number[]).includes(n);
}

/** Compact USD for chips / copy: $10k, $1.5k, $200, $1M. */
export function fmtGoalUsd(n: number): string {
  const abs = Math.abs(Math.round(Number(n) || 0));
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const s = m % 1 === 0 ? m.toFixed(0) : m.toFixed(1);
    return `${sign}$${s}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const s = k % 1 === 0 ? k.toFixed(0) : k.toFixed(1);
    return `${sign}$${s}k`;
  }
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function fmtDailyPct(fraction: number): string {
  const n = fraction * 100;
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function lerpSize(simpleDaily: number, min: number, max: number): number {
  const t = clamp(simpleDaily / STRETCH_DAILY, 0, 1);
  return min + t * (max - min);
}

function feasibilityFor(simpleDaily: number, maxDailyLossPct: number): Feasibility {
  if (simpleDaily > maxDailyLossPct) return "unrealistic";
  if (simpleDaily < EASY_DAILY) return "easy";
  if (simpleDaily < STRETCH_DAILY) return "stretch";
  return "unrealistic";
}

function noteFor(level: LevelTemplate, feasibility: Feasibility, days: number): string {
  if (level.id === "steady") {
    if (feasibility === "unrealistic") {
      return `Cannot reach this in ${days}d without hitting the daily halt. Need more capital or more days.`;
    }
    return "Smaller tickets, tighter stops. Slow path. Not a promise.";
  }
  if (level.id === "balanced") {
    if (feasibility === "unrealistic") {
      return "Default book, but the implied daily % is over the halt. Not a plan to win.";
    }
    return "Default-ish book. Recommended unless the math is extreme. Not a promise.";
  }
  if (feasibility === "unrealistic") {
    return "Implied daily % is over this halt. Larger tickets are not a plan to win. Not a promise.";
  }
  return "Larger tickets, wider take. Still can lose. Not a promise.";
}

function pickRecommended(levels: GoalLevel[]): GoalLevelId {
  for (const feas of ["easy", "stretch"] as const) {
    for (const id of RECOMMEND_ORDER) {
      if (levels.find((l) => l.id === id)?.feasibility === feas) return id;
    }
  }
  return "steady";
}

/**
 * Suggested session length = min(calendar days in minutes, 8h trading days × D).
 * Does not auto-arm live. UI still defaults to 4h unless D is 1 (maps to 8h).
 */
export function suggestedSessionMinutes(days: number): number {
  const d = normalizeGoalDays(days);
  return Math.min(d * CALENDAR_DAY_MINUTES, d * TRADING_DAY_MINUTES);
}

/** Duration-pill default: 8h if the goal is a single day, else the usual 4h. */
export function sessionMinutesForDays(days: number): number {
  const d = normalizeGoalDays(days);
  if (d <= 1) return TRADING_DAY_MINUTES;
  return DEFAULT_SESSION_MINUTES;
}

export function goalNeedLine(goalProfit: number, capital: number, days: number, simpleDaily: number): string {
  const g = fmtGoalUsd(goalProfit);
  const c = fmtGoalUsd(capital);
  const pct = fmtDailyPct(simpleDaily);
  return `To make ${g} on a ${c} book in ${days} days you need ~${pct}% per day. This is not a promise.`;
}

/** Header / desk chip: "goal $10k · 7d · 12% there". dayPnl vs G, not a forecast. */
export function goalChipLine(input: {
  goalProfit: number;
  goalDays: number;
  dayPnl: number;
}): string {
  const g = fmtGoalUsd(input.goalProfit);
  const d = normalizeGoalDays(input.goalDays);
  const pctThere = goalProgressPct(input.dayPnl, input.goalProfit);
  const shown = Number.isFinite(pctThere) ? Math.round(pctThere) : 0;
  return `goal ${g} · ${d}d · ${shown}% there`;
}

export function goalProgressPct(dayPnl: number, goalProfit: number): number {
  const g = Number(goalProfit);
  const p = Number(dayPnl);
  if (!Number.isFinite(g) || g <= 0 || !Number.isFinite(p)) return 0;
  return (p / g) * 100;
}

export function planGoal(input?: {
  capital?: number;
  goalProfit?: number;
  days?: number;
}): GoalPlan {
  const goalProfit = normalizeGoalProfit(input?.goalProfit ?? GOAL_DEFAULTS.goalProfit);
  const days = normalizeGoalDays(input?.days ?? GOAL_DEFAULTS.days);
  const capital = clampLaunch({
    startingCash: input?.capital ?? GOAL_DEFAULTS.capital,
  }).startingCash;

  const requiredReturn = goalProfit / capital;
  const simpleDaily = goalProfit / days / capital;
  const requiredDailyPct = simpleDaily * 100;
  const wild = simpleDaily >= STRETCH_DAILY;

  const levels: GoalLevel[] = LEVEL_TEMPLATES.map((tpl) => {
    const sizePctRaw = lerpSize(simpleDaily, tpl.sizeMin, tpl.sizeMax);
    const clamped = clampLaunch({
      startingCash: capital,
      sizePct: sizePctRaw,
      stopPct: tpl.stopPct,
      takePct: tpl.takePct,
      maxDailyLossPct: tpl.maxDailyLossPct,
      maxPositions: tpl.maxPositions,
    });
    const feasibility = feasibilityFor(simpleDaily, clamped.maxDailyLossPct);
    return {
      id: tpl.id,
      label: tpl.label,
      sizePct: clamped.sizePct,
      stopPct: clamped.stopPct,
      takePct: clamped.takePct,
      maxDailyLossPct: clamped.maxDailyLossPct,
      maxPositions: clamped.maxPositions,
      ticketUsd: ticketNotional(capital, clamped.sizePct),
      note: noteFor(tpl, feasibility, days),
      feasibility,
      requiredDailyPct,
    };
  });

  const recommended = pickRecommended(levels);
  const allUnreal = levels.every((l) => l.feasibility === "unrealistic");
  const recommendNote = allUnreal
    ? "None of these levels can reach this goal without blowing the daily halt. Steady is the least-bad book — add capital or add days. Not a promise."
    : recommended === "balanced"
      ? "Balanced is the default book for this goal. Not a promise."
      : recommended === "steady"
        ? "Steady is the only level that does not blow the halt on paper. Not a promise."
        : "Push is the only level whose halt still covers the implied daily %. Still not a promise.";

  return {
    capital,
    goalProfit,
    days,
    requiredReturn,
    simpleDaily,
    requiredDailyPct,
    suggestedSessionMinutes: suggestedSessionMinutes(days),
    recommended,
    recommendNote,
    wild,
    levels,
    needLine: goalNeedLine(goalProfit, capital, days, simpleDaily),
  };
}

export function levelById(plan: GoalPlan, id: unknown): GoalLevel {
  const want = asGoalLevel(id);
  return plan.levels.find((l) => l.id === want) ?? plan.levels[1] ?? plan.levels[0]!;
}
