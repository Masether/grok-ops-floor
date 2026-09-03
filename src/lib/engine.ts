import { AGENT_BY_ID, AGENTS } from "./agents";
import { emitPulse } from "./bus";
import { uid, px, money } from "./format";
import { macdHist, readScalp } from "./indicators";
import { fetchOhlc, fetchTickers, fetchUsdUniverse } from "./kraken-api";
import { PAIR_BY_ID, getPair, registerPair } from "./kraken";
import { budgetStake } from "./budget-size";
import { fairValue, mispricing, pricerQuiet } from "./pricer";
import { rankScout } from "./scout";
import { AWAY_MAX_MS, AWAY_MIN_MS, replayAway, type AwayBar, type AwayReport } from "./catch-up";
import { getLiveVenue } from "./venues";
import { connectTickerFeed } from "./kraken-ws";
import { learnFromClose, mergeAssetMemory, pairMinConf, studyFromCandles } from "./learn";
import { SCALP, scalpManage } from "./scalp";
import {
  asPlaybook,
  bookStops,
  dcaManage,
  GRID,
  DCA,
  gridManage,
  macdLane,
  normalizePlaybooks,
  pickPlaybook,
  type BookAction,
  type PlaybookId,
} from "./playbook";
import { makeSimCandles, stepSim } from "./sim-feed";
import { hunterScore, readFlow, readRegime, usdOnBook } from "./specialists";
import { livePositions, liveSleeve, MIN_LIVE_TICKET } from "./live-budget";
import { GUILDS, SWARM_SIZE, finishRoll, landGuild, pingSwarm, startRoll, tallySwarm } from "./swarm";
import { fetchWire } from "./wire-api";
import { sessionEnded } from "./session";
import { markEquity, useFloor, flushFloorPersist, type FloorState } from "./store";
import {
  toastDailyLossHalt,
  toastKillSwitch,
  toastLiveReject,
  toastOrderFill,
  toastSessionEnded,
  toastVenueBlock,
  toastAwayReplay,
  toastSweep,
} from "./trade-toast";
import type {
  AgentId,
  Order,
  PairId,
  PipelineStage,
  Position,
  QueueItem,
  TapeEvent,
  Ticker,
} from "./types";

const STAGE_CYCLE: PipelineStage[] = [
  "brief",
  "split",
  "handout",
  "tool",
  "second",
  "signed",
];

const lastSignalAt = new Map<PairId, number>();
let running = false;
let timers: number[] = [];
let stopWs: (() => void) | null = null;
let lastEquitySample = 0;
let restFails = 0;
let pipelineLock: Promise<void> = Promise.resolve();
const evaluating = new Set<PairId>();
let evalBusy = 0;
const lastEvalAt = new Map<PairId, number>();
const flattening = new Set<string>();
let demoLock = false;
let lastStopCheck = 0;
const pendingTickers = new Map<PairId, Ticker>();
let tickerFlush: number | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function rollInSwarm(vote: ReturnType<typeof tallySwarm>, pair: PairId, label: string) {
  const pings = pingSwarm();
  const rtt = Math.max(...GUILDS.map((g) => pings[g.id]!));
  if (prefersReduced()) {
    const done = finishRoll(vote, pings);
    patch({ swarm: done, grokNote: done.grok });
    return done;
  }
  let rolling = startRoll(vote);
  patch({ swarm: rolling, grokNote: rolling.grok });
  bumpAgent("dispatcher", `ping ${label}`, 0.7);
  pushEvent({
    agent: "dispatcher",
    stage: "brief",
    pair,
    title: `SWARM PING ${label}`,
    detail: `Grok waiting on ${SWARM_SIZE} bots`,
    tone: "info",
  });
  const order = GUILDS.slice().sort((a, b) => pings[a.id]! - pings[b.id]!);
  let elapsed = 0;
  for (const g of order) {
    const wait = Math.max(0, pings[g.id]! - elapsed);
    await sleep(wait);
    elapsed = pings[g.id]!;
    rolling = landGuild(rolling, vote, g.id, pings[g.id]!);
    patch({ swarm: rolling, grokNote: rolling.grok });
    bumpAgent(g.lead, `${g.name} ${pings[g.id]}ms`, rolling.guilds[g.id]!.heat);
    emitPulse({ from: g.lead, to: "dispatcher" });
    pushEvent({
      agent: g.lead,
      next: "dispatcher",
      stage: "brief",
      pair,
      title: `${g.name} IN · ${g.count} bots · ${pings[g.id]}ms`,
      detail: rolling.guilds[g.id]!.note,
      tone: "info",
    });
  }
  await sleep(48);
  const done = finishRoll(vote, pings);
  patch({ swarm: done, grokNote: done.grok });
  bumpAgent("dispatcher", `grok ${done.kind} ${rtt}ms`, 1);
  return done;
}

async function walkDebate(vote: ReturnType<typeof tallySwarm>, pair: PairId, label: string) {
  const steps: { role: (typeof vote.debate.rounds)[number]["role"]; stage: PipelineStage; agent: AgentId }[] = [
    { role: "setup", stage: "brief", agent: "scanner" },
    { role: "challenge", stage: "split", agent: "hunter" },
    { role: "data", stage: "handout", agent: "flow" },
    { role: "risk", stage: "tool", agent: "sentinel" },
    { role: "merge", stage: "second", agent: "dispatcher" },
  ];
  const pause = prefersReduced() ? 0 : 90;
  for (const step of steps) {
    const round = vote.debate.rounds.find((r) => r.role === step.role);
    if (!round) continue;
    setStage(step.stage);
    bumpAgent(step.agent, `${step.role} ${round.kind}`, 0.95);
    patch({ grokNote: round.note });
    pushEvent({
      agent: step.agent,
      next: "dispatcher",
      stage: step.stage,
      pair,
      title: `${step.role.toUpperCase()} ${round.kind.toUpperCase()} ${label}`,
      detail: round.note,
      tone:
        step.role === "challenge"
          ? "warn"
          : round.kind === "buy"
            ? "good"
            : round.kind === "sell"
              ? "warn"
              : "info",
    });
    emitPulse({ from: step.agent, to: "dispatcher" });
    await sleep(pause);
  }
  patch({ swarm: vote, grokNote: vote.grok });
  if (vote.debate.dissent) {
    pushEvent({
      agent: "dispatcher",
      stage: "second",
      pair,
      title: `DISSENT KEPT · ${vote.debate.dissent.kind.toUpperCase()} · ${vote.debate.dissent.bots} bots`,
      detail: vote.debate.dissent.note,
      tone: "warn",
    });
  }
}

function patch(partial: Partial<FloorState>) {
  if (!running) return;
  useFloor.setState(partial);
}

function bumpAgent(id: AgentId, action: string, heat = 1) {
  const s = useFloor.getState();
  const prev = s.agents[id];
  if (!prev) return;
  const spark = prev.spark.slice(-23);
  spark.push(0.35 + Math.random() * 0.65);
  patch({
    agents: {
      ...s.agents,
      [id]: {
        ...prev,
        status: s.floorOpen ? "working" : "halted",
        heat,
        lastAction: action,
        lastTs: Date.now(),
        handled: prev.handled + 1,
        delayMs: 24 + Math.random() * 90,
        spark,
      },
    },
  });
}

function coolAgents(dt: number) {
  const s = useFloor.getState();
  let changed = false;
  const next = { ...s.agents };
  for (const a of AGENTS) {
    const cur = next[a.id];
    if (!cur) continue;
    const heat = Math.max(0.08, cur.heat - dt * 0.55);
    const status = !s.floorOpen ? "halted" : heat > 0.45 ? cur.status : "idle";
    if (heat !== cur.heat || status !== cur.status) {
      next[a.id] = { ...cur, heat, status };
      changed = true;
    }
  }
  if (changed) patch({ agents: next });
}

function pushEvent(e: Omit<TapeEvent, "id" | "ts">) {
  const event: TapeEvent = { ...e, id: uid("tape"), ts: Date.now() };
  const events = [event, ...useFloor.getState().events].slice(0, 80);
  patch({
    events,
    briefs: useFloor.getState().briefs + (e.stage === "brief" ? 1 : 0),
    handoff: e.next ? { from: e.agent, to: e.next } : useFloor.getState().handoff,
  });
  if (e.next) emitPulse({ from: e.agent, to: e.next, color: AGENT_BY_ID[e.agent].color });
}

