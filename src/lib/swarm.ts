import { hunterScore, readFlow } from "./specialists.ts";
import { IDLE_DEBATE, runDebate, type Debate } from "./coordinate.ts";
import type { AgentId, PairId, Position, Ticker, TradeSignal, WireItem } from "./types.ts";
import type { Brain } from "./learn.ts";

export const SWARM_SIZE = 300;

export type GuildId = "price" | "liquidity" | "arb" | "inventory" | "risk";

export type GuildDef = {
  id: GuildId;
  name: string;
  role: string;
  count: number;
  color: string;
  lead: AgentId;
};

export const GUILDS: GuildDef[] = [
  {
    id: "price",
    name: "PRICE",
    role: "Watches price action",
    count: 80,
    color: "#3dffc8",
    lead: "signal",
  },
  {
    id: "liquidity",
    name: "LIQUIDITY",
    role: "Tracks liquidity",
    count: 60,
    color: "#5ce1ff",
    lead: "flow",
  },
  {
    id: "arb",
    name: "ARB",
    role: "Hunts arbitrage",
    count: 50,
    color: "#ff6b4a",
    lead: "hunter",
  },
  {
    id: "inventory",
    name: "INVENTORY",
    role: "Manages inventory",
    count: 50,
    color: "#e8c547",
    lead: "treasury",
  },
  {
    id: "risk",
    name: "RISK",
    role: "Monitors risk",
    count: 60,
    color: "#4db8ff",
    lead: "sentinel",
  },
];

export const GUILD_BY_ID: Record<GuildId, GuildDef> = Object.fromEntries(
  GUILDS.map((g) => [g.id, g]),
) as Record<GuildId, GuildDef>;

export type SwarmBot = {
  i: number;
  guild: GuildId;
  a: number;
  w: number;
  j: number;
  slot: number;
};

export type SwarmGuildSnap = {
  long: number;
  heat: number;
  note: string;
  score: number;
  rttMs: number;
  reported: number;
};

export type SwarmSnap = {
  live: number;
  long: number;
  kind: "buy" | "sell" | "hold";
  pair: PairId | null;
  grok: string;
  veto: boolean;
  rttMs: number;
  reported: number;
  pending: boolean;
  guilds: Record<GuildId, SwarmGuildSnap>;
  debate: Debate;
};

