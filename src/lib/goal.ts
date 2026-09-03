/**
 * Goal planner: money target + deadline → ticket size / risk levels.
 * Pure helper. Never promises the goal will be hit. Does not arm live.
 */

import { LAUNCH_BOUNDS, clampLaunch, ticketNotional } from "./launch.mjs";
// Extension-explicit so `node --experimental-strip-types --test` can resolve it;
// `allowImportingTsExtensions` + bundler resolution keep tsc and Vite happy.
import { DEFAULT_SESSION_MINUTES } from "./session.ts";

export type Feasibility = "easy" | "stretch" | "unrealistic";
export type GoalLevelId = "steady" | "balanced" | "push";

/** Badge copy. "Unrealistic" three times in a column reads as a wall, not an answer. */
export const FEASIBILITY_LABEL: Record<Feasibility, string> = {
  easy: "In reach",
  stretch: "Stretch",
  unrealistic: "Out of reach",
};

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
  /** What this book aims to compound per day on paper. Not the loss halt. */
  dailyTargetPct: number;
  /** Profit this level targets over the window at its own daily aim. */
  reachableProfit: number;
  /** Days this level would need for the goal. `Infinity` when it never gets there. */
  daysToGoal: number;
  /** Capital this level would need to hit the goal inside the window. */
  capitalForGoal: number;
};

/** A one-tap nudge that turns an out-of-reach ask into a reachable one. */
export type GoalFix = {
  id: "days" | "capital" | "goal";
  label: string;
  detail: string;
  days?: number;
  capital?: number;
  goalProfit?: number;
};

export type GoalPlan = {
  capital: number;
  goalProfit: number;
  days: number;
  requiredReturn: number;
  simpleDaily: number;
  requiredDailyPct: number;
  /** Honest per-day rate: equity compounds, so simple division overstates nothing but flatters the ask. */
  compoundDaily: number;
  suggestedSessionMinutes: number;
  recommended: GoalLevelId;
  recommendNote: string;
  wild: boolean;
  levels: GoalLevel[];
  needLine: string;
  /** Plain-language restatement of the ask: "+100% on a $10k book in 7 days." */
  askLine: string;
  /** What the recommended book actually aims for over the same window. */
  aimLine: string;
  /** Empty unless the recommended level cannot get there. */
  fixes: GoalFix[];
};

/**
 * Opening state of the gate. A $1k goal on a $10k book in 30 days is ~0.32% a
 * day — a book the desk can actually describe. The old default asked for +100%
 * in a week and opened on three red cards with no way forward.
 */
export const GOAL_DEFAULTS = {
  goalProfit: 1_000,
  days: 30,
  capital: 10_000,
  level: "balanced" as GoalLevelId,
};

/** Preset profit targets (USD). Custom field accepts any other amount. */
export const GOAL_PRESETS = [200, 500, 1_000, 2_000, 5_000, 10_000] as const;

/** Preset windows. 0 = no deadline. */
export const DAY_PRESETS = [0, 7, 14, 30] as const;

export const GOAL_BOUNDS = {
  goalProfit: { min: 0, max: 10_000_000 },
  days: { min: 0, max: 365 },
};

/** requiredReturn / day under this → easy */
export const EASY_DAILY = 0.01;
/** requiredReturn / day under this → stretch; at or above → unrealistic */
export const STRETCH_DAILY = 0.04;

/**
 * Feasibility is the ask measured against what a level *aims to win*, not
 * against its daily loss halt. Comparing a target return to a stop-loss cap is
 * how every level ended up red on the default book while the copy still called
 * one of them "recommended".
 */
export const EASY_RATIO = 0.6;
export const STRETCH_RATIO = 1;

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
  /** Daily compounding rate this book plays for on paper. */
  dailyTargetPct: number;
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
    dailyTargetPct: 0.004,
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
    dailyTargetPct: 0.008,
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
    dailyTargetPct: 0.015,
  },
];

const RECOMMEND_ORDER: GoalLevelId[] = ["balanced", "steady", "push"];

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeGoalProfit(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return clamp(v, GOAL_BOUNDS.goalProfit.min, GOAL_BOUNDS.goalProfit.max);
}