function pushQueue(item: Omit<QueueItem, "id" | "ts">) {
  const q: QueueItem = { ...item, id: uid("q"), ts: Date.now() };
  patch({ queue: [q, ...useFloor.getState().queue].slice(0, 24) });
}

function applySessionEnd() {
  const s = useFloor.getState();
  if (!sessionEnded(s.sessionEndsAt)) return;
  const already = !s.floorOpen && !s.autoTrade;
  patch({ floorOpen: false, autoTrade: false, sessionEndsAt: null });
  if (already) return;
  bumpAgent("sentinel", "session ended", 1);
  pushEvent({
    agent: "sentinel",
    stage: "second",
    title: "SESSION ENDED",
    detail: "Clock ran out — new entries stopped, book kept. Stops still watch open lots.",
    tone: "warn",
  });
  toastSessionEnded();
}

function bookNeedsProtect(s: FloorState): boolean {
  return s.launched && (s.floorOpen || s.positions.length > 0);
}

function setStage(stage: PipelineStage) {
  patch({ stage });
}

function applyTicker(t: Ticker) {
  pendingTickers.set(t.pair, t);
  if (tickerFlush != null) return;
  tickerFlush = window.setTimeout(flushTickers, 160);
}

function flushTickers() {
  tickerFlush = null;
  if (!running || pendingTickers.size === 0) {
    pendingTickers.clear();
    return;
  }
  const s = useFloor.getState();
  const tickers = { ...s.tickers };
  let changed = false;
  for (const [pair, t] of pendingTickers) {
    const prev = tickers[pair];
    if (
      prev &&
      prev.last === t.last &&
      prev.bid === t.bid &&
      prev.ask === t.ask &&
      prev.changePct === t.changePct
    ) {
      continue;
    }
    tickers[pair] = t;
    changed = true;
  }
  pendingTickers.clear();
  if (!changed) return;
  const positions =
    s.positions.length === 0
      ? s.positions
      : s.positions.map((p) => {
          const last = tickers[p.pair]?.last;
          return last != null && last !== p.mark ? { ...p, mark: last } : p;
        });
  patch({
    tickers,
    positions,
    lastFeedAt: Date.now(),
    ticks: s.ticks + 1,
  });
  maybeCheckStops();
}

function sampleEquity(force = false) {
  const now = Date.now();
  if (!force && now - lastEquitySample < 2500) return;
  lastEquitySample = now;
  const s = useFloor.getState();
  const equity = markEquity(s);
  const cost = s.positions.reduce((a, p) => a + p.entry * p.qty, 0);
  const posValue = equity - s.cash;
  const point = {
    t: now,
    equity,
    cash: s.cash,
    unrealized: posValue - cost,
    scanner: s.agents.scanner?.heat ?? 0.2,
    signal: s.agents.signal?.heat ?? 0.2,
    risk: s.agents.risk?.heat ?? 0.2,
    runner: s.agents.runner?.heat ?? 0.2,
  };
  const hist = s.equityHistory;
  const last = hist[hist.length - 1];
  if (last && now - last.t < 2000 && !force) return;
  patch({ equityHistory: [...hist, point].slice(-90) });
}

function seedHistory() {
  const s = useFloor.getState();
  if (s.equityHistory.length > 0) return;
  const now = Date.now();
  const cash = s.cash;
  const points = Array.from({ length: 28 }, (_, i) => ({
    t: now - (28 - i) * 3000,
    equity: cash,
    cash,
    unrealized: 0,
    scanner: 0.18 + Math.random() * 0.2,
    signal: 0.16 + Math.random() * 0.22,
    risk: 0.14 + Math.random() * 0.18,
    runner: 0.12 + Math.random() * 0.2,
  }));
  patch({ equityHistory: points });
}

async function refreshTickersRest() {
  const s = useFloor.getState();
  try {
    const rows = await fetchTickers({ data: { pairs: s.pairs } });
    restFails = 0;
    const tickers = { ...s.tickers };
    for (const t of rows) tickers[t.pair] = t;
    const positions = s.positions.map((p) => ({
      ...p,
      mark: tickers[p.pair]?.last ?? p.mark,
    }));
    patch({
      tickers,
      positions,
      feedOk: true,
      feedError: null,
      feedSource: "kraken",
      lastFeedAt: Date.now(),
      ticks: s.ticks + 1,
    });
    bumpAgent("scanner", `tape ${rows.length} pairs`, 0.7);
    return tickers;
  } catch (err) {
    restFails += 1;
    if (restFails >= 2) {
      runSimTick();
      patch({
        feedOk: true,
        feedSource: "sim",
        feedError: "Kraken public tape unreachable — sim book",
      });
      bumpAgent("sentinel", "sim book online", 0.8);
      return useFloor.getState().tickers;
    }
    patch({
      feedOk: false,
      feedError: err instanceof Error ? err.message : "feed down",
    });
    bumpAgent("sentinel", "feed degraded", 1);
    pushQueue({
      title: "FEED DEGRADED",
      detail: err instanceof Error ? err.message : "Kraken public tape failed",
      severity: "stall",
    });
    return s.tickers;
  }
}

function runSimTick() {
  const s = useFloor.getState();
  const tickers = { ...s.tickers };
  for (const pair of s.pairs) {
    tickers[pair] = stepSim(pair);
  }
  const positions = s.positions.map((p) => ({
    ...p,
    mark: tickers[p.pair]?.last ?? p.mark,
  }));
  patch({
    tickers,
    positions,
    lastFeedAt: Date.now(),
    ticks: s.ticks + 1,
    feedOk: true,
    feedSource: "sim",
  });
}

async function runScout() {
  const s = useFloor.getState();
  if (!s.launched || !s.floorOpen) return;
  if (s.lastScoutAt && Date.now() - s.lastScoutAt < 10 * 60_000) return;
  bumpAgent("hunter", "scout 800+ books", 1);
  try {
    const res = await fetchUsdUniverse();
    for (const def of res.defs) registerPair(def);
    const { kept, dropped, scanned } = rankScout(res.hits);
    const hot = kept
      .map((h) => (getPair(h.pair) ? (h.pair as PairId) : null))
      .filter((id): id is PairId => Boolean(id));
    patch({
      scoutHot: hot,
      scoutScanned: scanned,
      scoutDropped: dropped,
      lastScoutAt: Date.now(),
    });
    bumpAgent("hunter", `scout kept ${hot.length} / dropped ${dropped}`, 0.9);
    pushEvent({
      agent: "hunter",
      stage: "brief",
      title: `SCOUT ${scanned}`,
      detail: `Kept ${hot.length} ≥$10k liq · dropped ${dropped}`,
      tone: "info",
    });
  } catch (err) {
    bumpAgent("hunter", "scout miss", 0.5);
    patch({ lastScoutAt: Date.now() });
    void err;
  }
}

async function refreshOhlcAll() {
  const s = useFloor.getState();
  if (s.pairs.length === 0) return;
  const useSim = s.feedSource === "sim";
  const interval = 1;
  const open = new Set(s.positions.map((p) => p.pair));
  const universe = [...new Set([...s.pairs, ...(s.scoutHot ?? []), ...open])];
  const ranked = universe
    .map((pair) => ({
      pair,
      score: hunterScore(pair, s.tickers[pair], s.brain, open.has(pair), s.wire),
    }))
    .sort((a, b) => b.score - a.score);

  const take = s.mode === "paper" ? 8 : 6;
  const picked: typeof ranked = [];
  for (const row of ranked) {
    if (open.has(row.pair) || picked.length < take) picked.push(row);
  }
  const inspect = s.inspectPair;
  if (inspect && universe.includes(inspect) && !picked.some((row) => row.pair === inspect)) {
    picked.push({ pair: inspect, score: 0 });
  }

  const top = picked[0];
  if (top) {
    const def = getPair(top.pair) ?? PAIR_BY_ID[top.pair];
    bumpAgent(
      "hunter",
      `hunt ${def.label} · ${def.sleeve} · ${top.score.toFixed(1)}`,
      0.9,
    );
  }

  await Promise.all(
    picked.map(async (row) => {
      try {
        const candles = useSim
          ? makeSimCandles(row.pair, 120, interval * 60_000)
          : await fetchOhlc({ data: { pair: row.pair, interval } });
        if (candles.length < 30) return;
        patch({ candles: { ...useFloor.getState().candles, [row.pair]: candles } });
        enqueueEval(row.pair, candles);
      } catch (err) {
        if (!useSim) {
          const candles = makeSimCandles(row.pair);
          patch({ candles: { ...useFloor.getState().candles, [row.pair]: candles } });
          enqueueEval(row.pair, candles);
          return;
        }
        bumpAgent("sentinel", `ohlc miss ${row.pair}`, 0.8);
        pushQueue({
          title: "TOOL RUN STALLED",
          detail: `${row.pair} candles: ${err instanceof Error ? err.message : "error"}`,
          severity: "stall",
          pair: row.pair,
        });
      }
    }),
  );
  await pipelineLock;
}

