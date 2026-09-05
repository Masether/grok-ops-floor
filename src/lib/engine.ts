import { AGENT_BY_ID, AGENTS } from "./agents.ts";
import { emitPulse } from "./bus.ts";
import { uid, px, money } from "./format.ts";
import { macdHist, readScalp } from "./indicators.ts";
import { fetchOhlc, fetchOrderFill, fetchTickers, fetchUsdUniverse } from "./kraken-api.ts";
import { PAIR_BY_ID, BTC_BOOK, DEFAULT_PAIRS, HEAT_PAIRS, btcBookArmed, getPair, heatUniverse, isBtcQuote, isBtcUsd, liveWatchPairs, pairBase, pairLabel, registerPair } from "./kraken.ts";
import { budgetStake } from "./budget-size.ts";
import { liveEntry } from "./sharp.ts";
import { industryCall } from "./industry-call.ts";
import { hugeSpike, volumeRatio } from "./spike-alert.ts";
import { blendTaker, edgeClearsFees, feeAwareStops, feeOn, learnTaker, minTakePct, netPnl, takerPct, MIN_NET_USD } from "./fees.ts";
import { fairValue, mispricing, pricerQuiet } from "./pricer.ts";
import { autoBotReady } from "./auto-bot.ts";
import { rankMemeScout, rankScout } from "./scout.ts";
import { AWAY_MAX_MS, AWAY_MIN_MS, replayAway, type AwayBar, type AwayReport } from "./catch-up.ts";
import { getLiveVenue } from "./venues/index.ts";
import { connectTickerFeed } from "./kraken-ws.ts";
import { learnFromClose, learnFromIndustry, mergeAssetMemory, pairMinConf, studyFromCandles } from "./learn.ts";
import { dailyStance } from "./daily-trend.ts";
import { SCALP, scalpManage } from "./scalp.ts";
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
} from "./playbook.ts";
import { makeSimCandles, stepSim } from "./sim-feed.ts";
import { hunterScore, readFlow, readRegime, usdOnBook } from "./specialists.ts";
import { pairSleeve } from "./book-balance.ts";
import { bookDayPnl, haltCapUsd } from "./desk-pnl.ts";
import { btcOnBook, hasKrakenBook, krakenKeysOn, livePositions, liveSleeve, MIN_LIVE_HALT_USD, MIN_LIVE_TICKET, spotQty } from "./live-budget.ts";
import { lotsMark } from "./live-pnl.ts";
import { finishRoll, pingSwarm, tallySwarm } from "./swarm.ts";
import { fetchWire } from "./wire-api.ts";
import { sessionEnded } from "./session.ts";
import { modOn } from "./desk-mods.ts";
import { ensureLiveDesk, markEquity, useFloor, flushFloorPersist, type FloorState } from "./store.ts";
import {
  toastDailyLossHalt,
  toastKillSwitch,
  toastLiveReject,
  toastOrderFill,
  toastSessionEnded,
  toastVenueBlock,
  toastAwayReplay,
  toastSweep,
} from "./trade-toast.ts";
import type {
  AgentId,
  Order,
  PairId,
  PipelineStage,
  Position,
  QueueItem,
  TapeEvent,
  Ticker,
} from "./types.ts";

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
let visHandler: (() => void) | null = null;

let patchQ: Partial<FloorState> = {};
let patchRaf = 0;

function patch(partial: Partial<FloorState>) {
  if (partial.agents && patchQ.agents) {
    patchQ = { ...patchQ, ...partial, agents: { ...patchQ.agents, ...partial.agents } };
  } else {
    patchQ = { ...patchQ, ...partial };
  }
  if (patchRaf) return;
  patchRaf = window.requestAnimationFrame(() => {
    const next = patchQ;
    patchQ = {};
    patchRaf = 0;
    if (Object.keys(next).length) useFloor.setState(next);
  });
}

const lastBumpAt = new Map<AgentId, number>();

async function rollInSwarm(vote: ReturnType<typeof tallySwarm>, pair: PairId, _label: string) {
  const pings = pingSwarm();
  const done = finishRoll(vote, pings);
  patch({ swarm: done, grokNote: done.grok });
  void pair;
  return done;
}

function walkDebate(vote: ReturnType<typeof tallySwarm>, pair: PairId, label: string) {
  const merge = vote.debate.rounds.find((r) => r.role === "merge") ?? vote.debate.rounds.at(-1);
  if (merge) {
    bumpAgent("dispatcher", `${merge.kind} ${label}`, 0.9);
    patch({ grokNote: merge.note, stage: "second" });
  }
  void pair;
}

function bumpAgent(id: AgentId, action: string, heat = 1) {
  const now = Date.now();
  const prevBump = lastBumpAt.get(id) ?? 0;
  if (now - prevBump < 120 && heat < 0.95) return;
  lastBumpAt.set(id, now);
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
  const live = s.floorOpen || s.liveArmed;
  let changed = false;
  const next = { ...s.agents };
  for (const a of AGENTS) {
    const cur = next[a.id];
    if (!cur) continue;
    const floor = live ? 0.48 : 0.08;
    const heat = Math.max(floor, cur.heat - dt * (live ? 0.12 : 0.55));
    const status = !live ? "halted" : heat >= 0.4 ? "working" : "idle";
    if (Math.abs(heat - cur.heat) < 0.04 && status === cur.status) continue;
    next[a.id] = { ...cur, heat, status };
    changed = true;
  }
  if (changed) patch({ agents: next });
}

function pushEvent(e: Omit<TapeEvent, "id" | "ts">) {
  const s = useFloor.getState();
  if (e.tone === "info") {
    const last = s.events.find((x) => x.pair === e.pair && x.title === e.title);
    if (last && Date.now() - last.ts < 12_000) return;
  }
  const event: TapeEvent = { ...e, id: uid("tape"), ts: Date.now() };
  patch({
    events: [event, ...s.events].slice(0, 80),
    briefs: s.briefs + (e.stage === "brief" ? 1 : 0),
    handoff: e.next ? { from: e.agent, to: e.next } : s.handoff,
  });
  if (e.next) emitPulse({ from: e.agent, to: e.next, color: AGENT_BY_ID[e.agent].color });
}

function pushQueue(item: Omit<QueueItem, "id" | "ts">) {
  const cur = useFloor.getState().queue;
  const dup = cur.find((x) => x.title === item.title && x.pair === item.pair);
  if (dup && Date.now() - dup.ts < 12_000) return;
  const q: QueueItem = { ...item, id: uid("q"), ts: Date.now() };
  patch({ queue: [q, ...cur].slice(0, 24) });
}

