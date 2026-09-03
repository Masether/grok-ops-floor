import type { Candle, PairId } from "./types.ts";

export type SetupId = "cross" | "rsi" | "momentum";

export type Lesson = {
  ts: number;
  pair: PairId;
  win: boolean;
  pnl: number;
  setup: SetupId | "unknown";
  note: string;
};

export type AssetMemory = {
  pair: PairId;
  since: number;
  bars: number;
  wr: number;
  samples: number;
  rsiMean: number;
  avgRangePct: number;
  bestSetup: SetupId;
  lastNote: string;
};

export type BrainMsg = {
  id: string;
  role: "user" | "brain";
  text: string;
  ts: number;
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
  assetMemory: Partial<Record<PairId, AssetMemory>>;
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
  assetMemory: {},
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
    assetMemory: { ...brain.assetMemory },
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

export function studyFromCandles(pair: PairId, candles: Candle[]): AssetMemory {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  let rsiSum = 0;
  let rsiN = 0;
  let rangeSum = 0;
  const setupHits: Record<SetupId, { w: number; n: number }> = {
    cross: { w: 0, n: 0 },
    rsi: { w: 0, n: 0 },
    momentum: { w: 0, n: 0 },
  };
  let samples = 0;
  let wins = 0;
  const end = Math.max(20, n - 6);
  for (let i = 20; i < end; i++) {
    const c = candles[i]!;
    if (c.open > 0) rangeSum += (c.high - c.low) / c.open;
    const slice = closes.slice(Math.max(0, i - 14), i + 1);
    let up = 0;
    let dn = 0;
    for (let k = 1; k < slice.length; k++) {
      const d = slice[k]! - slice[k - 1]!;
      if (d >= 0) up += d;
      else dn -= d;
    }
    const rs = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    rsiSum += rs;
    rsiN += 1;
    const emaFast = slice.slice(-9).reduce((a, b) => a + b, 0) / Math.min(9, slice.length);
    const emaSlow = slice.reduce((a, b) => a + b, 0) / slice.length;
    const prev = closes[i - 1] ?? c.close;
    const crossedUp = prev <= emaSlow && c.close > emaFast && emaFast > emaSlow;
    const oversold = rs < 38 && emaFast >= emaSlow;
    const mom = prev > 0 && i >= 5 && (c.close - (closes[i - 5] ?? c.close)) / prev > 0.02;
    let setup: SetupId | null = null;
    if (crossedUp) setup = "cross";
    else if (oversold) setup = "rsi";
    else if (mom) setup = "momentum";
    if (!setup) continue;
    const entry = c.close;
    let win = false;
    for (let k = i + 1; k <= Math.min(n - 1, i + 6); k++) {
      if (closes[k]! >= entry * 1.015) {
        win = true;
        break;
      }
      if (closes[k]! <= entry * 0.988) break;
    }
    samples += 1;
    if (win) wins += 1;
    setupHits[setup].n += 1;
    if (win) setupHits[setup].w += 1;
  }
  const wr = samples ? wins / samples : 0;
  let bestSetup: SetupId = "rsi";
  let best = -1;
  for (const id of ["cross", "rsi", "momentum"] as SetupId[]) {
    const row = setupHits[id];
    const score = row.n ? row.w / row.n : -1;
    if (score > best) {
      best = score;
      bestSetup = id;
    }
  }
  return {
    pair,
    since: candles[0]?.time ?? Date.now(),
    bars: n,
    wr,
    samples,
    rsiMean: rsiN ? rsiSum / rsiN : 50,
    avgRangePct: n > 30 ? (rangeSum / Math.max(rsiN, 1)) * 100 : 0,
    bestSetup,
    lastNote: samples
      ? `${pair} · ${n} bars · ${(wr * 100).toFixed(0)}% on ${samples} RSI/EMA tests · ${bestSetup}`
      : `${pair} · not enough history`,
  };
}

export function mergeAssetMemory(brain: Brain, mem: AssetMemory): Brain {
  const prev = brain.assetMemory[mem.pair];
  const biasDelta = mem.samples >= 8 ? (mem.wr - 0.5) * 0.2 : 0;
  return {
    ...brain,
    lastNote: mem.lastNote,
    pairBias: {
      ...brain.pairBias,
      [mem.pair]: clamp((brain.pairBias[mem.pair] ?? 0) + biasDelta, -0.5, 0.5),
    },
    setupScore: {
      ...brain.setupScore,
      [mem.bestSetup]: clamp(
        brain.setupScore[mem.bestSetup] + (mem.wr >= 0.52 ? 0.4 : -0.2),
        -8,
        12,
      ),
    },
    assetMemory: {
      ...brain.assetMemory,
      [mem.pair]: {
        ...prev,
        ...mem,
        since: Math.min(prev?.since ?? mem.since, mem.since),
        bars: Math.max(prev?.bars ?? 0, mem.bars),
        samples: Math.max(prev?.samples ?? 0, mem.samples),
        wr: mem.samples >= 8 ? mem.wr : (prev?.wr ?? mem.wr),
      },
    },
  };
}

export function localBrainReply(
  q: string,
  brain: Brain,
  extras: { equity: number; pairs: string; lastSignal?: string },
): string {
  const wr = brain.samples ? Math.round((brain.wins / brain.samples) * 100) : 0;
  const memories = Object.values(brain.assetMemory).filter(Boolean);
  const top = memories.slice().sort((a, b) => (b?.wr ?? 0) - (a?.wr ?? 0))[0];
  const low = q.toLowerCase();
  if (low.includes("rsi") || low.includes("when")) {
    return `Buy under RSI ${brain.rsiBuy.toFixed(0)}, fade over ${brain.rsiSell.toFixed(0)}. Size tilt ${brain.sizeTilt.toFixed(2)}x. ${extras.lastSignal ?? "No live ticket."}`;
  }
  if (low.includes("hot") || low.includes("what") || low.includes("buy")) {
    return top
      ? `${top.pair} studied ${(top.wr * 100).toFixed(0)}% on ${top.samples} tests since ${new Date(top.since).toUTCString().slice(0, 16)}. Best setup ${top.bestSetup}.`
      : `No history yet. Hit Learn — hunter and signal will walk the daily tape. Book: ${extras.pairs}.`;
  }
  return `Brain ${brain.samples ? `${wr}% on ${brain.samples} closes` : "cold"}. Equity $${extras.equity.toFixed(0)}. RSI ${brain.rsiBuy.toFixed(0)}/${brain.rsiSell.toFixed(0)}. Always logging fills. ${top ? top.lastNote : "Study the book in Learn."}`;
}
