import { hitSources, SOURCE_TOTAL } from "./sources.ts";
import type { PairId, SignalKind, WireItem } from "./types";

export type DebateRole = "setup" | "challenge" | "data" | "risk" | "merge";

export type DebateRound = {
  role: DebateRole;
  kind: SignalKind;
  note: string;
  kept: boolean;
};

export type Dissent = {
  kind: SignalKind;
  note: string;
  bots: number;
};

export type Debate = {
  rounds: DebateRound[];
  dissent: Dissent | null;
  sourcesLive: number;
  sourcesTotal: number;
  kind: SignalKind;
  grok: string;
};

export const IDLE_DEBATE: Debate = {
  rounds: [
    { role: "setup", kind: "hold", note: "waiting on a setup", kept: true },
    { role: "challenge", kind: "hold", note: "no challenge yet", kept: true },
    { role: "data", kind: "hold", note: "sources idle", kept: true },
    { role: "risk", kind: "hold", note: "book quiet", kept: true },
    { role: "merge", kind: "hold", note: "Grok idle — no first answer to distrust", kept: true },
  ],
  dissent: null,
  sourcesLive: 0,
  sourcesTotal: SOURCE_TOTAL,
  kind: "hold",
  grok: "Grok idle — swarm on the rails",
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function opp(kind: SignalKind): SignalKind {
  if (kind === "buy") return "sell";
  if (kind === "sell") return "buy";
  return "hold";
}

function wireLean(wire: WireItem[], pair: PairId): number {
  let n = 0;
  for (const w of wire) {
    if (w.pairs.length && !w.pairs.includes(pair) && w.kind !== "macro") continue;
    if (w.tone === "bull") n += 1;
    else if (w.tone === "bear") n -= 1;
  }
  return clamp(n / 4, -1, 1);
}

export function runDebate(input: {
  pair: PairId;
  setupKind: SignalKind;
  setupNote: string;
  priceScore: number;
  liqScore: number;
  arbScore: number;
  riskScore: number;
  flowOk: boolean;
  flowNote: string;
  veto: boolean;
  tickerOk: boolean;
  volumes: number[];
  wire: WireItem[];
  fearGreed: { value: number; label: string } | null;
}): Debate {
  const { pair } = input;
  const setupKind: SignalKind =
    input.setupKind !== "hold"
      ? input.setupKind
      : input.priceScore > 0.18
        ? "buy"
        : input.priceScore < -0.18
          ? "sell"
          : "hold";

  const lean = wireLean(input.wire, pair);
  const lastVol = input.volumes[input.volumes.length - 1] ?? 0;
  const avg =
    input.volumes.length > 4
      ? input.volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, input.volumes.length)
      : lastVol;
  const volSpike = avg > 0 && lastVol > avg * 1.6;

  const hits = hitSources({
    hasTicker: input.tickerOk,
    wireTitles: input.wire.map((w) => w.title),
    wireSources: input.wire.map((w) => w.source),
    fearGreed: Boolean(input.fearGreed),
    volSpike,
  });

  const contradicts =
    (setupKind === "buy" && lean < -0.15) ||
    (setupKind === "sell" && lean > 0.15) ||
    (setupKind === "buy" && !input.flowOk);

  const challengeKind = opp(setupKind);
  const challengeStrength = clamp(
    Math.abs(input.priceScore) * 0.25 +
      (contradicts ? 0.38 : 0.08) +
      (input.liqScore < 0 ? 0.22 : 0) +
      Math.abs(lean) * 0.25 +
      (volSpike ? 0.08 : 0),
    0,
    1,
  );

  const dissentBots =
    setupKind === "hold" ? 0 : Math.round(clamp(8 + challengeStrength * 82, 8, 90));
  const dissent: Dissent | null =
    setupKind === "hold"
      ? null
      : {
          kind: challengeKind,
          note:
            challengeKind === "sell"
              ? `challenge SELL — ${contradicts ? "data fights the setup" : "first hit is not enough"}`
              : `challenge BUY — ${contradicts ? "data fights the setup" : "first hit is not enough"}`,
          bots: dissentBots,
        };

  const dataKind: SignalKind = contradicts ? "hold" : setupKind;
  const dataNote = [
    `${hits.live}/${hits.total} live`,
    `${hits.market} tape`,
    `${hits.news} news`,
    `${hits.chain} chain`,
    `${hits.macro} macro`,
    contradicts ? "CONTRADICTION" : "aligned",
    input.flowNote,
  ].join(" · ");

  const riskKind: SignalKind = input.veto ? "hold" : input.riskScore < -0.35 ? "hold" : setupKind;
  const riskNote = input.veto
    ? "veto — book stress. Challenge kept."
    : input.riskScore < -0.35
      ? "risk leans halt. Challenge kept."
      : "book inside limits";

  const closeCall = challengeStrength >= 0.72 && Math.abs(input.priceScore) < 0.18;
  const mergeKind: SignalKind = input.veto
    ? "hold"
    : input.riskScore < -0.35
      ? "hold"
      : setupKind === "hold"
        ? "hold"
        : closeCall
          ? "hold"
          : setupKind;

  const mergeNote = dissent
    ? `Grok ${mergeKind.toUpperCase()} ${pair} — dissent kept (${dissent.kind.toUpperCase()} · ${dissent.bots} bots) · ${hits.live}/${hits.total} sources`
    : `Grok ${mergeKind.toUpperCase()} ${pair} · ${hits.live}/${hits.total} sources · no dissent`;

  const rounds: DebateRound[] = [
    { role: "setup", kind: setupKind, note: input.setupNote, kept: true },
    {
      role: "challenge",
      kind: challengeKind,
      note: dissent?.note ?? "no opposing ticket",
      kept: true,
    },
    { role: "data", kind: dataKind, note: dataNote, kept: true },
    { role: "risk", kind: riskKind, note: riskNote, kept: true },
    { role: "merge", kind: mergeKind, note: mergeNote, kept: true },
  ];

  return {
    rounds,
    dissent,
    sourcesLive: hits.live,
    sourcesTotal: hits.total,
    kind: mergeKind,
    grok: mergeNote,
  };
}