export type SwarmInput = {
  pair: PairId;
  signal: Pick<TradeSignal, "kind" | "confidence" | "rsi">;
  ticker?: Ticker;
  volumes: number[];
  positions: Position[];
  cash: number;
  equity: number;
  dayPnl: number;
  maxDailyLoss: number;
  maxPositions: number;
  brain: Brain;
  wire: WireItem[];
  fearGreed?: { value: number; label: string } | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function lean(count: number, score: number) {
  const p = clamp((score + 1) / 2, 0, 1);
  return Math.round(count * p);
}

/** Simulated hop time — PRICE is on the tape, RISK does the second read. */
export const GUILD_PING: Record<GuildId, { min: number; max: number }> = {
  price: { min: 42, max: 96 },
  liquidity: { min: 78, max: 168 },
  arb: { min: 140, max: 280 },
  inventory: { min: 88, max: 186 },
  risk: { min: 210, max: 420 },
};

export function pingGuild(id: GuildId, rnd = Math.random()): number {
  const { min, max } = GUILD_PING[id];
  return Math.round(min + rnd * (max - min));
}

export function pingSwarm(rnd: () => number = Math.random): Record<GuildId, number> {
  return Object.fromEntries(GUILDS.map((g) => [g.id, pingGuild(g.id, rnd())])) as Record<
    GuildId,
    number
  >;
}

export function seedSwarm(size = SWARM_SIZE): SwarmBot[] {
  const out: SwarmBot[] = [];
  let i = 0;
  for (const g of GUILDS) {
    for (let n = 0; n < g.count; n++) {
      const t = n / Math.max(g.count, 1);
      out.push({
        i,
        guild: g.id,
        a: t * Math.PI * 2 + i * 0.017,
        w: 0.00018 + (n % 7) * 0.00004,
        j: 0.86 + ((n * 13) % 11) * 0.012,
        slot: n,
      });
      i += 1;
    }
  }
  while (out.length < size) {
    const g = GUILDS[out.length % GUILDS.length]!;
    out.push({
      i: out.length,
      guild: g.id,
      a: out.length * 0.11,
      w: 0.00022,
      j: 0.9,
      slot: out.length,
    });
  }
  return out.slice(0, size);
}

function blankGuild(g: GuildDef): SwarmGuildSnap {
  return { long: 0, heat: 0.12, note: "ping…", score: 0, rttMs: 0, reported: 0 };
}

export function idleSwarm(): SwarmSnap {
  const guilds = Object.fromEntries(
    GUILDS.map((g) => [
      g.id,
      {
        long: Math.round(g.count * 0.5),
        heat: 0.2,
        note: "idle",
        score: 0,
        rttMs: 0,
        reported: g.count,
      },
    ]),
  ) as Record<GuildId, SwarmGuildSnap>;
  return {
    live: SWARM_SIZE,
    long: 150,
    kind: "hold",
    pair: null,
    grok: "Grok core idle — swarm on the rails",
    veto: false,
    rttMs: 0,
    reported: SWARM_SIZE,
    pending: false,
    guilds,
    debate: IDLE_DEBATE,
  };
}

export function startRoll(target: SwarmSnap): SwarmSnap {
  const guilds = Object.fromEntries(GUILDS.map((g) => [g.id, blankGuild(g)])) as Record<
    GuildId,
    SwarmGuildSnap
  >;
  return {
    live: SWARM_SIZE,
    long: 0,
    kind: "hold",
    pair: target.pair,
    grok: `Grok waiting — 0/${SWARM_SIZE} in`,
    veto: false,
    rttMs: 0,
    reported: 0,
    pending: true,
    guilds,
    debate: target.debate ?? IDLE_DEBATE,
  };
}

export function landGuild(
  rolling: SwarmSnap,
  target: SwarmSnap,
  id: GuildId,
  ms: number,
): SwarmSnap {
  const def = GUILD_BY_ID[id];
  const landed = { ...target.guilds[id]!, rttMs: ms, reported: def.count };
  const guilds = { ...rolling.guilds, [id]: landed };
  const reported = GUILDS.reduce((a, g) => a + guilds[g.id]!.reported, 0);
  const long = GUILDS.reduce((a, g) => a + guilds[g.id]!.long, 0);
  const pending = reported < SWARM_SIZE;
  const grok = pending
    ? `Grok waiting — ${reported}/${SWARM_SIZE} in · ${def.name} ${ms}ms`
    : `${target.grok} · swarm ${ms}ms`;
  return {
    ...rolling,
    guilds,
    reported,
    long,
    pending,
    rttMs: Math.max(rolling.rttMs, ms),
    grok,
    kind: pending ? "hold" : target.kind,
    veto: pending ? false : target.veto,
  };
}

export function finishRoll(target: SwarmSnap, pings: Record<GuildId, number>): SwarmSnap {
  const rttMs = Math.max(...GUILDS.map((g) => pings[g.id]!));
  const guilds = Object.fromEntries(
    GUILDS.map((g) => [
      g.id,
      { ...target.guilds[g.id]!, rttMs: pings[g.id]!, reported: g.count },
    ]),
  ) as Record<GuildId, SwarmGuildSnap>;
  return {
    ...target,
    guilds,
    rttMs,
    reported: SWARM_SIZE,
    pending: false,
    grok: `${target.grok} · swarm ${rttMs}ms`,
    debate: target.debate,
  };
}

export function tallySwarm(input: SwarmInput): SwarmSnap {
  const { pair, signal, ticker, volumes, positions, cash, equity } = input;
  const hasPos = positions.some((p) => p.pair === pair);
  const open = positions.length;
  const ch = ticker?.changePct ?? 0;

  const priceScore =
    signal.kind === "buy"
      ? 0.35 + signal.confidence * 0.55 + clamp(ch / 8, -0.2, 0.25)
      : signal.kind === "sell"
        ? -0.35 - signal.confidence * 0.5 + clamp(ch / 8, -0.25, 0.2)
        : clamp(ch / 6, -0.35, 0.35);
  const flow = readFlow(ticker, volumes);
  const liqScore = flow.ok ? 0.45 + (0.002 - flow.spreadPct) * 40 : -0.55;
  const hunt = hunterScore(pair, ticker, input.brain, hasPos, input.wire);
  const arbScore = clamp(hunt / 8, -0.85, 0.9);
  const cashRatio = equity > 0 ? cash / equity : 1;
  const invScore = hasPos
    ? clamp(0.15 - open * 0.08, -0.4, 0.3)
    : clamp(cashRatio * 0.7 - open / Math.max(input.maxPositions, 1) * 0.5, -0.6, 0.7);
  const lossUse = input.maxDailyLoss > 0 ? input.dayPnl / -input.maxDailyLoss : 0;
  const riskScore = clamp(
    0.35 - Math.max(lossUse, 0) * 1.1 - (open / Math.max(input.maxPositions, 1)) * 0.35,
    -1,
    0.8,
  );

  const scores: Record<GuildId, number> = {
    price: clamp(priceScore, -1, 1),
    liquidity: clamp(liqScore, -1, 1),
    arb: arbScore,
    inventory: invScore,
    risk: riskScore,
  };
  const notes: Record<GuildId, string> = {
    price:
      signal.kind === "hold"
        ? `watching 1m · RSI ${signal.rsi.toFixed(0)}`
        : `${signal.kind.toUpperCase()} · RSI ${signal.rsi.toFixed(0)} · ${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`,
    liquidity: flow.note,
    arb: hasPos ? "already in the lot" : `hunt ${hunt.toFixed(1)}`,
    inventory: hasPos
      ? `${open} lots · inventory on ${pair}`
      : `free ${Math.round(cashRatio * 100)}% · ${open} open`,
    risk:
      riskScore < -0.45
        ? "veto — book stress"
        : lossUse > 0.5
          ? "day loss climbing"
          : "book inside limits",
  };

  const guilds = Object.fromEntries(
    GUILDS.map((g) => {
      const score = scores[g.id];
      return [
        g.id,
        {
          long: lean(g.count, score),
          heat: 0.25 + Math.abs(score) * 0.75,
          note: notes[g.id],
          score,
          rttMs: 0,
          reported: g.count,
        },
      ];
    }),
  ) as Record<GuildId, SwarmGuildSnap>;

  const veto = scores.risk < -0.72;
  const long = GUILDS.reduce((a, g) => a + guilds[g.id]!.long, 0);
  const debate = runDebate({
    pair,
    setupKind: signal.kind,
    setupNote: notes.price,
    priceScore: scores.price,
    liqScore: scores.liquidity,
    arbScore: scores.arb,
    riskScore: scores.risk,
    flowOk: flow.ok,
    flowNote: flow.note,
    veto,
    tickerOk: Boolean(ticker),
    volumes,
    wire: input.wire,
    fearGreed: input.fearGreed ?? null,
  });
  const kind = debate.kind;
  const grok = debate.grok;

  return {
    live: SWARM_SIZE,
    long,
    kind,
    pair,
    grok,
    veto,
    rttMs: 0,
    reported: SWARM_SIZE,
    pending: false,
    guilds,
    debate,
  };
}