/** 0 = no deadline. */
export function normalizeGoalDays(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return clamp(v, 1, GOAL_BOUNDS.days.max);
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

/**
 * The honest per-day rate: a book that makes X% a day compounds, so the ask is
 * a geometric rate, not `profit / days / capital`. On $10k → $10k in 7 days
 * that is ~10.4% a day, not the ~14.3% simple division reports.
 */
export function compoundDailyRate(goalProfit: number, capital: number, days: number): number {
  const g = Number(goalProfit);
  const c = Number(capital);
  const d = Number(days);
  if (!Number.isFinite(g) || !Number.isFinite(c) || !Number.isFinite(d)) return Infinity;
  if (c <= 0 || d <= 0 || g <= 0) return 0;
  return Math.pow(1 + g / c, 1 / d) - 1;
}

/** Profit a book compounding `daily` reaches over `days`. */
export function reachableProfit(capital: number, daily: number, days: number): number {
  const c = Number(capital);
  if (!Number.isFinite(c) || c <= 0 || daily <= 0 || days <= 0) return 0;
  return c * (Math.pow(1 + daily, days) - 1);
}

/** Days a book compounding `daily` needs for `goalProfit`. `Infinity` if never. */
export function daysToReach(goalProfit: number, capital: number, daily: number): number {
  const g = Number(goalProfit);
  const c = Number(capital);
  if (!Number.isFinite(g) || !Number.isFinite(c) || c <= 0 || g <= 0 || daily <= 0) {
    return Infinity;
  }
  return Math.ceil(Math.log(1 + g / c) / Math.log(1 + daily));
}

/** Capital a book compounding `daily` needs to clear `goalProfit` inside `days`. */
export function capitalToReach(goalProfit: number, daily: number, days: number): number {
  const g = Number(goalProfit);
  if (!Number.isFinite(g) || g <= 0 || daily <= 0 || days <= 0) return Infinity;
  const growth = Math.pow(1 + daily, days) - 1;
  if (growth <= 0) return Infinity;
  return g / growth;
}

/** Two significant figures, so a suggested number reads as a suggestion. */
function niceStep(n: number): number {
  const abs = Math.abs(n);
  if (!Number.isFinite(abs) || abs < 10) return 1;
  return Math.max(10, Math.pow(10, Math.floor(Math.log10(abs)) - 1));
}

function roundUpNice(n: number): number {
  if (!Number.isFinite(n)) return n;
  const step = niceStep(n);
  return Math.ceil(n / step) * step;
}

function roundDownNice(n: number): number {
  if (!Number.isFinite(n)) return n;
  const step = niceStep(n);
  return Math.max(0, Math.floor(n / step) * step);
}

function feasibilityFor(requiredDaily: number, dailyTargetPct: number): Feasibility {
  if (!Number.isFinite(requiredDaily) || dailyTargetPct <= 0) return "unrealistic";
  if (requiredDaily <= 0) return "easy";
  const ratio = requiredDaily / dailyTargetPct;
  if (ratio <= EASY_RATIO) return "easy";
  if (ratio <= STRETCH_RATIO) return "stretch";
  return "unrealistic";
}

function noteFor(
  level: LevelTemplate,
  feasibility: Feasibility,
  days: number,
  reach: number,
): string {
  const aim = fmtDailyPct(level.dailyTargetPct);
  const window = `~${aim}% a day → about ${fmtGoalUsd(reach)} in ${days}d`;
  if (level.id === "steady") {
    if (feasibility === "unrealistic") {
      return `Aims ${window} — short of this goal. Smaller tickets, tighter stops.`;
    }
    return `Aims ${window}. Smaller tickets, tighter stops. Not a promise.`;
  }
  if (level.id === "balanced") {
    if (feasibility === "unrealistic") {
      return `Aims ${window} — short of this goal. The default book, not a bigger one.`;
    }
    return `Aims ${window}. The default book. Not a promise.`;
  }
  if (feasibility === "unrealistic") {
    return `Aims ${window} — still short. Bigger tickets lose faster, they do not win sooner.`;
  }
  return `Aims ${window}. Bigger tickets, wider take. Can still lose.`;
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
  const d = days <= 0 ? 1 : normalizeGoalDays(days) || 1;
  return Math.min(d * CALENDAR_DAY_MINUTES, d * TRADING_DAY_MINUTES);
}

/** Duration-pill default: 8h if the goal is a single day, else the usual 4h. */
export function sessionMinutesForDays(days: number): number {
  const d = normalizeGoalDays(days);
  if (d <= 0) return 0;
  if (d <= 1) return TRADING_DAY_MINUTES;
  return DEFAULT_SESSION_MINUTES;
}

export function goalNeedLine(goalProfit: number, capital: number, days: number, dailyRate: number): string {
  const g = fmtGoalUsd(goalProfit);
  const c = fmtGoalUsd(capital);
  const pct = fmtDailyPct(dailyRate);
  return `To make ${g} on a ${c} book in ${days} days you need ~${pct}% per day, compounding. This is not a promise.`;
}

/** Restates the ask as a percentage of the book, which is what makes it land. */
export function goalAskLine(goalProfit: number, capital: number, days: number): string {
  const c = fmtGoalUsd(capital);
  const ratio = capital > 0 ? goalProfit / capital : 0;
  const pct = ratio >= 1 ? Math.round(ratio * 100).toLocaleString("en-US") : (ratio * 100).toFixed(ratio < 0.1 ? 1 : 0).replace(/\.0$/, "");
  const dayWord = days === 1 ? "day" : "days";
  return `That is +${pct}% on a ${c} book in ${days} ${dayWord}.`;
}

/** Header / desk chip: "goal $10k · 7d · 12% there" or "goal $1k · open · 4% there". */
export function goalChipLine(input: {
  goalProfit: number;
  goalDays: number;
  dayPnl: number;
}): string {
  const profit = normalizeGoalProfit(input.goalProfit);
  if (profit <= 0) return "set goal";
  const g = fmtGoalUsd(profit);
  const d = normalizeGoalDays(input.goalDays);
  const window = d > 0 ? `${d}d` : "open";
  const pctThere = goalProgressPct(input.dayPnl, profit);
  const shown = Number.isFinite(pctThere) ? Math.round(pctThere) : 0;
  return `goal ${g} · ${window} · ${shown}% there`;
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
  const goalProfit =
    normalizeGoalProfit(input?.goalProfit ?? GOAL_DEFAULTS.goalProfit) || GOAL_DEFAULTS.goalProfit;
  const days = normalizeGoalDays(input?.days ?? GOAL_DEFAULTS.days) || GOAL_DEFAULTS.days;
  const capital = clampLaunch({
    startingCash: input?.capital ?? GOAL_DEFAULTS.capital,
  }).startingCash;

  const requiredReturn = goalProfit / capital;
  const simpleDaily = goalProfit / days / capital;
  const compoundDaily = compoundDailyRate(goalProfit, capital, days);
  const requiredDailyPct = simpleDaily * 100;

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
    const feasibility = feasibilityFor(compoundDaily, tpl.dailyTargetPct);
    const reach = reachableProfit(capital, tpl.dailyTargetPct, days);
    return {
      id: tpl.id,
      label: tpl.label,
      sizePct: clamped.sizePct,
      stopPct: clamped.stopPct,
      takePct: clamped.takePct,
      maxDailyLossPct: clamped.maxDailyLossPct,
      maxPositions: clamped.maxPositions,
      ticketUsd: ticketNotional(capital, clamped.sizePct),
      note: noteFor(tpl, feasibility, days, reach),
      feasibility,
      requiredDailyPct,
      dailyTargetPct: tpl.dailyTargetPct,
      reachableProfit: reach,
      daysToGoal: daysToReach(goalProfit, capital, tpl.dailyTargetPct),
      capitalForGoal: capitalToReach(goalProfit, tpl.dailyTargetPct, days),
    };
  });

  const recommended = pickRecommended(levels);
  const best = levels.find((l) => l.id === recommended) ?? levels[0]!;
  const wild = best.feasibility === "unrealistic";
  const allUnreal = levels.every((l) => l.feasibility === "unrealistic");

  /**
   * Two different questions. "Which book should I run?" stays conservative and
   * answers Steady when nothing works. "What is possible here at all?" has to
   * be answered by the hungriest book on the floor — quoting Steady's 0.4% a
   * day turns a 47-day fix into a 174-day one and reads as a brush-off.
   */
  const ceiling = levels.reduce((a, b) => (b.dailyTargetPct > a.dailyTargetPct ? b : a), levels[0]!);
  const reference = allUnreal ? ceiling : best;
  const refAim = fmtDailyPct(reference.dailyTargetPct);

  const recommendNote = allUnreal
    ? `Even ${ceiling.label}, the hungriest book here, plays for ~${refAim}% a day — nothing on this floor reaches ${fmtGoalUsd(goalProfit)} in ${days} days. ${best.label} is the least-bad book to run. Not a promise.`
    : recommended === "balanced"
      ? "Balanced is the default book for this goal. Not a promise."
      : recommended === "steady"
        ? "Steady already covers this goal, so the desk keeps tickets small. Not a promise."
        : "Only Push aims high enough for this window. Still not a promise.";

  const aimLine = `${reference.label} plays for ~${refAim}% a day — about ${fmtGoalUsd(
    roundDownNice(reference.reachableProfit),
  )} on this book in ${days} ${days === 1 ? "day" : "days"}.`;

  return {
    capital,
    goalProfit,
    days,
    requiredReturn,
    simpleDaily,
    requiredDailyPct,
    compoundDaily,
    suggestedSessionMinutes: suggestedSessionMinutes(days),
    recommended,
    recommendNote,
    wild,
    levels,
    needLine: goalNeedLine(goalProfit, capital, days, compoundDaily),
    askLine: goalAskLine(goalProfit, capital, days),
    aimLine,
    fixes: wild ? buildFixes(reference, goalProfit, capital, days) : [],
  };
}

