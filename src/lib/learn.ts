import type { PairId } from "./types.ts";

export type SetupId = "cross" | "rsi" | "momentum";

export type Lesson = {
  ts: number;
  pair: PairId;
  win: boolean;
  pnl: number;
  setup: SetupId | "unknown";
  note: string;
};

export type Brain = {
  enabled: boolean;
  rsiBuy: number;
  rsiSell: number;
  emaBoost: number;
  volMult: number;
  momThresh: number;
  minConf: number;
  sizeTilt: number;
  samples: number;
  wins: number;
  losses: number;
  streak: number;
  lastNote: string;
  pairBias: Partial<Record<PairId, number>>;
  setupScore: Record<SetupId, number>;
  lessons: Lesson[];
};

export const DEFAULT_BRAIN: Brain = {
  enabled: true,
  rsiBuy: 38,
  rsiSell: 62,
  emaBoost: 0.18,
  volMult: 1.35,
  momThresh: 0.006,
  minConf: 0.48,
  sizeTilt: 1,
  samples: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  lastNote: "brain cold — waiting on fills",
  pairBias: {},
  setupScore: { cross: 0, rsi: 0, momentum: 0 },
  lessons: [],
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function setupFromReason(reason: string): SetupId | "unknown" {
  if (reason.includes("cross")) return "cross";
  if (reason.includes("Oversold") || reason.includes("Overbought") || reason.includes("RSI"))
    return "rsi";
  if (reason.toLowerCase().includes("momentum")) return "momentum";
  return "unknown";
}

export function learnFromClose(
  brain: Brain,
  args: { pair: PairId; pnl: number; reason: string },
): Brain {
  if (!brain.enabled) return brain;
  const win = args.pnl > 0;
  const setup = setupFromReason(args.reason);
  const next: Brain = {
    ...brain,
    pairBias: { ...brain.pairBias },
    setupScore: { ...brain.setupScore },
    lessons: brain.lessons.slice(),
  };
  next.samples += 1;
  if (win) {
    next.wins += 1;
    next.streak = next.streak >= 0 ? next.streak + 1 : 1;
    next.minConf = clamp(next.minConf - 0.008, 0.36, 0.72);
    next.sizeTilt = clamp(next.sizeTilt + 0.03, 0.55, 1.45);
    next.rsiBuy = clamp(next.rsiBuy - 0.35, 28, 46);
    next.rsiSell = clamp(next.rsiSell + 0.35, 54, 74);
    next.emaBoost = clamp(next.emaBoost + 0.01, 0.08, 0.28);
    next.momThresh = clamp(next.momThresh - 0.0002, 0.003, 0.012);
    next.pairBias[args.pair] = clamp((next.pairBias[args.pair] ?? 0) + 0.06, -0.5, 0.5);
    if (setup !== "unknown") next.setupScore[setup] = clamp(next.setupScore[setup] + 1, -8, 12);
    next.lastNote = `kept ${args.pair} · ${setup} +${args.pnl.toFixed(2)} · RSI ${next.rsiBuy.toFixed(0)}/${next.rsiSell.toFixed(0)}`;
  } else {
    next.losses += 1;
    next.streak = next.streak <= 0 ? next.streak - 1 : -1;
    next.minConf = clamp(next.minConf + 0.015, 0.36, 0.72);
    next.sizeTilt = clamp(next.sizeTilt - 0.05, 0.55, 1.45);
    next.rsiBuy = clamp(next.rsiBuy + 0.55, 28, 46);
    next.rsiSell = clamp(next.rsiSell - 0.55, 54, 74);
    next.volMult = clamp(next.volMult + 0.04, 1.1, 1.8);
    next.momThresh = clamp(next.momThresh + 0.0004, 0.003, 0.012);
    next.pairBias[args.pair] = clamp((next.pairBias[args.pair] ?? 0) - 0.09, -0.5, 0.5);
    if (setup !== "unknown") next.setupScore[setup] = clamp(next.setupScore[setup] - 1.4, -8, 12);
    next.lastNote = `cut ${args.pair} · ${setup} ${args.pnl.toFixed(2)} · conf ${(next.minConf * 100).toFixed(0)}%`;
  }
  next.lessons.unshift({
    ts: Date.now(),
    pair: args.pair,
    win,
    pnl: args.pnl,
    setup,
    note: next.lastNote,
  });
  next.lessons = next.lessons.slice(0, 24);
  return next;
}

export function pairMinConf(brain: Brain, pair: PairId): number {
  const bias = brain.pairBias[pair] ?? 0;
  return clamp(brain.minConf - bias * 0.12, 0.32, 0.78);
}

export function setupAllowed(brain: Brain, setup: SetupId | "unknown"): boolean {
  if (setup === "unknown") return true;
  return brain.setupScore[setup] > -5;
}

export function winRate(brain: Brain): number {
  if (brain.samples === 0) return 0;
  return brain.wins / brain.samples;
}