function applySessionEnd() {
  const s = useFloor.getState();
  if (!sessionEnded(s.sessionEndsAt)) return;
  if (krakenKeysOn(s.keys) && (s.liveArmed || s.mode === "live")) {
    patch({ sessionEndsAt: null, floorOpen: true, autoTrade: true });
    return;
  }
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
  return s.launched && (s.floorOpen || s.liveArmed || s.positions.length > 0);
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
  });
  maybeCheckStops();
  sampleEquity(positions.length > 0);
}

function sampleEquity(force = false) {
  const now = Date.now();
  const s0 = useFloor.getState();
  const open = s0.positions.length > 0;
  const gap = open ? 400 : 800;
  if (!force && now - lastEquitySample < gap) return;
  lastEquitySample = now;
  const s = useFloor.getState();
  const live = s.mode === "live" || s.liveArmed;
  const book = live ? livePositions(s.positions) : s.positions;
  const equity = markEquity(s);
  const cash = live
    ? liveSleeve({
        liveBudget: s.liveBudget,
        liveBalance: s.liveBalance,
        positions: s.positions,
        tickers: s.tickers,
      }).cash
    : s.cash;
  const marked = lotsMark(book, s.tickers);
  const point = {
    t: now,
    equity,
    cash,
    unrealized: marked.unrealized,
    scanner: s.agents.scanner?.heat ?? 0.2,
    signal: s.agents.signal?.heat ?? 0.2,
    risk: s.agents.risk?.heat ?? 0.2,
    runner: s.agents.runner?.heat ?? 0.2,
  };
  const hist = s.equityHistory;
  const last = hist[hist.length - 1];
  if (last && now - last.t < (open ? 350 : 700) && !force) return;
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
  if (s.lastScoutAt && Date.now() - s.lastScoutAt < (!modOn("core") ? 3 * 60_000 : 10 * 60_000)) return;
  bumpAgent("hunter", "scout Kraken memes", 1);
  try {
    const res = await fetchUsdUniverse();
    for (const def of res.defs) registerPair(def);
    const ranked = !modOn("core") ? rankMemeScout(res.hits) : rankScout(res.hits);
    const { kept, dropped, scanned } = ranked;
    const hot = kept
      .map((h) => (getPair(h.pair) ? (h.pair as PairId) : null))
      .filter((id): id is PairId => Boolean(id) && getPair(id!)?.sleeve === "heat");
    const btcPx = s.tickers.XBTUSD?.last ?? 0;
    const btcUsd = btcOnBook(s.liveBalance) * btcPx;
    const nextPairs = !modOn("core")
      ? heatUniverse([...s.pairs, ...hot])
      : liveWatchPairs([...DEFAULT_PAIRS, ...s.pairs, ...hot], btcUsd, false);
    const bookChanged = nextPairs.length !== s.pairs.length || nextPairs.some((id, i) => id !== s.pairs[i]);
    patch({
      scoutHot: hot,
      scoutScanned: scanned,
      scoutDropped: dropped,
      lastScoutAt: Date.now(),
      pairs: nextPairs,
    });
    const bookNote = modOn("core")
      ? `core + ${hot.length} heat · dropped ${dropped}`
      : `heat-only ${hot.length} · dropped ${dropped}`;
    bumpAgent("hunter", `scout ${bookNote}`, 0.9);
    pushEvent({
      agent: "hunter",
      stage: "brief",
      title: `SCOUT ${scanned}`,
      detail: `Book: ${bookNote} (stables/thin filtered)`,
      tone: "info",
    });
    pushQueue({
      title: `SCOUT ${scanned}`,
      detail: bookNote,
      severity: "playbook",
    });
    if (bookChanged) restartFeed();
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
  const universe = [...new Set([
    ...(!modOn("core") ? heatUniverse(s.pairs) : s.pairs),
    ...((modOn("scout") || !modOn("core")) ? (s.scoutHot ?? []) : []),
    ...[...open].filter((id) => modOn("core") || pairSleeve(id) === "heat"),
  ])];
  const ranked = universe
    .map((pair) => ({
      pair,
      score: hunterScore(pair, s.tickers[pair], s.brain, open.has(pair), s.wire),
    }))
    .sort((a, b) => b.score - a.score);

  const take = modOn("core") ? 8 : Math.min(24, Math.max(8, universe.length));
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
        if (candles.length < (pairSleeve(row.pair) === "heat" ? 12 : 30)) return;
        patch({ candles: { ...useFloor.getState().candles, [row.pair]: candles } });
        enqueueEval(row.pair, candles);
      } catch (err) {
        if (!useSim) {
          bumpAgent("sentinel", `ohlc miss ${row.pair}`, 0.5);
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
  if (!running || evaluating.has(pair) || evalBusy >= 4) return;
  const last = lastEvalAt.get(pair) ?? 0;
  if (Date.now() - last < (pairSleeve(pair) === "heat" ? 2_000 : 4_000)) return;
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
  if (!running || !s0.launched || (!s0.floorOpen && !s0.liveArmed && !s0.autoTrade)) return;
  const bot = autoBotReady(s0);
  if (!bot.ok && krakenKeysOn(s0.keys) && s0.keysOk !== false) {
    /* wallet still loading — watch only */
  } else if (!bot.ok) {
    bumpAgent("runner", bot.why, 0.4);
  }
  const liveBook = s0.liveArmed || s0.mode === "live";
  if (liveBook && isBtcUsd(pair)) {
    bumpAgent("treasury", "BTC is the reserve — not a scalp", 0.4);
    return;
  }
  if (!modOn("core") && pairSleeve(pair) !== "heat") return;
  if (liveBook) {
    const btcPx = s0.tickers.XBTUSD?.last ?? 0;
    const btcUsd = btcOnBook(s0.liveBalance) * btcPx;
    const usd = Number(s0.liveBalance?.ZUSD ?? s0.liveBalance?.USD ?? 0);
    if (isBtcQuote(pair) && !btcBookArmed(btcUsd)) {
      bumpAgent("hunter", "BTC book sleeps until $1000 BTC", 0.35);
      return;
    }
    if (!isBtcQuote(pair) && usd < MIN_LIVE_TICKET && btcUsd < MIN_LIVE_TICKET) {
      bumpAgent("hunter", "sleeve under min ticket", 0.4);
      return;
    }
  }
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
      sleeve === "heat"
        ? 0.28
        : s0.mode === "paper"
          ? Math.min(pairMinConf(brain, pair), SCALP.minConf)
          : Math.max(0.38, Math.min(pairMinConf(brain, pair), 0.5));
    const swarmSleeve =
      s0.liveArmed || s0.mode === "live"
        ? liveSleeve({
            liveBudget: s0.liveBudget,
            liveBalance: s0.liveBalance,
            positions: s0.positions,
            tickers: s0.tickers,
          })
        : null;
    const equity = swarmSleeve ? swarmSleeve.equity : markEquity(s0);
    const swarmCash = swarmSleeve ? swarmSleeve.cash : s0.cash;
    const swarmDayStart = swarmSleeve
      ? s0.dayStartEquity > 0
        ? s0.dayStartEquity
        : swarmSleeve.equity
      : s0.dayStartEquity || s0.startingCash;
    const swarmDayPnl = equity - swarmDayStart;
    const swarmHalt = swarmSleeve
      ? haltCapUsd(swarmSleeve.budget, s0.risk.maxDailyLossPct, MIN_LIVE_HALT_USD)
      : (s0.dayStartEquity || s0.startingCash) * s0.risk.maxDailyLossPct;
    let grokKind: "buy" | "sell" | "hold" = read.kind;
    let grokConf = read.confidence;
    let grokReason = read.reason;
    const voteSnap = tallySwarm({
      pair,
      signal: { kind: read.kind, confidence: read.confidence, rsi: read.rsi },
      ticker,
      volumes,
      positions: swarmSleeve ? livePositions(s0.positions) : s0.positions,
      cash: swarmCash,
      equity,
      dayPnl: swarmDayPnl,
      maxDailyLoss: swarmHalt,
      maxPositions: s0.risk.maxPositions,
      brain,
      wire: s0.wire,
      fearGreed: s0.fearGreed,
    });
    patch({ swarm: finishRoll(voteSnap, pingSwarm(() => 0.42)) });
    if (modOn("grok")) {
      const vote = await rollInSwarm(voteSnap, pair, label);
      grokKind = vote.kind;
      grokConf =
        grokKind === read.kind ? read.confidence : grokKind === "hold" ? 0.22 : Math.max(read.confidence, 0.52);
      grokReason = vote.grok;
      walkDebate(vote, pair, label);
    }

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
    const autoDesk = true;

    const stNow = useFloor.getState();
    const keysOn = krakenKeysOn(stNow.keys);
    const paper = false;
    const liveNow = Boolean(keysOn);
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
      ? stNow.dayStartEquity > 0 &&
        stNow.dayStartEquity <= (liveNowSleeve?.budget ?? stNow.liveBudget) * 1.25
        ? stNow.dayStartEquity
        : (liveNowSleeve?.equity ?? stNow.liveBudget)
      : stNow.dayStartEquity || stNow.startingCash;
    const haltCap = liveNow
      ? haltCapUsd(liveNowSleeve?.budget ?? stNow.liveBudget, stNow.risk.maxDailyLossPct, MIN_LIVE_HALT_USD)
      : haltBase * stNow.risk.maxDailyLossPct;
    const dayNow = liveNow
      ? bookDayPnl(liveNowSleeve?.equity ?? 0, haltBase)
      : bookDayPnl(markEquity(stNow), haltBase);
    const halted = haltCap > 0 && dayNow <= -haltCap;
    const histPrev = closes.length > 28 ? macdHist(closes.slice(0, -1)) : read.macdHist;
    const lane = macdLane(read.macdHist, histPrev);

    let ticketKind: "buy" | "sell" | "hold" =
      grokKind !== "hold" ? grokKind : read.kind !== "hold" ? read.kind : "hold";
    if (ticketKind === "sell" && !hasPos) ticketKind = "hold";
    const lastClose = closes[closes.length - 1] ?? price;
    const prevClose = closes[closes.length - 2] ?? lastClose;
    const oneMinPct = prevClose > 0 ? ((lastClose - prevClose) / prevClose) * 100 : 0;
    const threeAgo = closes[closes.length - 4] ?? prevClose;
    const threePct = threeAgo > 0 ? ((lastClose - threeAgo) / threeAgo) * 100 : 0;
    const volRatio = volumeRatio(volumes);
    const wireHit = (stNow.wire ?? []).find((w) => w.pairs?.includes(pair));
    const spike = hugeSpike({
      oneMinPct,
      threePct,
      volRatio,
      lane,
      wireKind: wireHit?.kind,
      wireAgeMs: wireHit ? Date.now() - wireHit.ts : undefined,
    });
    const heatHot = false;
    const heatRip = false;
    if (spike.ok && ticketKind !== "sell") ticketKind = "buy";
    if (ticketKind === "hold" && autoDesk && lane === "up" && !spike.ok) {
      /* grid/dca decide — do not force a scalp */
    }
    const ticketConf = Math.max(read.confidence, grokKind === read.kind ? grokConf : 0.42);
    const existingLot = bookNow.find((p) => p.pair === pair);
    const lastBuy = stNow.orders.find(
      (o) => o.pair === pair && o.status === "filled" && o.side === "buy",
    );
    const dipFromEntry =
      existingLot && existingLot.entry > 0
        ? Math.max(0, (existingLot.entry - (ticker?.last ?? existingLot.mark)) / existingLot.entry)
        : 0;
    let playbook = pickPlaybook({
      enabled: normalizePlaybooks(stNow.playbooks).filter((id) => {
        // Scalp only on a real spike. Grid/DCA stay eligible so quiet majors print.
        if (id === "scalp") return spike.ok && modOn("scalp");
        if (id === "grid") return modOn("grid");
        if (id === "dca") return modOn("dca");
        return true;
      }),
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
      bookScore: brain.bookScore,
    });
    if (spike.ok && modOn("scalp") && ticketKind !== "sell") {
      playbook = "scalp";
      ticketKind = "buy";
    }
    if (!playbook && sleeve !== "heat") {
      const books = normalizePlaybooks(stNow.playbooks);
      if (modOn("grid") && books.includes("grid") && signal.rsi < 68) playbook = "grid";
      else if (modOn("dca") && books.includes("dca") && (signal.rsi < 62 || oneMinPct <= 0.2)) playbook = "dca";
    }
    if (!playbook) {
      ticketKind = "hold";
    } else if (playbook !== "scalp") {
      ticketKind = "buy";
    }

    bumpAgent("scanner", `tape ${label}`, 0.85);
    bumpAgent("hunter", `rank ${label}`, 0.8);
    bumpAgent("signal", `${read.setup} ${label}`, 0.8);
    pushEvent({
      agent: "scanner",
      next: "hunter",
      stage: "brief",
      pair,
      title: `WATCH ${label}`,
      detail: spike.ok
        ? `SPIKE ${spike.source} · 1m ${oneMinPct.toFixed(2)}% · vol ${volRatio.toFixed(1)}x`
        : `1m ${oneMinPct.toFixed(2)}% · 3m ${threePct.toFixed(2)}% · ${lane} · grid/dca`,
      tone: "info",
    });
    patch({ grokNote: `${label} · 1m ${oneMinPct >= 0 ? "+" : ""}${oneMinPct.toFixed(2)}% · ${lane}` });
    emitPulse({ from: "scanner", to: "hunter" });

    if (sleeve === "heat" && !modOn("heat") && ticketKind === "buy") ticketKind = "hold";
    if (sleeve === "core" && !modOn("core") && ticketKind === "buy") ticketKind = "hold";

    {
      const day = brain.dailyStance ?? "unknown";
      const regimeGate = readRegime(closes);
      const taker = takerPct(getPair(pair)?.quote ?? PAIR_BY_ID[pair]?.quote ?? "USD", stNow.liveTakerPct);
      const moveFrac = Math.max(oneMinPct, threePct) / 100;
      // Spike quality opens the ticket; take/stop still use coversFees / minTakePct.
      const feesClear =
        playbook !== "scalp" || spike.ok || edgeClearsFees(moveFrac, taker);
      const call = industryCall({
        kind: ticketKind,
        playbook,
        daily: day,
        regime: regimeGate.state,
        fearGreed: stNow.fearGreed?.value,
        pairWireTone: wireHit?.tone ?? null,
        spike: spike.ok,
        feesClear,
      });
      if (ticketKind === "buy" && !call.allow) {
        bumpAgent("hunter", call.why, 0.7);
        pushEvent({
          agent: "hunter",
          stage: "handout",
          pair,
          title: `SKIP ${label}`,
          detail: call.why,
          tone: "info",
        });
        ticketKind = "hold";
        playbook = null;
      }
    }

    if (!paper && ticketKind === "buy") {
      const recentPnl = stNow.orders
        .filter((o) => o.status === "filled" && o.mode === "live" && o.side === "sell")
        .slice(0, 4)
        .map((o) => o.pnl ?? 0);
      const gateTaker = takerPct(getPair(pair)?.quote ?? PAIR_BY_ID[pair]?.quote ?? "USD", stNow.liveTakerPct);
      const day = brain.dailyStance ?? "unknown";
      const regimeGate = readRegime(closes);
      const gate = liveEntry({
        grokKind,
        readKind: read.kind,
        lane,
        playbook,
        conf: ticketConf,
        heat: sleeve === "heat",
        hot: spike.ok,
        changePct: sleeve === "heat" ? Math.max(oneMinPct, threePct) : ticker?.changePct ?? 0,
        expectedMovePct: Math.max(oneMinPct, threePct) / 100,
        taker: gateTaker,
        recentPnl,
        sessionPnl: dayNow,
        budget: stNow.liveBudget || 200,
        daily: day,
        regime: regimeGate.state,
        fearGreed: stNow.fearGreed?.value ?? null,
        pairWireTone: wireHit?.tone ?? null,
        spike: spike.ok,
      });
      if (!gate.ok) {
        bumpAgent("risk", gate.why, 0.7);
        pushEvent({
          agent: "risk",
          stage: "handout",
          pair,
          title: `SKIP ${label}`,
          detail: gate.why,
          tone: "info",
        });
        pushQueue({
          title: `SKIP ${label}`,
          detail: gate.why,
          severity: "playbook",
          pair,
        });
        return;
      }
    }

    // Grid/DCA *want* near-fair tape. Pricer-quiet used to force HOLD under
    // ~0.8% mispricing and starved the live book on quiet majors.
    if (playbook === "scalp" && ticketKind === "buy" && sleeve === "heat") {
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

    if (sleeve === "heat" && ticketKind === "buy" && !spike.ok) {
      bumpAgent("hunter", "heat waits on a huge spike", 0.45);
      pushQueue({
        title: `WAIT SPIKE ${label}`,
        detail: spike.why,
        severity: "playbook",
        pair,
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

    const heatReady = sleeve === "heat" && spike.ok;
    if (heatReady && ticketKind !== "sell") {
      ticketKind = "buy";
      playbook = playbook ?? "scalp";
    }
    if (!heatReady && (halted || ticketKind === "hold" || (playbook === "scalp" && ticketConf < minConf))) {
      setStage("tool");
      bumpAgent("dispatcher", halted ? "daily halt" : `hold ${label}`, 0.45);
      bumpAgent("risk", halted ? "daily halt" : "no ticket", 0.35);
      pushEvent({
        agent: "dispatcher",
        next: "archivist",
        stage: "handout",
        pair,
        title: halted ? `HALT ${label}` : `HOLD ${label}`,
        detail: halted ? "daily halt — no new tickets" : grokReason,
        tone: halted ? "warn" : "info",
      });
      bumpAgent("archivist", "journal hold", 0.4);
      emitPulse({ from: "signal", to: "archivist" });
      pushQueue({
        title: halted ? `HALT ${label}` : `HOLD ${label}`,
        detail: halted ? "daily halt — no new tickets" : grokReason,
        severity: halted ? "stall" : "playbook",
        pair,
      });
      return;
    }
    if (heatReady && ticketKind !== "sell") {
      ticketKind = "buy";
      playbook = playbook ?? "scalp";
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
    if (!flow.ok && ticketKind === "buy") {
      const heatWide = sleeve === "heat" && flow.spreadPct <= 0.025;
      const hard = !paper && !heatWide && (s0.mode === "live" || flow.spreadPct > 0.004);
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

    const st = useFloor.getState();
    const liveHalt = st.mode === "live" || st.liveArmed;
    const sleeveNow = liveHalt
      ? liveSleeve({
          liveBudget: st.liveBudget,
          liveBalance: st.liveBalance,
          positions: st.positions,
          tickers: st.tickers,
        })
      : null;
    const gateBase = liveHalt
      ? st.dayStartEquity > 0 && st.dayStartEquity <= st.liveBudget * 1.25
        ? st.dayStartEquity
        : (sleeveNow?.equity ?? st.liveBudget)
      : st.dayStartEquity || st.startingCash;
    const dayPnl = liveHalt
      ? bookDayPnl(sleeveNow?.equity ?? 0, gateBase)
      : bookDayPnl(markEquity(st), gateBase);
    const maxLoss = liveHalt
      ? haltCapUsd(st.liveBudget, st.risk.maxDailyLossPct, MIN_LIVE_HALT_USD)
      : gateBase * st.risk.maxDailyLossPct;
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
    const cooldown =
      sleeve === "heat" ? SCALP.cooldownMs : Math.min(st.risk.cooldownMs, 45_000);
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

    const liveDesk = Boolean(keysOn);
    const order: Order = {
      id: uid("ord"),
      pair,
      side: verdict.side,
      qty: verdict.qty,
      price,
      status: "queued",
      mode: liveDesk ? "live" : "paper",
      reason: `${(playbook ?? "scalp").toUpperCase()} · MACD ${lane} · ${read.reason}`,
      book: playbook ?? "scalp",
      ts: Date.now(),
    };

    if (liveDesk) {
      const ready = autoBotReady(useFloor.getState());
      if (!ready.ok) {
        bumpAgent("runner", ready.why, 0.7);
        pushQueue({
          title: "AUTO WAIT",
          detail: ready.why,
          severity: "empty",
          pair,
        });
        return;
      }
      if (!st.liveArmed || !st.autoTrade) {
        patch({ liveArmed: true, mode: "live", venueId: "kraken", autoTrade: true, floorOpen: true, launched: true });
      }
      bumpAgent("runner", `SEND ${order.side.toUpperCase()} ${label}`, 1);
      pushEvent({
        agent: "runner",
        next: "archivist",
        stage: "signed",
        pair,
        title: `SEND ${order.side.toUpperCase()} ${label}`,
        detail: `${order.qty} @ ${px(price)} · Kraken market → USD book`,
        tone: "good",
      });
      pushQueue({
        title: `SEND ${order.side.toUpperCase()} ${label}`,
        detail: `market ${order.qty} on Kraken`,
        severity: "playbook",
        pair,
      });
      await executeOrder(order);
      return;
    }

    bumpAgent("runner", "Kraken keys missing — no ticket", 0.7);
    pushQueue({
      title: "NO KRAKEN ORDER",
      detail: "keys missing — watching the tape is not a fill",
      severity: "empty",
      pair,
    });
    return;
  } finally {
    evaluating.delete(pair);
  }
}

function workingPurse(): { ok: true; cash: number } | { ok: false; why: string } {
  const s = useFloor.getState();
  const live = Boolean(krakenKeysOn(s.keys)) || s.liveArmed || s.mode === "live";
  if (!live) return { ok: true, cash: s.cash };
  if (!krakenKeysOn(s.keys)) {
    return { ok: false, why: "no Kraken keys — paste them in settings" };
  }
  if (!hasKrakenBook(s.liveBalance)) {
    return { ok: false, why: "treasury has not read the Kraken wallet yet" };
  }
  const sleeve = liveSleeve({
    liveBudget: s.liveBudget,
    liveBalance: s.liveBalance,
    positions: s.positions,
    tickers: s.tickers,
  });
  if (sleeve.btcUsd >= MIN_LIVE_TICKET) {
    return { ok: true, cash: sleeve.cash };
  }
  if (sleeve.usd < 12 && sleeve.usdt >= 12) {
    return {
      ok: false,
      why: `USDT ${sleeve.usdt.toFixed(0)} is on Kraken — convert it to USD or keep BTC as the book.`,
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
  const live = Boolean(krakenKeysOn(s.keys)) || s.liveArmed || s.mode === "live";
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
  const remaining = live ? cash : Math.min(cash, s.liveBudget || 200);
  const defQuote = def.quote;
  const btcPx = s.tickers.XBTUSD?.last ?? 0;
  if (live && isBtcUsd(pair)) return { ok: false, why: "BTC is the reserve — not sold for USD" };
  if (live && (defQuote === "XBT" || defQuote === "BTC")) {
    const btcHave = spotQty(s.liveBalance, "BTC");
    const usd = budgetStake({
      remaining,
      confidence,
      pWin: wr,
      payoff,
      heat: sleeveKind === "heat",
    });
    if (!(usd > 0) || !(btcPx > 0)) return { ok: false, why: "under min BTC ticket" };
    const btcSpend = Math.min(btcHave * 0.98, usd / btcPx);
    if (!(btcSpend * btcPx >= MIN_LIVE_TICKET)) {
      return { ok: false, why: "need more BTC on Kraken for an XBT ticket" };
    }
    let qty = btcSpend / price;
    qty = Number(qty.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
    if (qty < def.ordermin) return { ok: false, why: "below Kraken ordermin" };
    return { ok: true, qty, side: "buy" };
  }
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
  let rounded = Number(qty.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
  if (rounded < def.ordermin) {
    const need = def.ordermin * price;
    if (live && need <= cash * 0.98 && need <= 80) {
      rounded = Number(def.ordermin.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
    } else {
      return { ok: false, why: `need $${need.toFixed(0)} USD for Kraken min ${def.base}` };
    }
  }
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
  const keys = krakenKeysOn(s.keys);
  const wantLive = s.liveArmed || s.mode === "live" || order.mode === "live";
  if (wantLive) {
    if (!keys) {
      patch({ pendingLive: order, mode: "live" });
      bumpAgent("runner", "waiting on Kraken keys", 0.7);
      return;
    }
  if (s.liveArmed || s.mode === "live") {
    if (isBtcUsd(order.pair) && order.side === "sell") {
      bumpAgent("treasury", "blocked BTC dump — reserve stays", 0.9);
      pushEvent({
        agent: "treasury",
        stage: "signed",
        pair: order.pair,
        title: "SKIP SELL BTC",
        detail: "BTC is the working book. Not sold for USD to buy alts.",
        tone: "warn",
      });
      return;
    }
  }
    try {
      const def = getPair(order.pair) ?? PAIR_BY_ID[order.pair];
      if (!def) throw new Error("Unknown pair");
      let qty = order.qty;
      if (order.side === "sell") {
        const held = spotQty(useFloor.getState().liveBalance, def.base);
        const flatten = pairSleeve(order.pair) === "heat" || /HEAT RECEIPT|SL|TIME/i.test(order.reason);
        qty = flatten ? held : Math.min(qty, held * 0.999);
        qty = Number(qty.toFixed(Math.min(def.decimals, 8)));
        if (!(qty >= def.ordermin) || !(held > 0)) {
          dropPhantomLot(order.pair);
          bumpAgent("runner", `no ${def.base} on Kraken — lot cleared`, 0.8);
          pushEvent({
            agent: "runner",
            stage: "signed",
            pair: order.pair,
            title: `SKIP SELL ${def.label}`,
            detail: "Nothing to sell on Kraken — local lot dropped",
            tone: "warn",
          });
          return;
        }
      }
      const volume = qty.toFixed(Math.min(def.decimals, 8));
      const venue = getLiveVenue("kraken");
      const res = await venue.placeMarketOrder({
        apiKey: keys.apiKey,
        apiSecret: keys.apiSecret,
        pair: order.pair,
        side: order.side,
        volume,
        kraken: def.kraken,
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
      if (res.txid) void settleLiveFee(res.txid, filled.id, keys.apiKey, keys.apiSecret);
      pushEvent({
        agent: "runner",
        next: "archivist",
        stage: "signed",
        pair: order.pair,
        title: `LIVE FILL ${order.side.toUpperCase()} ${def.label}`,
        detail: res.descr || res.txid,
        tone: "good",
      });
      pushQueue({
        title: `LIVE FILL ${order.side.toUpperCase()} ${def.label}`,
        detail: res.descr || res.txid || "filled on Kraken",
        severity: "playbook",
        pair: order.pair,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kraken reject";
      if (order.side === "sell" && /insufficient funds/i.test(msg)) {
        dropPhantomLot(order.pair);
        bumpAgent("runner", "Kraken had no inventory — lot cleared", 0.8);
        pushEvent({
          agent: "runner",
          stage: "signed",
          pair: order.pair,
          title: `SKIP SELL ${getPair(order.pair)?.label ?? order.pair}`,
          detail: "Insufficient funds on sell — nothing on Kraken to flatten",
          tone: "warn",
        });
        return;
      }
      const rejected: Order = {
        ...order,
        mode: "live",
        status: "rejected",
        reason: msg,
      };
      patch({ orders: [rejected, ...useFloor.getState().orders].slice(0, 80) });
      bumpAgent("runner", "Kraken reject", 1);
      pushQueue({
        title: "KRAKEN REJECT",
        detail: msg,
        severity: "stall",
        pair: order.pair,
      });
      toastLiveReject(order, msg);
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
    title: `PAPER FILL ${order.side.toUpperCase()} ${pairLabel(order.pair)}`,
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
        bumpAgent("hunter", `studied ${pairBase(pair)}`, 0.85);
        bumpAgent("signal", mem.bestSetup, 0.8);
      } catch {
        bumpAgent("sentinel", `study miss ${pair}`, 0.6);
      }
    }
    {
      const st = useFloor.getState();
      const samplePair = st.pairs[0];
      const closes = samplePair ? (st.candles[samplePair] ?? []).map((c) => c.close) : [];
      const stance = closes.length >= 60 ? dailyStance(closes).stance : "chop";
      patch({
        brain: learnFromIndustry(st.brain, {
          wire: st.wire ?? [],
          fearGreed: st.fearGreed,
          dailyStance: stance,
        }),
      });
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

async function settleLiveFee(txid: string, orderId: string, apiKey: string, apiSecret: string) {
  try {
    await new Promise((r) => setTimeout(r, 600));
    const q = await fetchOrderFill({ data: { apiKey, apiSecret, txid } });
    if (!(q.fee > 0)) return;
    const notion = q.cost > 0 ? q.cost : 0;
    const sample = learnTaker(notion || 1, q.fee);
    useFloor.setState((s) => {
      const orders = s.orders.map((o) => (o.id === orderId ? { ...o, fee: q.fee } : o));
      const order = orders.find((o) => o.id === orderId);
      const positions = s.positions.map((p) =>
        order && p.pair === order.pair && order.side === "buy"
          ? { ...p, fee: q.fee }
          : p,
      );
      return {
        orders,
        positions,
        liveTakerPct: blendTaker(s.liveTakerPct, sample),
      };
    });
    bumpAgent("treasury", `Kraken fee ${q.fee.toFixed(2)}`, 0.7);
  } catch {
    /* estimate stands */
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
    const def = getPair(order.pair) ?? PAIR_BY_ID[order.pair];
    const taker = takerPct(def?.quote ?? "USD", s.liveTakerPct);
    const fee = order.fee ?? feeOn(fill * order.qty, taker);
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
      const pnl = netPnl({
        entry: existing.entry,
        exit: fill,
        qty: sellQty,
        taker,
        entryFee: existing.fee,
        exitFee: fee,
      });
      closePnl = pnl;
      realized += pnl;
      if (!liveFill) cash += fill * sellQty - fee;
      if (sellQty + 1e-12 < existing.qty) {
        const remain = existing.qty - sellQty;
        const remainNet = netPnl({
          entry: existing.entry,
          exit: fill,
          qty: remain,
          taker,
          entryFee: existing.fee,
        });
        const heatBank = /HEAT BANK/i.test(order.reason);
        positions = positions.map((p) =>
          p.pair === order.pair
            ? {
                ...p,
                qty: remain,
                mark: fill,
                banked: p.banked || heatBank,
                peakPnlUsd: remainNet,
              }
            : p,
        );
        if (!heatBank && !reason.includes("HEAT")) reason = `${reason} · GRID OUT`;
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
      const heat = (getPair(order.pair) ?? PAIR_BY_ID[order.pair])?.sleeve === "heat";
      const band = liveFill ? feeAwareStops(entry, heat, taker) : bookStops(pb, entry, heat);
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
              fee: (existing.fee ?? 0) + fee,
              costUsd: (existing.costUsd ?? existing.entry * existing.qty) + fill * order.qty,
            }
          : p,
      );
      if (!liveFill) cash -= fill * order.qty + fee;
    } else {
      if (!liveFill) cash -= fill * order.qty + fee;
      const heat = (getPair(order.pair) ?? PAIR_BY_ID[order.pair])?.sleeve === "heat";
      const pb = asPlaybook(order.book ?? "scalp");
      const band = liveFill ? feeAwareStops(fill, heat, taker) : bookStops(pb, fill, heat);
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
          fee,
          costUsd: fill * order.qty,
          peakPnlUsd: 0,
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
  }

  if (closePnl != null && /HEAT RECEIPT/i.test(order.reason)) {
    const def = getPair(order.pair) ?? PAIR_BY_ID[order.pair];
    pushEvent({
      agent: "archivist",
      stage: "signed",
      pair: order.pair,
      title: `RECEIPT ${def?.base ?? order.pair}`,
      detail: `sold to USD · net ${money(closePnl)} after fees · 15% off peak profit`,
      tone: closePnl >= 0 ? "good" : "warn",
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

function dropPhantomLot(pair: PairId) {
  useFloor.setState((s) => ({
    positions: s.positions.filter((p) => p.pair !== pair),
  }));
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
      if (o.mode === "live" && !o.krakenTxid) continue;
      if (s.mode === "live" && o.mode !== "live") continue;
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
  p: {
    openedAt: number;
    entry: number;
    mark: number;
    stop: number;
    take: number;
    qty: number;
    fee?: number;
    pair?: PairId;
    banked?: boolean;
    peakPnlUsd?: number;
    costUsd?: number;
  },
  liveTaker = 0,
): { action: BookAction; stop: number; sellFrac: number } {
  if (playbook === "grid") return gridManage(p);
  if (playbook === "dca") return dcaManage(p);
  const heat = p.pair ? pairSleeve(p.pair) === "heat" : false;
  const m = scalpManage(
    { ...p, heat },
    Date.now(),
    takerPct(p.pair ? getPair(p.pair)?.quote ?? "USD" : "USD", liveTaker),
  );
  const quote = p.pair ? getPair(p.pair)?.quote ?? "USD" : "USD";
  const taker = takerPct(quote, liveTaker);
  const net = netPnl({
    entry: p.entry,
    exit: p.mark,
    qty: p.qty,
    taker,
    entryFee: p.fee,
  });
  if (heat) {
    if (m.action === "hold") return { action: "hold", stop: m.stop, sellFrac: 0 };
    if (m.action === "stop") return { action: "stop", stop: m.stop, sellFrac: 1 };
    return { action: "take", stop: m.stop, sellFrac: 1 };
  }
  if (m.action === "take") {
    if (net < MIN_NET_USD) return { action: "hold", stop: m.stop, sellFrac: 0 };
    return { action: "take", stop: m.stop, sellFrac: 1 };
  }
  if (m.action === "time") {
    if (p.mark > p.entry && net >= MIN_NET_USD) return { action: "take", stop: m.stop, sellFrac: 1 };
    if (p.mark <= p.entry) return { action: "stop", stop: m.stop, sellFrac: 1 };
    return { action: "hold", stop: m.stop, sellFrac: 0 };
  }
  return { action: m.action, stop: m.stop, sellFrac: m.action === "hold" ? 0 : 1 };
}

function checkStops() {
  const s = useFloor.getState();
  const book = s.mode === "live" || s.liveArmed ? livePositions(s.positions) : s.positions;
  if (!s.launched || book.length === 0) return;
  if (s.mode === "live" && !s.liveArmed && !s.floorOpen) return;
  let trailed = false;
  const nextPos = s.positions.map((p) => {
    if (book.every((b) => b.id !== p.id)) return p;
    const mark = s.tickers[p.pair]?.last ?? p.mark;
    const def = getPair(p.pair) ?? PAIR_BY_ID[p.pair];
    const taker = takerPct(def?.quote ?? "USD", s.liveTakerPct);
    const net = netPnl({
      entry: p.entry,
      exit: mark,
      qty: p.qty,
      taker,
      entryFee: p.fee,
    });
    const peakPnlUsd = Math.max(p.peakPnlUsd ?? net, net);
    const pb = asPlaybook(p.book);
    const managed = manageOpenLot(pb, { ...p, mark, peakPnlUsd }, s.liveTakerPct);
    if (managed.stop !== p.stop || peakPnlUsd !== (p.peakPnlUsd ?? 0)) trailed = true;
    return { ...p, mark, stop: managed.stop, peakPnlUsd };
  });
  if (trailed) patch({ positions: nextPos });

  for (const p of nextPos) {
    if ((s.mode === "live" || s.liveArmed) && p.mode !== "live") continue;
    if ((s.mode === "live" || s.liveArmed) && p.pair === "XBTUSD") continue;
    if ((s.mode === "live" || s.liveArmed) && !p.krakenTxid) {
      dropPhantomLot(p.pair);
      continue;
    }
    const pb = asPlaybook(p.book);
    const managed = manageOpenLot(pb, p, s.liveTakerPct);
    if (managed.action === "hold") continue;
    if (flattening.has(p.id)) continue;
    flattening.add(p.id);
    const def = getPair(p.pair) ?? PAIR_BY_ID[p.pair];
    if (!def) {
      flattening.delete(p.id);
      continue;
    }
    const heat = pairSleeve(p.pair) === "heat";
    const frac = heat ? 1 : managed.sellFrac <= 0 ? 1 : managed.sellFrac;
    let qty = frac >= 0.999 ? p.qty : p.qty * frac;
    qty = Number(qty.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
    if (qty < def.ordermin) qty = p.qty;
    if (qty > p.qty) qty = p.qty;
    const side = p.side === "buy" ? "sell" : "buy";
    const reason =
      heat && (managed.action === "take" || managed.action === "time")
        ? "HEAT RECEIPT"
        : managed.action === "stop"
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
    bumpAgent("sentinel", `${reason} ${def.base}`, 1);
    bumpAgent("runner", `flatten ${def.base}`, 1);
    void executeOrder(order).finally(() => flattening.delete(p.id));
  }
}

function idleChatter() {
  const s = useFloor.getState();
  if (!s.floorOpen && !s.liveArmed) return;
  const tickerPairs = s.pairs.filter((p) => s.tickers[p]);
  const pair = tickerPairs[Math.floor(Math.random() * Math.max(tickerPairs.length, 1))];
  const label = pair ? (getPair(pair) ?? PAIR_BY_ID[pair])?.label ?? pair : "the tape";
  const wr = s.brain.samples ? Math.round((s.brain.wins / s.brain.samples) * 100) : 0;
  const live = s.liveArmed || s.mode === "live";
  const n = 1;
  for (let i = 0; i < n; i++) {
    const a = AGENTS[Math.floor(Math.random() * AGENTS.length)]!;
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
    bumpAgent(a.id, lines[a.id], live ? 0.7 + Math.random() * 0.3 : 0.35 + Math.random() * 0.25);
    pushEvent({
      agent: a.id,
      stage: "brief",
      pair: pair ?? undefined,
      title: a.id.toUpperCase(),
      detail: lines[a.id],
      tone: "info",
    });
  }
}

async function refreshWire() {
  try {
    const res = await fetchWire();
    useFloor.getState().setWire(res.items, res.fearGreed);
    patch({
      brain: learnFromIndustry(useFloor.getState().brain, {
        wire: res.items,
        fearGreed: res.fearGreed,
      }),
    });
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
    if (!s.launched && !krakenKeysOn(s.keys)) {
      return { ok: true, acted: false, note: "Connect Kraken to scan." };
    }
    if (!s.floorOpen) {
      patch({ floorOpen: true, launched: true, autoTrade: true });
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
    const def = getPair(best.pair) ?? PAIR_BY_ID[best.pair];
      return {
        ok: true,
        acted: true,
        note: `${best.kind.toUpperCase()} ${def?.label ?? best.pair} · ${best.reason} · ${(best.confidence * 100).toFixed(0)}%`,
      };
    }
    const hold = [...latestByPair.values()][0];
    const holdDef = hold ? getPair(hold.pair) ?? PAIR_BY_ID[hold.pair] : null;
    return {
      ok: true,
      acted: false,
      note: hold
        ? `HOLD ${holdDef?.label ?? hold.pair} · RSI ${hold.rsi.toFixed(0)} · ${hold.reason}`
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
    const venue = getLiveVenue("kraken");
    const bal = await venue.fetchBalance(s.keys);
    useFloor.getState().setLiveBalance(bal);
    useFloor.getState().setKeysOk(true);
    patch({ liveArmed: true, autoTrade: true, mode: "live", floorOpen: true, launched: true });
    const usd = usdOnBook(bal);
    bumpAgent("treasury", `Kraken USD ${usd.toFixed(2)}`, 0.7);
    bumpAgent("runner", usd >= MIN_LIVE_TICKET ? "AUTO BOT ON" : "AUTO WAIT — need USD", 1);
    pushEvent({
      agent: "runner",
      stage: "signed",
      title: usd >= MIN_LIVE_TICKET ? "AUTO BOT ON" : "AUTO WAIT",
      detail:
        usd >= MIN_LIVE_TICKET
          ? `Kraken USD ${usd.toFixed(2)} · heat scalp live`
          : `USD ${usd.toFixed(2)} — deposit ≥$${MIN_LIVE_TICKET} to fire`,
      tone: usd >= MIN_LIVE_TICKET ? "good" : "warn",
    });
    const pending = useFloor.getState().pendingLive;
    if (pending && krakenKeysOn(useFloor.getState().keys)) {
      useFloor.getState().setPendingLive(null);
      void executeOrder(pending);
    }
  } catch (err) {
    const why = err instanceof Error ? err.message : "Balance call failed";
    const soft =
      /rate limit|nonce too low|backing off|EService:Unavailable|network|fetch failed|timeout/i.test(
        why,
      );
    if (!soft) {
      useFloor.getState().setKeysOk(false);
      bumpAgent("treasury", "Kraken auth failed", 1);
      pushQueue({
        title: "KRAKEN AUTH",
        detail: why,
        severity: "stall",
      });
      pushEvent({
        agent: "treasury",
        stage: "signed",
        title: "KRAKEN AUTH FAIL",
        detail: `${why} · re-paste Query+Orders keys and tap Test`,
        tone: "bad",
      });
    } else {
      bumpAgent("treasury", why.slice(0, 42), 0.6);
      pushQueue({
        title: "KRAKEN RETRY",
        detail: why,
        severity: "stall",
      });
    }
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
      const venue = getLiveVenue("kraken");
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
  if (s.mode === "live" || s.liveArmed) {
    useFloor.setState({ lastEngineAt: now, launched: true, floorOpen: true, autoTrade: true });
    if (s.keys.apiKey && s.keys.apiSecret) void refreshTreasury();
    void refreshTickersRest().then(() => refreshOhlcAll());
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

function tabShouldRun(): boolean {
  const s = useFloor.getState();
  if (s.liveArmed || s.mode === "live" || s.floorOpen) return true;
  if (typeof document === "undefined") return true;
  return !document.hidden;
}

export function startEngine(): () => void {
  if (running) return () => stopEngine();
  running = true;
  ensureLiveDesk();
  restoreOrphanLots();
  if (!useFloor.getState().shiftStartedAt) {
    patch({ shiftStartedAt: Date.now() });
  }
  const st0 = useFloor.getState();
  if (st0.mode === "live" || st0.liveArmed) {
    const sleeve = liveSleeve({
      liveBudget: st0.liveBudget,
      liveBalance: st0.liveBalance,
      positions: st0.positions,
      tickers: st0.tickers,
    });
    const openLive = livePositions(st0.positions).length;
    if (
      openLive === 0 &&
      sleeve.equity > 0 &&
      st0.dayStartEquity > 0 &&
      st0.dayStartEquity < sleeve.equity * 0.6
    ) {
      patch({ dayStartEquity: sleeve.equity });
    }
  }
  seedHistory();
  applySessionEnd();
  for (const a of AGENTS) bumpAgent(a.id, "on the desk", 0.72);
  if (modOn("catchup")) {
    void catchUpAway().then((rep) => {
      flushFloorPersist();
      if (rep && rep.awayMs >= 90_000) toastAwayReplay(rep.awayMs, rep.fills, rep.pnl);
    });
  }
  if (modOn("scout") || !modOn("core")) void runScout();

  const heartbeat = window.setInterval(() => {
    patch({ lastEngineAt: Date.now() });
  }, 5_000);
  const persistPulse = window.setInterval(() => {
    flushFloorPersist();
  }, 8_000);

  const tick = window.setInterval(() => {
    if (!tabShouldRun()) return;
    coolAgents(0.25);
    sampleEquity();
  }, 500);
  const chatter = window.setInterval(idleChatter, 8000);
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
    const st = useFloor.getState();
    if (!running) return;
    if (!st.launched && !krakenKeysOn(st.keys)) return;
    void refreshOhlcAll();
  }, 5_000);
  const stageSpin = window.setInterval(() => {
    if (!tabShouldRun()) return;
    const s = useFloor.getState();
    if (!s.launched || !s.floorOpen) return;
    const i = STAGE_CYCLE.indexOf(s.stage);
    const busy = Object.values(s.agents).some((a) => a.heat > 0.55);
    if (!busy) patch({ stage: STAGE_CYCLE[(i + 1) % STAGE_CYCLE.length]! });
  }, 3800);
  const simPulse = window.setInterval(() => {
    if (!tabShouldRun()) return;
    if (useFloor.getState().feedSource !== "sim") return;
    const st = useFloor.getState();
    if (!bookNeedsProtect(st)) return;
    runSimTick();
    checkStops();
  }, 1200);
  const session = window.setInterval(applySessionEnd, 1000);
  const treasury = window.setInterval(() => {
    void refreshTreasury();
  }, 15_000);
  const wire = window.setInterval(() => {
    if (!modOn("wire")) return;
    void refreshWire();
  }, 180_000);
  const scout = window.setInterval(() => {
    if (modOn("scout") || !modOn("core")) void runScout();
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
    await refreshTreasury();
    await refreshTickersRest();
    await refreshOhlcAll();
    if (modOn("wire")) await refreshWire();
    sampleEquity(true);
  })();

  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    patch({ lastEngineAt: Date.now() });
    if (modOn("catchup")) void catchUpAway();
    void refreshTickersRest();
  };
  document.addEventListener("visibilitychange", onVis);
  visHandler = onVis;

  return () => stopEngine();
}

export function stopEngine() {
  running = false;
  patch({ lastEngineAt: Date.now() });
  flushFloorPersist();
  if (visHandler) {
    document.removeEventListener("visibilitychange", visHandler);
    visHandler = null;
  }
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