function enqueueEval(pair: PairId, candles: { close: number; volume: number }[]) {
  if (!running || evaluating.has(pair) || evalBusy >= 2) return;
  const last = lastEvalAt.get(pair) ?? 0;
  if (Date.now() - last < 6_000) return;
  evalBusy += 1;
  lastEvalAt.set(pair, Date.now());
  void evaluatePair(pair, candles)
    .catch(() => {})
    .finally(() => {
      evalBusy = Math.max(0, evalBusy - 1);
    });
}

async function evaluatePair(pair: PairId, candles: { close: number; volume: number }[]) {
  const s0 = useFloor.getState();
  if (!running || !s0.launched || !s0.floorOpen) return;
  evaluating.add(pair);
  try {
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);
    const brain = s0.brain;
    const read = readScalp(closes, volumes, brain);
    const ticker = s0.tickers[pair];
    const price = ticker?.last ?? closes[closes.length - 1]!;
    const label = getPair(pair)?.label ?? PAIR_BY_ID[pair]?.label ?? pair;
    const sleeve = (getPair(pair) ?? PAIR_BY_ID[pair])?.sleeve ?? "heat";
    const minConf =
      s0.mode === "paper"
        ? Math.min(pairMinConf(brain, pair), SCALP.minConf)
        : Math.min(pairMinConf(brain, pair), SCALP.minConf + 0.04);
    const equity = markEquity(s0);
    const vote = await rollInSwarm(
      tallySwarm({
        pair,
        signal: { kind: read.kind, confidence: read.confidence, rsi: read.rsi },
        ticker,
        volumes,
        positions: s0.positions,
        cash: s0.cash,
        equity,
        dayPnl: equity - (s0.dayStartEquity || s0.startingCash),
        maxDailyLoss: (s0.dayStartEquity || s0.startingCash) * s0.risk.maxDailyLossPct,
        maxPositions: s0.risk.maxPositions,
        brain,
        wire: s0.wire,
        fearGreed: s0.fearGreed,
      }),
      pair,
      label,
    );
    const grokKind = vote.kind;
    const grokConf =
      grokKind === read.kind ? read.confidence : grokKind === "hold" ? 0.22 : Math.max(read.confidence, 0.52);
    const grokReason = vote.grok;
    await walkDebate(vote, pair, label);

    const signal = {
      id: uid("sig"),
      pair,
      kind: grokKind,
      confidence: grokConf,
      reason: grokReason,
      rsi: read.rsi,
      emaFast: read.emaFast,
      emaSlow: read.emaSlow,
      macdHist: read.macdHist,
      price,
      ts: Date.now(),
      setup: read.setup,
    };
    patch({ signals: [signal, ...useFloor.getState().signals].slice(0, 40) });
    await sleep(160);

    const ops = s0.opsMode ?? (s0.autoTrade ? "auto" : "paper");
    if (ops === "learn") {
      bumpAgent("hunter", `study ${label}`, 0.95);
      bumpAgent("signal", grokKind.toUpperCase(), 0.9);
      bumpAgent("regime", "pattern walk", 0.8);
      bumpAgent("flow", "tape memory", 0.75);
      const candlesFull = useFloor.getState().candles[pair];
      if (candlesFull && candlesFull.length >= 24) {
        const mem = studyFromCandles(pair, candlesFull);
        patch({ brain: mergeAssetMemory(useFloor.getState().brain, mem) });
      }
      pushEvent({
        agent: "archivist",
        stage: "handout",
        pair,
        title: `STUDY ${label}`,
        detail: `${read.reason} · stored · no ticket`,
        tone: "info",
      });
      bumpAgent("archivist", "pattern stored", 0.85);
      return;
    }

    const stNow = useFloor.getState();
    const paper = stNow.mode === "paper";
    const liveNow = stNow.mode === "live";
    const liveNowSleeve = liveNow
      ? liveSleeve({
          liveBudget: stNow.liveBudget,
          liveBalance: stNow.liveBalance,
          positions: stNow.positions,
          tickers: stNow.tickers,
        })
      : null;
    const bookNow = liveNow ? livePositions(stNow.positions) : stNow.positions;
    const hasPos = bookNow.some((p) => p.pair === pair);
    const haltBase = liveNow
      ? (liveNowSleeve?.budget ?? stNow.liveBudget)
      : stNow.dayStartEquity || stNow.startingCash;
    const haltCap = haltBase * stNow.risk.maxDailyLossPct;
    const dayNow = liveNow
      ? (liveNowSleeve?.equity ?? 0) - haltBase
      : markEquity(stNow) - haltBase;
    const halted = haltCap > 0 && dayNow <= -haltCap;

    let ticketKind: "buy" | "sell" | "hold" =
      grokKind !== "hold" ? grokKind : read.kind !== "hold" ? read.kind : "hold";
    if (ticketKind === "sell" && !hasPos) ticketKind = "hold";
    const ticketConf = Math.max(read.confidence, grokKind === read.kind ? grokConf : 0);
    const histPrev = closes.length > 28 ? macdHist(closes.slice(0, -1)) : read.macdHist;
    const lane = macdLane(read.macdHist, histPrev);
    const existingLot = bookNow.find((p) => p.pair === pair);
    const lastBuy = stNow.orders.find(
      (o) => o.pair === pair && o.status === "filled" && o.side === "buy",
    );
    const dipFromEntry =
      existingLot && existingLot.entry > 0
        ? Math.max(0, (existingLot.entry - (ticker?.last ?? existingLot.mark)) / existingLot.entry)
        : 0;
    const playbook = pickPlaybook({
      enabled: normalizePlaybooks(stNow.playbooks),
      sleeve,
      lane,
      kind: ticketKind,
      rsi: signal.rsi,
      changePct: ticker?.changePct ?? 0,
      hasPos: Boolean(existingLot),
      existingBook: existingLot?.book,
      dipFromEntry,
      adds: existingLot?.adds ?? 1,
      msSinceAdd: lastBuy ? Date.now() - lastBuy.ts : 1e12,
    });
    if (!playbook) {
      ticketKind = "hold";
    } else if (playbook !== "scalp") {
      ticketKind = "buy";
    }

    if (playbook && playbook !== "scalp" && ticketKind === "buy") {
      const fair = fairValue(closes);
      const gap = mispricing(price, fair);
      if (pricerQuiet(gap, sleeve)) {
        bumpAgent("signal", `pricer quiet ${(gap * 100).toFixed(1)}%`, 0.4);
        ticketKind = "hold";
      }
    }

    patch({
      signals: [
        { ...signal, kind: ticketKind === "hold" ? grokKind : ticketKind, confidence: ticketConf },
        ...useFloor.getState().signals.filter((x) => x.id !== signal.id),
      ].slice(0, 40),
    });

    if ((playbook === "grid" || playbook === "dca") && sleeve === "heat") {
      bumpAgent("hunter", `${playbook} skips heat`, 0.4);
      return;
    }

    if (sleeve === "heat" && ticketKind === "buy" && (ticker?.changePct ?? 0) < 0.4) {
      bumpAgent("hunter", "heat flat", 0.55);
      pushEvent({
        agent: "hunter",
        next: "archivist",
        stage: "handout",
        pair,
        title: `HEAT FLAT ${label}`,
        detail: `${px(price)} · 24h ${ticker?.changePct?.toFixed(2) ?? "?"}%. Need a tick up`,
        tone: "info",
      });
      return;
    }

    if (
      playbook === "scalp" &&
      ticketKind === "buy" &&
      sleeve === "core" &&
      (ticker?.changePct ?? 0) < -1.2 &&
      !read.reason.includes("cross")
    ) {
      bumpAgent("hunter", "core dump — skip", 0.5);
      pushEvent({
        agent: "hunter",
        next: "archivist",
        stage: "handout",
        pair,
        title: `SKIP DUMP ${label}`,
        detail: `24h ${ticker?.changePct?.toFixed(2) ?? "?"}%. Waiting for a turn`,
        tone: "info",
      });
      return;
    }

    if (halted || (vote.veto && !paper) || ticketKind === "hold" || ticketConf < minConf) {
      setStage("tool");
      bumpAgent("risk", vote.veto ? "swarm veto" : "no ticket", 0.35);
      pushEvent({
        agent: "dispatcher",
        next: "archivist",
        stage: "handout",
        pair,
        title: vote.veto || halted ? `GROK VETO ${label}` : `HOLD ${label}`,
        detail: halted ? "daily halt — no new tickets" : grokReason,
        tone: vote.veto || halted ? "warn" : "info",
      });
      bumpAgent("archivist", "journal hold", 0.4);
      emitPulse({ from: "signal", to: "archivist" });
      return;
    }

    pushEvent({
      agent: "signal",
      next: "regime",
      stage: "handout",
      pair,
      title: `${ticketKind.toUpperCase()} ${label}`,
      detail: `${grokReason} · ${read.reason}`,
      tone: ticketKind === "buy" ? "good" : "warn",
    });

    setStage("tool");
    const regime = readRegime(closes);
    bumpAgent("regime", regime.state, 0.9);
    emitPulse({ from: "signal", to: "regime" });
    await sleep(140);
    if (ticketKind === "buy" && !regime.allowBuy && !paper && ticketConf < 0.4) {
      bumpAgent("regime", "fade blocked", 1);
      pushQueue({
        title: "REGIME BLOCK",
        detail: `${label}: ${regime.note}`,
        severity: "playbook",
        pair,
      });
      pushEvent({
        agent: "regime",
        next: "archivist",
        stage: "tool",
        pair,
        title: "regime said no",
        detail: regime.note,
        tone: "warn",
      });
      bumpAgent("archivist", "journal regime", 0.5);
      return;
    }

    const flow = readFlow(ticker, volumes);
    bumpAgent("flow", flow.ok ? "book clean" : "thin book", flow.ok ? 0.7 : 1);
    emitPulse({ from: "regime", to: "flow" });
    await sleep(120);
    if (!flow.ok && ticketKind === "buy") {
      const hard = !paper && (s0.mode === "live" || flow.spreadPct > 0.004);
      if (hard) {
        pushQueue({
          title: "FLOW BLOCK",
          detail: `${label}: ${flow.note}`,
          severity: "reject",
          pair,
        });
        pushEvent({
          agent: "flow",
          next: "archivist",
          stage: "tool",
          pair,
          title: "flow said no",
          detail: flow.note,
          tone: "warn",
        });
        return;
      }
      bumpAgent("flow", "paper haircut", 0.8);
    }

    bumpAgent("risk", "size check", 1);
    emitPulse({ from: "flow", to: "risk" });
    await sleep(160);

    const verdict = sizeTicket(pair, ticketKind === "buy" ? "buy" : "sell", price, ticketConf, playbook ?? "scalp");
    if (!verdict.ok) {
      bumpAgent("risk", verdict.why, 0.9);
      pushQueue({
        title: "RISK REJECT",
        detail: `${label}: ${verdict.why}`,
        severity: "reject",
        pair,
      });
      pushEvent({
        agent: "risk",
        next: "archivist",
        stage: "tool",
        pair,
        title: "ticket killed",
        detail: verdict.why,
        tone: "warn",
      });
      bumpAgent("archivist", "journal reject", 0.5);
      return;
    }

    bumpAgent("treasury", "cash check", 0.9);
    emitPulse({ from: "risk", to: "treasury" });
    await sleep(120);
    const purse = workingPurse();
    if (!purse.ok) {
      bumpAgent("treasury", purse.why, 1);
      pushQueue({
        title: "TREASURY BLOCK",
        detail: purse.why,
        severity: "empty",
        pair,
      });
      pushEvent({
        agent: "treasury",
        next: "archivist",
        stage: "tool",
        pair,
        title: "wallet not ready",
        detail: purse.why,
        tone: "warn",
      });
      return;
    }

    setStage("second");
    bumpAgent("sentinel", "second read", 0.85);
    emitPulse({ from: "treasury", to: "sentinel" });
    await sleep(180);

    const st = useFloor.getState();
    const dayPnl = markEquity(st) - st.dayStartEquity;
    const maxLoss = st.dayStartEquity * st.risk.maxDailyLossPct;
    if (dayPnl < -maxLoss) {
      bumpAgent("sentinel", "daily loss halt", 1);
      pushQueue({
        title: "PLAYBOOK HALT",
        detail: "Daily loss limit hit — runner is blocked",
        severity: "playbook",
      });
      pushEvent({
        agent: "sentinel",
        stage: "second",
        pair,
        title: "second read FAIL",
        detail: "max daily loss",
        tone: "bad",
      });
      toastDailyLossHalt();
      return;
    }

    const lastAt = lastSignalAt.get(pair) ?? 0;
    const cooldown = st.mode === "paper" ? SCALP.cooldownMs : Math.min(st.risk.cooldownMs, 45_000);
    if (Date.now() - lastAt < cooldown) {
      bumpAgent("sentinel", "cooldown", 0.6);
      pushQueue({
        title: "COOLDOWN",
        detail: `${label} already worked this window`,
        severity: "playbook",
        pair,
      });
      return;
    }

    setStage("signed");
    lastSignalAt.set(pair, Date.now());
    bumpAgent("runner", `${verdict.side} ${label}`, 1);
    emitPulse({ from: "sentinel", to: "runner" });
    patch({ handoff: { from: "sentinel", to: "runner" } });

    const order: Order = {
      id: uid("ord"),
      pair,
      side: verdict.side,
      qty: verdict.qty,
      price,
      status: "queued",
      mode: st.liveArmed ? "live" : "paper",
      reason: `${(playbook ?? "scalp").toUpperCase()} · MACD ${lane} · ${read.reason}`,
      book: playbook ?? "scalp",
      ts: Date.now(),
    };

    if (st.liveArmed && !st.autoTrade) {
      patch({ pendingLive: order });
      pushEvent({
        agent: "runner",
        next: "archivist",
        stage: "signed",
        pair,
        title: "LIVE ticket waiting",
        detail: "Manual confirm required",
        tone: "warn",
      });
      return;
    }

    if (st.liveArmed && (!st.keys.apiKey || !st.keys.apiSecret)) {
      pushQueue({
        title: "LIVE NOT ARMED",
        detail: "Connect Kraken keys and arm live before the runner hits the book",
        severity: "empty",
        pair,
      });
      bumpAgent("runner", "live blocked", 0.7);
      return;
    }

    if (!st.autoTrade && st.mode === "paper") {
      patch({ pendingLive: order });
      pushEvent({
        agent: "runner",
        stage: "signed",
        pair,
        title: "ticket on the blotter",
        detail: "Auto-trade off — confirm to fill",
        tone: "warn",
      });
      return;
    }

    await executeOrder(order);
  } finally {
    evaluating.delete(pair);
  }
}