/**
 * Three concrete ways out of an out-of-reach ask, each a real number the gate
 * can apply on tap: more days, more capital, or a smaller goal. A level that
 * cannot get there inside the platform's bounds simply drops its suggestion
 * rather than printing a number nobody can enter.
 */
function buildFixes(ref: GoalLevel, goalProfit: number, capital: number, days: number): GoalFix[] {
  const fixes: GoalFix[] = [];
  const aim = fmtDailyPct(ref.dailyTargetPct);

  const needDays = ref.daysToGoal;
  if (Number.isFinite(needDays) && needDays > days && needDays <= GOAL_BOUNDS.days.max) {
    fixes.push({
      id: "days",
      label: `Give it ${needDays} days`,
      detail: `Same ${fmtGoalUsd(goalProfit)} on the same book at ~${aim}% a day.`,
      days: needDays,
    });
  }

  const needCapital = roundUpNice(ref.capitalForGoal);
  if (
    Number.isFinite(needCapital) &&
    needCapital > capital &&
    needCapital <= LAUNCH_BOUNDS.startingCash.max
  ) {
    fixes.push({
      id: "capital",
      label: `Start with ${fmtGoalUsd(needCapital)}`,
      detail: `Same ${fmtGoalUsd(goalProfit)} inside ${days} days at ~${aim}% a day.`,
      capital: needCapital,
    });
  }

  const smallerGoal = roundDownNice(ref.reachableProfit);
  if (smallerGoal >= 1 && smallerGoal < goalProfit) {
    fixes.push({
      id: "goal",
      label: `Aim for ${fmtGoalUsd(smallerGoal)}`,
      detail: `What ${ref.label} plays for on ${fmtGoalUsd(capital)} in ${days} days.`,
      goalProfit: smallerGoal,
    });
  }

  return fixes;
}

export function levelById(plan: GoalPlan, id: unknown): GoalLevel {
  const want = asGoalLevel(id);
  return plan.levels.find((l) => l.id === want) ?? plan.levels[1] ?? plan.levels[0]!;
}
