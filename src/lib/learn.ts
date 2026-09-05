import type { PlaybookId } from "./playbook.ts";
import type { DailyStance } from "./daily-trend.ts";
import type { Candle, PairId, WireItem } from "./types.ts";

export type SetupId = "cross" | "rsi" | "momentum";
export type ExitKind = "take" | "stop" | "time" | "reject" | "risk" | "unknown";

/**
 * World techniques → this desk. We do not run extra engines.
 * momentum / breakout → scalp
 * mean-reversion / RSI fade → grid
 * dip scale-in → dca
 * ATR stop + 2R take + trail → already code in risk-stops/scalp
 *
 * Trader rules:
 * - never bank unpaid fees
 * - don't scalp chop
 * - ride daily trend
 * - cut losers
 * - wire confirms not replaces risk
 * - fewer tickets
 */
export const DESK_METHODS = ["scalp", "grid", "dca"] as const;

/** Short rules string for brain UI. */
export const DESK_RULES =
  "Never bank unpaid fees · Don't scalp chop · Ride daily trend · Cut losers · Wire confirms risk · Fewer tickets";

export type Lesson = {
  ts: number;
  pair: PairId;
  win: boolean;
  pnl: number;
  setup: SetupId | "unknown";
  kind: ExitKind;
  book: PlaybookId | "unknown";
  hour: number;
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
  bookScore: Record<PlaybookId, number>;
  hourScore: number[];
  rejectCount: Partial<Record<PairId, number>>;
  lessons: Lesson[];
  assetMemory: Partial<Record<PairId, AssetMemory>>;
  /** Daily EMA stance from studyBook — omit until studied. */
  dailyStance?: DailyStance;
};