function workingPurse(): { ok: true; cash: number } | { ok: false; why: string } {
  const s = useFloor.getState();
  const live = s.liveArmed || s.mode === "live";
  if (!live) return { ok: true, cash: s.cash };
  if (!s.keys.apiKey || !s.keys.apiSecret) {
    return { ok: false, why: "no Kraken keys — paste them in settings" };
  }
  if (!s.liveArmed) return { ok: false, why: "live runner is not armed" };
  if (!s.liveBalance) return { ok: false, why: "treasury has not read the Kraken wallet yet" };
  const sleeve = liveSleeve({
    liveBudget: s.liveBudget,
    liveBalance: s.liveBalance,
    positions: s.positions,
    tickers: s.tickers,
  });
  if (sleeve.usd < 12 && sleeve.usdt >= 12) {
    return {
      ok: false,
      why: `USDT ${sleeve.usdt.toFixed(0)} is on Kraken — convert it to USD there. This book spends USD.`,
    };
  }
  if (sleeve.venue < 15) return { ok: false, why: "deposit $200 USD on Kraken" };
  if (sleeve.cash < MIN_LIVE_TICKET) {
    return {
      ok: false,
      why: `budget $${sleeve.budget.toFixed(0)} is fully in lots — wait for a close`,
    };
  }
  return { ok: true, cash: sleeve.cash };
}