export const DEFAULT_BRAIN: Brain = {
  enabled: true,
  rsiBuy: 38,
  rsiSell: 62,
  emaBoost: 0.18,
  volMult: 1.35,
  momThresh: 0.01,
  minConf: 0.55,
  sizeTilt: 1,
  samples: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  lastNote: "brain cold — industry+fees · waiting on fills",
  pairBias: {},
  setupScore: { cross: 0, rsi: 0, momentum: 0 },
  bookScore: { scalp: 0, grid: 0, dca: 0 },
  hourScore: Array.from({ length: 24 }, () => 0),
  rejectCount: {},
  lessons: [],
  assetMemory: {},
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function playbookFromReason(reason: string): PlaybookId | "unknown" {
  const r = reason.toLowerCase();
  if (r.includes("dust")) return "unknown";
  if (r.includes("grid")) return "grid";
  if (r.includes("dca")) return "dca";
  if (r.includes("scalp") || r.includes("clip") || r.includes("flip")) return "scalp";
  return "unknown";
}

export function hourOf(ts = Date.now()): number {
  return new Date(ts).getUTCHours();
}

function hoursOf(brain: Brain): number[] {
  const h = brain.hourScore;
  if (Array.isArray(h) && h.length === 24) return h.slice();
  return Array.from({ length: 24 }, () => 0);
}

function booksOf(brain: Brain): Record<PlaybookId, number> {
  return {
    scalp: brain.bookScore?.scalp ?? 0,
    grid: brain.bookScore?.grid ?? 0,
    dca: brain.bookScore?.dca ?? 0,
  };
}

/** Skip new entries in hours that keep losing after enough prints. */
export function hourQuiet(brain: Brain, hour = hourOf()): boolean {
  if (!brain.enabled || brain.samples < 8) return false;
  const score = hoursOf(brain)[hour] ?? 0;
  return score <= -4;
}

export function bookAllowed(brain: Brain, book: PlaybookId | "unknown"): boolean {
  if (book === "unknown") return true;
  if (!brain.enabled) return true;
  return (booksOf(brain)[book] ?? 0) > -5;
}

export function setupFromReason(reason: string): SetupId | "unknown" {
  const r = reason.toLowerCase();
  if (r.includes("cross") || r.includes("ema") || r.includes("breakout")) return "cross";
  if (r.includes("oversold") || r.includes("overbought") || r.includes("rsi") || r.includes("mean"))
    return "rsi";
  if (r.includes("momentum") || r.includes("burst") || r.includes("flip")) return "momentum";
  return "unknown";
}

export function kindFromReason(reason: string): ExitKind {
  const r = reason.toLowerCase();
  if (r.includes("dust")) return "unknown";
  if (r.includes("reject") || r.includes("eapi") || r.includes("insufficient") || r.includes("nonce"))
    return "reject";
  if (r.includes("regime") || r.includes("flow") || r.includes("skip") || r.includes("risk")) return "risk";
  if (r.includes("stop") || r.includes("cut") || /\bsl\b/.test(r)) return "stop";
  if (r.includes("dead") || r.includes("time") || r.includes("clip")) return "time";
  if (r.includes("take") || r.includes("2r") || r.includes("trail")) return "take";
  return "unknown";
}

export function pairBlocked(brain: Brain, pair: PairId): boolean {
  if (!brain.enabled) return false;
  return (brain.rejectCount?.[pair] ?? 0) >= 4 || (brain.pairBias[pair] ?? 0) <= -0.45;
}

export function learnFromClose(
  brain: Brain,
  args: { pair: PairId; pnl: number; reason: string; playbook?: PlaybookId; hour?: number },
): Brain {
  if (!brain.enabled) return brain;
  if (/dust/i.test(args.reason)) return brain;
  const win = args.pnl > 0;
  const setup = setupFromReason(args.reason);
  const book = args.playbook ?? playbookFromReason(args.reason);
  const hour = ((args.hour ?? hourOf()) % 24 + 24) % 24;
  const next: Brain = {
    ...brain,
    pairBias: { ...brain.pairBias },
    setupScore: { ...brain.setupScore },
    bookScore: booksOf(brain),
    hourScore: hoursOf(brain),
    rejectCount: { ...brain.rejectCount },
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
    if (book !== "unknown") next.bookScore[book] = clamp(next.bookScore[book] + 1, -8, 12);
    next.hourScore[hour] = clamp((next.hourScore[hour] ?? 0) + 0.8, -8, 12);
    next.lastNote = `kept ${args.pair} · ${book}/${setup} +${args.pnl.toFixed(2)} · h${hour} UTC`;
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
    if (kindFromReason(args.reason) === "stop") {
      next.pairBias[args.pair] = clamp((next.pairBias[args.pair] ?? 0) - 0.05, -0.5, 0.5);
      next.minConf = clamp(next.minConf + 0.01, 0.36, 0.72);
    }
    if (setup !== "unknown") next.setupScore[setup] = clamp(next.setupScore[setup] - 1.4, -8, 12);
    if (book !== "unknown") next.bookScore[book] = clamp(next.bookScore[book] - 1.3, -8, 12);
    next.hourScore[hour] = clamp((next.hourScore[hour] ?? 0) - 1, -8, 12);
    next.lastNote = `cut ${args.pair} · ${book}/${setup} ${args.pnl.toFixed(2)} · h${hour} UTC`;
  }
  const kind = kindFromReason(args.reason);
  next.lessons.unshift({
    ts: Date.now(),
    pair: args.pair,
    win,
    pnl: args.pnl,
    setup,
    kind,
    book,
    hour,
    note: next.lastNote,
  });
  next.lessons = next.lessons.slice(0, 24);
  return next;
}

/** Venue rejects, regime/flow/risk skips — not a fill, still a lesson. */
export function learnFromMiss(
  brain: Brain,
  args: { pair: PairId; reason: string; playbook?: PlaybookId; hour?: number },
): Brain {
  if (!brain.enabled) return brain;
  if (/dust/i.test(args.reason)) return brain;
  const kind = kindFromReason(args.reason);
  const book = args.playbook ?? playbookFromReason(args.reason);
  const hour = ((args.hour ?? hourOf()) % 24 + 24) % 24;
  const next: Brain = {
    ...brain,
    pairBias: { ...brain.pairBias },
    setupScore: { ...brain.setupScore },
    bookScore: booksOf(brain),
    hourScore: hoursOf(brain),
    rejectCount: { ...brain.rejectCount },
    lessons: brain.lessons.slice(),
    assetMemory: { ...brain.assetMemory },
  };
  next.pairBias[args.pair] = clamp((next.pairBias[args.pair] ?? 0) - 0.04, -0.5, 0.5);
  next.hourScore[hour] = clamp((next.hourScore[hour] ?? 0) - 0.35, -8, 12);
  if (kind === "reject") {
    next.rejectCount[args.pair] = (next.rejectCount[args.pair] ?? 0) + 1;
    if (book !== "unknown") next.bookScore[book] = clamp(next.bookScore[book] - 0.4, -8, 12);
  }
  if (kind === "risk") {
    next.minConf = clamp(next.minConf + 0.004, 0.36, 0.72);
  }
  next.lastNote = `miss ${args.pair} · ${kind} · ${args.reason}`.slice(0, 140);
  next.lessons.unshift({
    ts: Date.now(),
    pair: args.pair,
    win: false,
    pnl: 0,
    setup: setupFromReason(args.reason),
    kind,
    book,
    hour,
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
      if (closes[k]! >= entry * 1.022) {
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


export function learnFromIndustry(
  brain: Brain,
  input: {
    wire: WireItem[];
    fearGreed?: { value: number; label: string } | null;
    dailyStance?: DailyStance | "long" | "cash" | "chop";
  },
): Brain {
  if (!brain.enabled) return brain;
  const next: Brain = {
    ...brain,
    pairBias: { ...brain.pairBias },
    setupScore: { ...brain.setupScore },
    bookScore: booksOf(brain),
    hourScore: hoursOf(brain),
    rejectCount: { ...brain.rejectCount },
    lessons: brain.lessons.slice(),
    assetMemory: { ...brain.assetMemory },
  };
  const stance = input.dailyStance;
  if (stance === "long" || stance === "cash" || stance === "chop") {
    next.dailyStance = stance;
  }
  const fresh = (input.wire ?? []).filter((w) => Date.now() - w.ts < 6 * 3_600_000);
  const bulls = fresh.filter((w) => w.tone === "bull").length;
  const bears = fresh.filter((w) => w.tone === "bear").length;
  const trendWire = fresh.some((w) => w.kind === "trend" && w.tone === "bull");
  const fg = input.fearGreed?.value;

  // Stance tilts only when dailyStance is provided (studyBook); wire refresh skips this.
  if (stance === "chop" || stance === "cash") {
    next.bookScore.scalp = clamp(next.bookScore.scalp - (stance === "cash" ? 2.2 : 1.4), -8, 12);
    next.bookScore.grid = clamp(next.bookScore.grid + 0.4, -8, 12);
    next.bookScore.dca = clamp(next.bookScore.dca + (stance === "cash" ? 0.2 : 0.5), -8, 12);
    next.minConf = clamp(next.minConf + (stance === "cash" ? 0.04 : 0.02), 0.36, 0.78);
  } else if (stance === "long") {
    next.bookScore.scalp = clamp(next.bookScore.scalp + (trendWire ? 0.8 : 0.35), -8, 12);
    next.bookScore.dca = clamp(next.bookScore.dca + 0.25, -8, 12);
    next.minConf = clamp(next.minConf - 0.01, 0.36, 0.78);
  }

  // Fear & greed extremes tilt size.
  if (typeof fg === "number") {
    if (fg <= 20) next.sizeTilt = clamp(next.sizeTilt - 0.08, 0.55, 1.45);
    else if (fg >= 80) next.sizeTilt = clamp(next.sizeTilt - 0.05, 0.55, 1.45);
    else if (fg >= 45 && fg <= 60) next.sizeTilt = clamp(next.sizeTilt + 0.02, 0.55, 1.45);
  }

  // Soft pairBias bumps from bull/bear wire on tagged pairs.
  for (const w of fresh) {
    const delta = w.tone === "bull" ? 0.03 : w.tone === "bear" ? -0.04 : 0;
    if (!delta) continue;
    for (const pair of w.pairs ?? []) {
      next.pairBias[pair] = clamp((next.pairBias[pair] ?? 0) + delta, -0.5, 0.5);
    }
  }

  const fgNote = fg != null ? ` · FG ${fg}` : "";
  const wireNote = bulls || bears ? ` · wire ${bulls}↑/${bears}↓` : "";
  const stanceNote = stance ?? "tape";
  next.lastNote = `industry ${stanceNote}${fgNote}${wireNote} · fees-aware`.slice(0, 140);
  return next;
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
  if (low.includes("when") || low.includes("hour") || low.includes("time")) {
    const hours = (brain.hourScore ?? []).map((v, i) => ({ i, v }));
    const best = hours.slice().sort((a, b) => b.v - a.v)[0];
    const worst = hours.slice().sort((a, b) => a.v - b.v)[0];
    return `UTC hour ${best ? best.i : "—"} is the best print so far. Skip hour ${worst && worst.v <= -4 ? worst.i : "none yet"}. RSI ${brain.rsiBuy.toFixed(0)}/${brain.rsiSell.toFixed(0)}.`;
  }
  if (low.includes("hot") || low.includes("what") || low.includes("buy")) {
    return top
      ? `${top.pair} studied ${(top.wr * 100).toFixed(0)}% on ${top.samples} tests since ${new Date(top.since).toUTCString().slice(0, 16)}. Best setup ${top.bestSetup}.`
      : `No history yet. Hit Learn — hunter and signal will walk the daily tape. Book: ${extras.pairs}.`;
  }
  return `Brain ${brain.samples ? `${wr}% on ${brain.samples} closes` : "cold"}. Equity $${extras.equity.toFixed(0)}. RSI ${brain.rsiBuy.toFixed(0)}/${brain.rsiSell.toFixed(0)}. Always logging fills. ${top ? top.lastNote : "Study the book in Learn."}`;
}