function sizeTicket(
  pair: PairId,
  side: "buy" | "sell",
  price: number,
  confidence: number,
  playbook: PlaybookId,
): { ok: true; qty: number; side: "buy" | "sell" } | { ok: false; why: string } {
  const s = useFloor.getState();
  const live = s.liveArmed || s.mode === "live";
  const sleeve = live
    ? liveSleeve({
        liveBudget: s.liveBudget,
        liveBalance: s.liveBalance,
        positions: s.positions,
        tickers: s.tickers,
      })
    : null;
  const book = live ? livePositions(s.positions) : s.positions;
  const cash = live ? (sleeve?.cash ?? 0) : s.cash;
  const existing = book.find((p) => p.pair === pair);
  const def = getPair(pair) ?? PAIR_BY_ID[pair];
  if (!def) return { ok: false, why: "unknown pair" };
  const bias = s.brain.pairBias[pair] ?? 0;

  if (side === "sell") {
    if (!existing) return { ok: false, why: "no inventory to sell" };
    return { ok: true, qty: existing.qty, side: "sell" };
  }

  if (existing && playbook === "scalp") return { ok: false, why: "already long this pair" };
  if (existing && playbook !== "scalp") {
    const cap = playbook === "grid" ? GRID.maxAdds : DCA.maxAdds;
    if ((existing.adds ?? 1) >= cap) return { ok: false, why: "max adds on this pair" };
  }
  if (!existing && book.length >= s.risk.maxPositions) {
    return { ok: false, why: "max positions open" };
  }
  if (s.brain.enabled && bias < -0.35) {
    return { ok: false, why: "brain retired this pair" };
  }
  const sleeveKind = def.sleeve;
  if (playbook !== "scalp" && sleeveKind === "heat") {
    return { ok: false, why: `${playbook} book skips memes` };
  }
  const wr =
    s.brain.samples > 8 ? s.brain.wins / s.brain.samples : Math.min(0.62, 0.46 + confidence * 0.2);
  const payoff = s.risk.takePct / Math.max(s.risk.stopPct, 1e-6);
  const remaining = live ? cash : Math.min(cash, 100);
  const usd = budgetStake({
    remaining,
    confidence,
    pWin: wr,
    payoff,
    heat: sleeveKind === "heat",
  });
  if (!(usd > 0)) return { ok: false, why: "under min ticket — wait for cash in the $200 cap" };
  let qty = usd / price;
  let notional = qty * price;
  if (live && notional < MIN_LIVE_TICKET && cash >= MIN_LIVE_TICKET) {
    qty = MIN_LIVE_TICKET / price;
    notional = MIN_LIVE_TICKET;
  }
  if (notional < 10) return { ok: false, why: "size below min ticket" };
  if (notional > cash * 0.98) return { ok: false, why: live ? "over live budget" : "not enough cash" };
  const rounded = Number(qty.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
  if (rounded < def.ordermin) return { ok: false, why: "below Kraken ordermin" };
  return { ok: true, qty: rounded, side: "buy" };
}

let fillChain: Promise<void> = Promise.resolve();

export function executeOrder(order: Order): Promise<void> {
  const run = fillChain.then(() => executeOrderNow(order));
  fillChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function executeOrderNow(order: Order) {
  const s = useFloor.getState();
  const live = Boolean(s.liveArmed && s.keys.apiKey && s.keys.apiSecret && order.mode === "live");
  if (s.liveArmed || order.mode === "live") {
    if (!live) {
      const rejected: Order = {
        ...order,
        mode: "live",
        status: "rejected",
        reason: "Live not armed — paper cash is parked",
      };
      patch({ orders: [rejected, ...useFloor.getState().orders].slice(0, 80) });
      toastLiveReject(order, rejected.reason);
      return;
    }
    try {
      const def = PAIR_BY_ID[order.pair];
      const volume = order.qty.toFixed(Math.min(def.decimals, 8));
      const venue = getLiveVenue(s.venueId);
      const res = await venue.placeMarketOrder({
        apiKey: s.keys.apiKey,
        apiSecret: s.keys.apiSecret,
        pair: order.pair,
        side: order.side,
        volume,
      });
      const filled: Order = {
        ...order,
        mode: "live",
        status: "filled",
        fillPrice: order.price,
        krakenTxid: res.txid,
        ts: Date.now(),
      };
      applyFill(filled);
      void refreshTreasury();
      pushEvent({
        agent: "runner",
        next: "archivist",
        stage: "signed",
        pair: order.pair,
        title: `LIVE FILL ${order.side.toUpperCase()} ${PAIR_BY_ID[order.pair].label}`,
        detail: res.descr || res.txid,
        tone: "good",
      });
    } catch (err) {
      const rejected: Order = {
        ...order,
        mode: "live",
        status: "rejected",
        reason: err instanceof Error ? err.message : "Kraken reject",
      };
      patch({ orders: [rejected, ...useFloor.getState().orders].slice(0, 80) });
      bumpAgent("runner", "Kraken reject", 1);
      pushQueue({
        title: "KRAKEN REJECT",
        detail: rejected.reason,
        severity: "stall",
        pair: order.pair,
      });
      toastLiveReject(order, rejected.reason);
    }
    return;
  }

  const ticker = useFloor.getState().tickers[order.pair];
  const last = ticker?.last ?? order.price;
  const slip = 0.00035 + Math.random() * 0.0004;
  const fillPrice = order.side === "buy" ? last * (1 + slip) : last * (1 - slip);
  const fee = fillPrice * order.qty * 0.0026;
  const filled: Order = {
    ...order,
    status: "filled",
    fillPrice,
    fee,
    ts: Date.now(),
  };
  applyFill(filled);
  pushEvent({
    agent: "runner",
    next: "archivist",
    stage: "signed",
    pair: order.pair,
    title: `PAPER FILL ${order.side.toUpperCase()} ${PAIR_BY_ID[order.pair].label}`,
    detail: `${order.qty} @ ${px(fillPrice)} · fee ${fee.toFixed(2)}`,
    tone: "good",
  });
}

export async function placeManualTicket(input: {
  pair: PairId;
  side: "buy" | "sell";
  dollars: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = useFloor.getState();
  if (!s.launched) return { ok: false, reason: "Start the desk first." };
  const price = s.tickers[input.pair]?.last;
  if (!price) return { ok: false, reason: "No mark on that pair yet." };
  const dollars = Math.round(input.dollars * 100) / 100;
  if (!Number.isFinite(dollars) || dollars < 10) {
    return { ok: false, reason: "Ticket needs at least $10." };
  }
  if (input.side === "sell") {
    const pos = s.positions.find((p) => p.pair === input.pair);
    if (!pos) return { ok: false, reason: "No inventory to sell." };
    const order: Order = {
      id: uid("ord"),
      pair: input.pair,
      side: "sell",
      qty: pos.qty,
      price,
      status: "queued",
      mode: s.mode,
      reason: "manual ticket",
      ts: Date.now(),
    };
    await executeOrder(order);
    return { ok: true };
  }
  const def = PAIR_BY_ID[input.pair];
  const qty = Number((dollars / price).toFixed(Math.min(Math.max(def.decimals, 0), 8)));
  if (qty < def.ordermin) return { ok: false, reason: "Below min size." };
  const purse = workingPurse();
  if (!purse.ok) return { ok: false, reason: purse.why };
  if (dollars > purse.cash * 0.98) {
    return { ok: false, reason: s.liveArmed ? "Over live USD budget." : "Not enough free cash." };
  }
  const order: Order = {
    id: uid("ord"),
    pair: input.pair,
    side: "buy",
    qty,
    price,
    status: "queued",
    mode: s.liveArmed ? "live" : "paper",
    reason: "manual ticket",
    ts: Date.now(),
  };
  await executeOrder(order);
  return { ok: true };
}

export async function closeLot(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = useFloor.getState();
  const pos = s.positions.find((p) => p.id === id);
  if (!pos) return { ok: false, reason: "That lot is already flat." };
  if (flattening.has(pos.id)) return { ok: false, reason: "Already closing." };
  flattening.add(pos.id);
  const price = s.tickers[pos.pair]?.last ?? pos.mark;
  const order: Order = {
    id: uid("ord"),
    pair: pos.pair,
    side: pos.side === "buy" ? "sell" : "buy",
    qty: pos.qty,
    price,
    status: "queued",
    mode: pos.mode,
    reason: "CLOSE",
    ts: Date.now(),
  };
  try {
    await executeOrder(order);
    return { ok: true };
  } finally {
    flattening.delete(pos.id);
  }
}

export function cancelPendingTicket() {
  const s = useFloor.getState();
  if (!s.pendingLive) return;
  s.setPendingLive(null);
}

let studyLock = false;
export async function studyBook(): Promise<{ ok: true; note: string }> {
  if (studyLock) return { ok: true, note: "Already walking history." };
  studyLock = true;
  try {
    const s = useFloor.getState();
    if (!s.launched) return { ok: true, note: "Start the desk first." };
    bumpAgent("hunter", "walking daily tape", 1);
    bumpAgent("signal", "pattern scan", 1);
    let n = 0;
    for (const pair of s.pairs) {
      try {
        const weekly = await fetchOhlc({ data: { pair, interval: 10080 } });
        const daily = await fetchOhlc({ data: { pair, interval: 1440 } });
        const candles = daily.length >= 24 ? daily : weekly;
        if (candles.length < 24) continue;
        if (weekly.length >= 24) {
          patch({ brain: mergeAssetMemory(useFloor.getState().brain, studyFromCandles(pair, weekly)) });
        }
        const mem = studyFromCandles(pair, candles);
        patch({
          candles: { ...useFloor.getState().candles, [pair]: daily.length >= 24 ? daily : candles },
          brain: mergeAssetMemory(useFloor.getState().brain, mem),
        });
        n += 1;
        bumpAgent("archivist", mem.lastNote.slice(0, 42), 0.9);
        bumpAgent("hunter", `studied ${PAIR_BY_ID[pair].base}`, 0.85);
        bumpAgent("signal", mem.bestSetup, 0.8);
      } catch {
        bumpAgent("sentinel", `study miss ${pair}`, 0.6);
      }
    }
    pushEvent({
      agent: "hunter",
      next: "archivist",
      stage: "brief",
      title: "HISTORY WALK",
      detail: `Stored patterns on ${n} names. Brain keeps learning on every fill.`,
      tone: "info",
    });
    return { ok: true, note: n ? `Brain stored ${n} daily books.` : "No history yet — tape still printing." };
  } finally {
    studyLock = false;
  }
}

function applyFill(order: Order) {
  if (!running) return;
  let closePnl: number | undefined;
  let lessonReason: string | undefined;
  useFloor.setState((s) => {
    const fill = order.fillPrice ?? order.price;
    if (!(fill > 0) || !(order.qty > 0)) {
      return {
        orders: [{ ...order, status: "rejected" as const, reason: "bad fill" }, ...s.orders].slice(0, 80),
      };
    }
    const fee = order.fee ?? fill * order.qty * 0.0026;
    const existing = s.positions.find((p) => p.pair === order.pair);
    let positions = s.positions.slice();
    const liveFill = order.mode === "live";
    let cash = s.cash;
    let realized = s.realized;
    let reason = order.reason;

    if (order.side === "sell") {
      if (!existing) {
        return {
          orders: [{ ...order, status: "rejected" as const, reason: "no inventory" }, ...s.orders].slice(
            0,
            80,
          ),
        };
      }
      const sellQty = Math.min(order.qty, existing.qty);
      const pnl = (fill - existing.entry) * sellQty - fee;
      closePnl = pnl;
      realized += pnl;
      if (!liveFill) cash += fill * sellQty - fee;
      if (sellQty + 1e-12 < existing.qty) {
        positions = positions.map((p) =>
          p.pair === order.pair ? { ...p, qty: existing.qty - sellQty, mark: fill } : p,
        );
        reason = `${reason} · GRID OUT`;
      } else {
        positions = positions.filter((p) => p.pair !== order.pair);
        if (!reason.includes("TP") && !reason.includes("SL")) {
          reason = `${reason} · ${pnl >= 0 ? "TP" : "SL"}`;
        }
        lessonReason = existing.note || order.reason;
      }
    } else if (existing) {
      const totalQty = existing.qty + order.qty;
      const entry = (existing.entry * existing.qty + fill * order.qty) / totalQty;
      const pb = asPlaybook(order.book ?? existing.book ?? "scalp");
      const heat = PAIR_BY_ID[order.pair].sleeve === "heat";
      const band = bookStops(pb, entry, heat);
      positions = positions.map((p) =>
        p.pair === order.pair
          ? {
              ...p,
              qty: totalQty,
              entry,
              mark: fill,
              stop: band.stop,
              take: band.take,
              adds: (existing.adds ?? 1) + 1,
              book: pb,
            }
          : p,
      );
      if (!liveFill) cash -= fill * order.qty + fee;
    } else {
      if (!liveFill) cash -= fill * order.qty + fee;
      const heat = PAIR_BY_ID[order.pair].sleeve === "heat";
      const pb = asPlaybook(order.book ?? "scalp");
      const band = bookStops(pb, fill, heat);
      positions = [
        ...positions,
        {
          id: uid("pos"),
          pair: order.pair,
          side: "buy",
          qty: order.qty,
          entry: fill,
          mark: fill,
          stop: band.stop,
          take: band.take,
          openedAt: Date.now(),
          mode: order.mode,
          krakenTxid: order.krakenTxid,
          note: order.reason,
          adds: 1,
          book: pb,
        },
      ];
    }
    return {
      cash,
      realized,
      positions,
      orders: [{ ...order, fee, reason, pnl: closePnl }, ...s.orders].slice(0, 80),
      pendingLive: null,
    };
  });

  if (lessonReason && closePnl != null && !lessonReason.includes("DEMO")) {
    const brain = learnFromClose(useFloor.getState().brain, {
      pair: order.pair,
      pnl: closePnl,
      reason: lessonReason,
    });
    patch({ brain });
    bumpAgent("archivist", brain.lastNote, 1);
    pushEvent({
      agent: "archivist",
      stage: "signed",
      pair: order.pair,
      title: brain.enabled ? (closePnl >= 0 ? "brain kept the setup" : "brain cut the setup") : "journal close",
      detail: brain.lastNote,
      tone: closePnl >= 0 ? "good" : "bad",
    });
  } else if (lessonReason?.includes("DEMO")) {
    bumpAgent("archivist", "demo close — brain skipped", 0.6);
  }
  bumpAgent("archivist", "journal fill", 0.85);
  emitPulse({ from: "runner", to: "archivist" });
  sampleEquity(true);
  toastOrderFill(order, closePnl);
  if (closePnl != null && closePnl >= 0.5 && useFloor.getState().autoSweep) {
    const profit = closePnl;
    if (order.mode === "live") {
      useFloor.setState((s) => ({ sweptTotal: s.sweptTotal + profit }));
      toastSweep(profit);
      pushEvent({
        agent: "treasury",
        stage: "signed",
        title: `SWEEP ${money(profit)}`,
        detail: "Profit is USD on Kraken — dry powder for the next ticket",
        tone: "good",
      });
    } else {
      const swept = useFloor.getState().sweepProfit();
      if (swept.ok) {
        toastSweep(swept.amount);
        pushEvent({
          agent: "treasury",
          stage: "signed",
          title: `SWEEP ${money(swept.amount)}`,
          detail: "Profit swept off the paper desk",
          tone: "good",
        });
      }
    }
  }
  flushFloorPersist();
}

function restoreOrphanLots() {
  useFloor.setState((s) => {
    const sold = new Set(
      s.orders.filter((o) => o.status === "filled" && o.side === "sell").map((o) => o.pair),
    );
    const open = new Set(s.positions.map((p) => p.pair));
    const extra: Position[] = [];
    for (const o of s.orders) {
      if (o.status !== "filled" || o.side !== "buy") continue;
      if (sold.has(o.pair) || open.has(o.pair)) continue;
      const fill = o.fillPrice ?? o.price;
      if (!(fill > 0) || !(o.qty > 0)) continue;
      const heat = PAIR_BY_ID[o.pair]?.sleeve === "heat";
      const band = bookStops(asPlaybook(o.book ?? s.playbooks?.[0] ?? "scalp"), fill, heat);
      extra.push({
        id: uid("pos"),
        pair: o.pair,
        side: "buy",
        qty: o.qty,
        entry: fill,
        mark: s.tickers[o.pair]?.last ?? fill,
        stop: band.stop,
        take: band.take,
        openedAt: o.ts,
        mode: o.mode,
        note: o.reason,
      });
      open.add(o.pair);
    }
    if (extra.length === 0) {
      return s;
    }
    return { positions: [...s.positions, ...extra] };
  });
}

function maybeCheckStops() {
  const now = Date.now();
  if (now - lastStopCheck < 350) return;
  lastStopCheck = now;
  checkStops();
}

function manageOpenLot(
  playbook: PlaybookId,
  p: { openedAt: number; entry: number; mark: number; stop: number; take: number; qty: number },
): { action: BookAction; stop: number; sellFrac: number } {
  if (playbook === "grid") return gridManage(p);
  if (playbook === "dca") return dcaManage(p);
  const m = scalpManage(p);
  return { action: m.action, stop: m.stop, sellFrac: m.action === "hold" ? 0 : 1 };
}

function checkStops() {
  const s = useFloor.getState();
  if (!s.launched || s.positions.length === 0) return;
  if (s.mode === "live" && !s.liveArmed && !s.floorOpen) return;
  let trailed = false;
  const nextPos = s.positions.map((p) => {
    const mark = s.tickers[p.pair]?.last ?? p.mark;
    const pb = asPlaybook(p.book);
    const managed = manageOpenLot(pb, { ...p, mark });
    if (managed.stop !== p.stop) trailed = true;
    return { ...p, mark, stop: managed.stop };
  });
  if (trailed) patch({ positions: nextPos });

  for (const p of nextPos) {
    const pb = asPlaybook(p.book);
    const managed = manageOpenLot(pb, p);
    if (managed.action === "hold") continue;
    if (flattening.has(p.id)) continue;
    flattening.add(p.id);
    const def = PAIR_BY_ID[p.pair];
    const frac = managed.sellFrac <= 0 ? 1 : managed.sellFrac;
    let qty = frac >= 0.999 ? p.qty : p.qty * frac;
    qty = Number(qty.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
    if (qty < def.ordermin) qty = p.qty;
    if (qty > p.qty) qty = p.qty;
    const side = p.side === "buy" ? "sell" : "buy";
    const reason =
      managed.action === "stop"
        ? "SL"
        : managed.action === "take"
          ? "TP"
          : managed.action === "reduce"
            ? "GRID OUT"
            : p.mark >= p.entry
              ? "TIME TP"
              : "TIME SL";
    const order: Order = {
      id: uid("ord"),
      pair: p.pair,
      side,
      qty,
      price: p.mark,
      status: "queued",
      mode: p.mode,
      reason,
      ts: Date.now(),
    };
    bumpAgent("sentinel", `${reason} ${PAIR_BY_ID[p.pair].base}`, 1);
    bumpAgent("runner", `flatten ${PAIR_BY_ID[p.pair].base}`, 1);
    void executeOrder(order).finally(() => flattening.delete(p.id));
  }
}

function idleChatter() {
  const s = useFloor.getState();
  if (!s.floorOpen) return;
  const a = AGENTS[Math.floor(Math.random() * AGENTS.length)]!;
  const tickerPairs = s.pairs.filter((p) => s.tickers[p]);
  const pair = tickerPairs[Math.floor(Math.random() * Math.max(tickerPairs.length, 1))];
  const label = pair ? PAIR_BY_ID[pair].label : "the tape";
  const wr = s.brain.samples ? Math.round((s.brain.wins / s.brain.samples) * 100) : 0;
  const lines: Record<AgentId, string> = {
    scanner: `watching ${label}`,
    runner:
      s.opsMode === "paper"
        ? "waiting on your ticket"
        : s.opsMode === "learn"
          ? "studying — no ticket"
          : s.mode === "live"
            ? "live desk hot"
            : "auto blotter ready",
    hunter: s.opsMode === "learn" ? "walking first print → now" : "ranking the board",
    dispatcher: s.swarm?.grok ? s.swarm.grok.slice(0, 42) : "Grok coordinating the swarm",
    signal: s.opsMode === "learn" ? "pattern memory" : s.brain.enabled
      ? `RSI ${s.brain.rsiBuy.toFixed(0)}/${s.brain.rsiSell.toFixed(0)}`
      : "waiting on a clean cross",
    regime: "reading the higher tape",
    flow: "spread watch",
    risk: `size tilt ${s.brain.sizeTilt.toFixed(2)}x`,
    treasury:
      s.mode === "live"
        ? `Kraken USD ${usdOnBook(s.liveBalance).toFixed(0)}`
        : "paper purse ready",
    sentinel: "drawdown green",
    archivist: s.brain.samples
      ? `brain ${wr}% on ${s.brain.samples}`
      : "brain cold — waiting on fills",
    wire: s.fearGreed
      ? `F&G ${s.fearGreed.value} ${s.fearGreed.label}`
      : "reading the names",
  };
  bumpAgent(a.id, lines[a.id], 0.35 + Math.random() * 0.25);
}

async function refreshWire() {
  try {
    const res = await fetchWire();
    useFloor.getState().setWire(res.items, res.fearGreed);
    const top = res.items[0];
    bumpAgent("wire", top ? top.title.slice(0, 42) : "wire quiet", 0.85);
    if (top?.pairs[0]) {
      emitPulse({ from: "wire", to: "hunter" });
      pushEvent({
        agent: "wire",
        next: "hunter",
        stage: "brief",
        pair: top.pairs[0],
        title: top.kind === "trend" ? "TRENDING" : top.kind === "macro" ? "MACRO" : "WIRE",
        detail: `${top.title} · ${top.note}`,
        tone: top.tone === "bear" ? "warn" : top.tone === "bull" ? "good" : "info",
      });
    }
  } catch {
    bumpAgent("wire", "wire miss", 0.6);
  }
}

export async function scanLiveTape(): Promise<{ ok: true; acted: boolean; note: string }> {
  if (demoLock) return { ok: true, acted: false, note: "scan already on the desk" };
  demoLock = true;
  try {
    const s = useFloor.getState();
    if (!s.launched) {
      return { ok: true, acted: false, note: "Desk not started — finish launch setup first" };
    }
    if (!s.floorOpen) {
      return { ok: true, acted: false, note: "Floor closed — open the desk to scan" };
    }
    bumpAgent("scanner", `${s.chartInterval}m Kraken scan`, 1);
    await refreshOhlcAll();
    const sigs = useFloor.getState().signals;
    const latestByPair = new Map<string, (typeof sigs)[number]>();
    for (const sig of sigs) {
      if (!latestByPair.has(sig.pair)) latestByPair.set(sig.pair, sig);
    }
    const live = [...latestByPair.values()].filter((x) => x.kind !== "hold");
    live.sort((a, b) => b.confidence - a.confidence);
    const best = live[0];
    if (best) {
      return {
        ok: true,
        acted: true,
        note: `${best.kind.toUpperCase()} ${PAIR_BY_ID[best.pair].label} · ${best.reason} · ${(best.confidence * 100).toFixed(0)}%`,
      };
    }
    const hold = [...latestByPair.values()][0];
    return {
      ok: true,
      acted: false,
      note: hold
        ? `HOLD ${PAIR_BY_ID[hold.pair].label} · RSI ${hold.rsi.toFixed(0)} · ${hold.reason}`
        : "tape scanned — no print yet",
    };
  } finally {
    demoLock = false;
  }
}

export async function runDemoTicket() {
  return scanLiveTape();
}

export async function refreshTreasury() {
  const s = useFloor.getState();
  if (!s.keys.apiKey || !s.keys.apiSecret) return;
  try {
    const venue = getLiveVenue(s.venueId);
    const bal = await venue.fetchBalance(s.keys);
    useFloor.getState().setLiveBalance(bal);
    useFloor.getState().setKeysOk(true);
    const usd = usdOnBook(bal);
    bumpAgent("treasury", `Kraken USD ${usd.toFixed(2)}`, 0.7);
  } catch (err) {
    bumpAgent("treasury", "wallet read failed", 0.9);
    pushQueue({
      title: "TREASURY MISS",
      detail: err instanceof Error ? err.message : "Balance call failed",
      severity: "stall",
    });
  }
}

export async function haltLive() {
  const s = useFloor.getState();
  patch({ floorOpen: false, liveArmed: false, autoTrade: false });
  bumpAgent("sentinel", "KILL SWITCH", 1);
  pushEvent({
    agent: "sentinel",
    stage: "second",
    title: "FLOOR HALTED",
    detail: "Kill switch — runner frozen",
    tone: "bad",
  });
  toastKillSwitch();
  if (s.mode === "live" && s.keys.apiKey && s.keys.apiSecret) {
    try {
      const venue = getLiveVenue(s.venueId);
      const res = await venue.cancelAll({
        apiKey: s.keys.apiKey,
        apiSecret: s.keys.apiSecret,
      });
      pushEvent({
        agent: "runner",
        stage: "signed",
        title: "CancelAll",
        detail: `${res.count} live orders pulled`,
        tone: "warn",
      });
    } catch (err) {
      pushQueue({
        title: "CANCEL ALL FAILED",
        detail: err instanceof Error ? err.message : "Kraken error",
        severity: "stall",
      });
      toastVenueBlock(err instanceof Error ? err.message : "CancelAll failed");
    }
  }
}

async function catchUpAway(now = Date.now()): Promise<AwayReport | null> {
  const s = useFloor.getState();
  if (s.mode === "live") {
    useFloor.setState({ lastEngineAt: now });
    if (s.keys.apiKey && s.keys.apiSecret) void refreshTreasury();
    return null;
  }
  if (!s.launched || s.mode !== "paper") {
    useFloor.setState({ lastEngineAt: now });
    return null;
  }
  const from = s.lastEngineAt > 0 ? s.lastEngineAt : s.shiftStartedAt;
  const gap = now - from;
  if (!(from > 0) || gap < AWAY_MIN_MS) {
    useFloor.setState({ lastEngineAt: now });
    return null;
  }
  const span = Math.min(gap, AWAY_MAX_MS);
  const since = now - span;
  const bars: AwayBar[] = [];
  await Promise.all(
    s.pairs.map(async (pair) => {
      try {
        const rows = await fetchOhlc({ data: { pair, interval: 1, since } });
        for (const c of rows) {
          if (c.time < since) continue;
          bars.push({
            time: c.time,
            pair,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          });
        }
      } catch {
        /* pair miss */
      }
    }),
  );
  const { book, report } = replayAway(
    {
      cash: s.cash,
      realized: s.realized,
      positions: s.positions,
      orders: s.orders,
      risk: { sizePct: s.risk.sizePct, maxPositions: s.risk.maxPositions },
      pairs: s.pairs,
    },
    bars,
  );
  useFloor.setState({
    cash: book.cash,
    realized: book.realized,
    positions: book.positions,
    orders: book.orders,
    lastEngineAt: now,
  });
  report.awayMs = gap;
  if (report.fills > 0) {
    const ev: TapeEvent = {
      id: uid("ev"),
      ts: now,
      agent: "archivist",
      stage: "signed",
      title: `AWAY ${Math.max(1, Math.round(gap / 60_000))}m`,
      detail: `${report.fills} fills · ${report.takes} takes · ${report.stops} stops · replayed tape`,
      tone: report.pnl >= 0 ? "good" : "bad",
    };
    useFloor.setState((st) => ({
      events: [ev, ...st.events].slice(0, 40),
      grokNote: `Away replay · ${report.fills} fills · tape walked while the phone was closed`,
    }));
  }
  return report;
}

export function startEngine(): () => void {
  if (running) return () => stopEngine();
  running = true;
  restoreOrphanLots();
  if (!useFloor.getState().shiftStartedAt) {
    patch({ shiftStartedAt: Date.now() });
  }
  seedHistory();
  applySessionEnd();
  void catchUpAway().then((rep) => {
    flushFloorPersist();
    if (rep && rep.awayMs >= 90_000) toastAwayReplay(rep.awayMs, rep.fills, rep.pnl);
  });
  void runScout();

  const heartbeat = window.setInterval(() => {
    patch({ lastEngineAt: Date.now() });
  }, 15_000);
  const persistPulse = window.setInterval(() => {
    flushFloorPersist();
  }, 8_000);

  const tick = window.setInterval(() => {
    if (typeof document !== "undefined" && document.hidden && !useFloor.getState().liveArmed) return;
    coolAgents(0.25);
    sampleEquity();
  }, 500);
  const chatter = window.setInterval(idleChatter, 4000);
  const rest = window.setInterval(() => {
    applySessionEnd();
    const st = useFloor.getState();
    if (!bookNeedsProtect(st)) return;
    const src = st.feedSource;
    if (src === "sim") {
      runSimTick();
      checkStops();
      return;
    }
    void refreshTickersRest().then(() => checkStops());
  }, 5000);
  const ohlc = window.setInterval(() => {
    if (typeof document !== "undefined" && document.hidden && !useFloor.getState().liveArmed) return;
    const st = useFloor.getState();
    if (!st.launched || !st.floorOpen) return;
    void refreshOhlcAll();
  }, useFloor.getState().mode === "paper" ? 8_000 : 15_000);
  const stageSpin = window.setInterval(() => {
    if (typeof document !== "undefined" && document.hidden && !useFloor.getState().liveArmed) return;
    const s = useFloor.getState();
    if (!s.launched || !s.floorOpen) return;
    const i = STAGE_CYCLE.indexOf(s.stage);
    const busy = Object.values(s.agents).some((a) => a.heat > 0.55);
    if (!busy) patch({ stage: STAGE_CYCLE[(i + 1) % STAGE_CYCLE.length]! });
  }, 3800);
  const simPulse = window.setInterval(() => {
    if (typeof document !== "undefined" && document.hidden && !useFloor.getState().liveArmed) return;
    if (useFloor.getState().feedSource !== "sim") return;
    const st = useFloor.getState();
    if (!bookNeedsProtect(st)) return;
    runSimTick();
    checkStops();
  }, 1200);
  const session = window.setInterval(applySessionEnd, 1000);
  const treasury = window.setInterval(() => {
    void refreshTreasury();
  }, 45_000);
  const wire = window.setInterval(() => {
    void refreshWire();
  }, 180_000);
  const scout = window.setInterval(() => {
    void runScout();
  }, 60_000);

  timers = [tick, chatter, rest, ohlc, stageSpin, simPulse, session, treasury, wire, heartbeat, persistPulse, scout];

  stopWs = connectTickerFeed(
    useFloor.getState().pairs,
    (t) => {
      if (useFloor.getState().feedSource === "sim") {
        patch({ feedSource: "kraken", feedError: null, feedOk: true });
      }
      applyTicker(t);
    },
    (ok) => {
      if (ok) {
        restFails = 0;
        patch({ feedOk: true, feedSource: "kraken", feedError: null });
      }
    },
  );

  void (async () => {
    await refreshTickersRest();
    if (useFloor.getState().launched && useFloor.getState().floorOpen) {
      await refreshOhlcAll();
    }
    await refreshTreasury();
    await refreshWire();
    sampleEquity(true);
  })();

  return () => stopEngine();
}

export function stopEngine() {
  running = false;
  patch({ lastEngineAt: Date.now() });
  flushFloorPersist();
  for (const t of timers) window.clearInterval(t);
  timers = [];
  if (tickerFlush != null) {
    window.clearTimeout(tickerFlush);
    tickerFlush = null;
  }
  pendingTickers.clear();
  evaluating.clear();
  evalBusy = 0;
  lastEvalAt.clear();
  stopWs?.();
  stopWs = null;
}

export function restartFeed() {
  stopWs?.();
  stopWs = connectTickerFeed(
    useFloor.getState().pairs,
    (t) => {
      applyTicker(t);
      if (useFloor.getState().feedSource === "sim") {
        patch({ feedSource: "kraken", feedError: null, feedOk: true });
      }
    },
    (ok) => {
      if (ok) patch({ feedOk: true, feedSource: "kraken", feedError: null });
    },
  );
  void refreshTickersRest();
}
