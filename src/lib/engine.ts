import { AGENT_BY_ID, AGENTS } from "./agents";
import { emitPulse } from "./bus";
import { uid, px } from "./format";
import { readSignal } from "./indicators";
import { PAIR_BY_ID } from "./kraken";
import {
  cancelAllOrders,
  fetchBalance,
  fetchOhlc,
  fetchTickers,
  placeMarketOrder,
} from "./kraken-api";
import { connectTickerFeed } from "./kraken-ws";
import { learnFromClose, pairMinConf } from "./learn";
import { makeSimCandles, stepSim } from "./sim-feed";
import { hunterScore, readFlow, readRegime, usdOnBook } from "./specialists";
import { fetchWire } from "./wire-api";
import { markEquity, useFloor, type FloorState } from "./store";
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
let demoLock = false;

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function patch(partial: Partial<FloorState>) {
  useFloor.setState((s) => ({ ...s, ...partial }));
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

function setStage(stage: PipelineStage) {
  patch({ stage });
}

function applyTicker(t: Ticker) {
  const s = useFloor.getState();
  const tickers = { ...s.tickers, [t.pair]: t };
  const positions = s.positions.map((p) =>
    p.pair === t.pair ? { ...p, mark: t.last } : p,
  );
  patch({
    tickers,
    positions,
    lastFeedAt: Date.now(),
    ticks: s.ticks + 1,
  });
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

async function refreshOhlcAll() {
  const s = useFloor.getState();
  if (s.pairs.length === 0) return;
  const useSim = s.feedSource === "sim";
  const interval = s.mode === "live" ? 5 : 1;
  const open = new Set(s.positions.map((p) => p.pair));
  const ranked = s.pairs
    .map((pair) => ({
      pair,
      score: hunterScore(pair, s.tickers[pair], s.brain, open.has(pair), s.wire),
    }))
    .sort((a, b) => b.score - a.score);

  const take = s.mode === "paper" ? 6 : 4;
  const picked: typeof ranked = [];
  for (const row of ranked) {
    if (open.has(row.pair) || picked.length < take) picked.push(row);
  }

  const top = picked[0];
  if (top) {
    const def = PAIR_BY_ID[top.pair];
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
          ? makeSimCandles(row.pair)
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
  if (evaluating.has(pair)) return;
  pipelineLock = pipelineLock.then(() => evaluatePair(pair, candles)).catch(() => {});
}

async function evaluatePair(pair: PairId, candles: { close: number; volume: number }[]) {
  const s0 = useFloor.getState();
  if (!s0.floorOpen) return;
  evaluating.add(pair);
  try {
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);
    const brain = s0.brain;
    const read = readSignal(closes, volumes, brain);
    const ticker = s0.tickers[pair];
    const price = ticker?.last ?? closes[closes.length - 1]!;
    const label = PAIR_BY_ID[pair].label;
    const minConf =
      s0.mode === "paper" ? Math.min(pairMinConf(brain, pair), 0.42) : pairMinConf(brain, pair);

    setStage("brief");
    bumpAgent("scanner", `brief ${label}`, 0.85);
    pushEvent({
      agent: "scanner",
      next: "dispatcher",
      stage: "brief",
      pair,
      title: `${label} on the tape`,
      detail: `${read.reason} · ${px(price)}`,
      tone: "info",
    });
    await sleep(220);

    setStage("split");
    bumpAgent("hunter", `rank ${label}`, 0.85);
    emitPulse({ from: "scanner", to: "hunter" });
    patch({ handoff: { from: "scanner", to: "hunter" } });
    await sleep(140);
    bumpAgent("dispatcher", `split ${pair}`, 0.8);
    emitPulse({ from: "hunter", to: "dispatcher" });
    patch({ handoff: { from: "hunter", to: "dispatcher" } });
    await sleep(140);

    setStage("handout");
    bumpAgent("signal", read.kind.toUpperCase(), read.kind === "hold" ? 0.45 : 1);
    emitPulse({ from: "dispatcher", to: "signal" });
    patch({ handoff: { from: "dispatcher", to: "signal" } });

    const signal = {
      id: uid("sig"),
      pair,
      kind: read.kind,
      confidence: read.confidence,
      reason: read.reason,
      rsi: read.rsi,
      emaFast: read.emaFast,
      emaSlow: read.emaSlow,
      macdHist: read.macdHist,
      price,
      ts: Date.now(),
      setup: read.setup,
    };
    patch({ signals: [signal, ...useFloor.getState().signals].slice(0, 40) });
    await sleep(200);

    const sleeve = PAIR_BY_ID[pair].sleeve;
    if (sleeve === "heat" && read.kind === "buy" && (ticker?.changePct ?? 0) < 1.2) {
      bumpAgent("hunter", "heat not rising", 0.7);
      pushEvent({
        agent: "hunter",
        next: "archivist",
        stage: "handout",
        pair,
        title: `HEAT COLD ${label}`,
        detail: `${px(price)} · 24h ${ticker?.changePct?.toFixed(2) ?? "?"}%. Wait for a rising tape`,
        tone: "info",
      });
      return;
    }

    if (read.kind === "hold" || read.confidence < minConf) {
      setStage("tool");
      bumpAgent("risk", "no ticket", 0.35);
      pushEvent({
        agent: "signal",
        next: "archivist",
        stage: "handout",
        pair,
        title: `HOLD ${label}`,
        detail:
          read.confidence < minConf && read.kind !== "hold"
            ? `brain wants ${(minConf * 100).toFixed(0)}% conf · ${read.reason}`
            : read.reason,
        tone: "info",
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
      title: `${read.kind.toUpperCase()} ${label}`,
      detail: `${read.reason} · conf ${(read.confidence * 100).toFixed(0)}% · ${read.setup}`,
      tone: read.kind === "buy" ? "good" : "warn",
    });

    setStage("tool");
    const regime = readRegime(closes);
    bumpAgent("regime", regime.state, 0.9);
    emitPulse({ from: "signal", to: "regime" });
    await sleep(140);
    if (read.kind === "buy" && !regime.allowBuy && read.confidence < 0.78) {
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
    if (!flow.ok && read.kind === "buy") {
      const hard = s0.mode === "live" || flow.spreadPct > 0.004;
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

    const verdict = sizeTicket(pair, read.kind === "buy" ? "buy" : "sell", price, read.confidence);
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
      return;
    }

    const lastAt = lastSignalAt.get(pair) ?? 0;
    const cooldown = st.mode === "paper" ? 90_000 : st.risk.cooldownMs;
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
      mode: st.mode,
      reason: read.reason,
      ts: Date.now(),
    };

    if (st.mode === "live" && !st.autoTrade) {
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

    if (st.mode === "live" && (!st.liveArmed || !st.keys.apiKey || !st.keys.apiSecret)) {
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
  if (s.mode !== "live") return { ok: true, cash: s.cash };
  if (!s.keys.apiKey || !s.keys.apiSecret) {
    return { ok: false, why: "no Kraken keys — paste them in settings" };
  }
  if (!s.liveArmed) return { ok: false, why: "live runner is not armed" };
  const usd = usdOnBook(s.liveBalance);
  if (!s.liveBalance) return { ok: false, why: "treasury has not read the Kraken wallet yet" };
  if (usd < 15) return { ok: false, why: "fund Kraken USD first — wallet under $15" };
  return { ok: true, cash: usd };
}

function sizeTicket(
  pair: PairId,
  side: "buy" | "sell",
  price: number,
  confidence: number,
): { ok: true; qty: number; side: "buy" | "sell" } | { ok: false; why: string } {
  const s = useFloor.getState();
  const liveUsd = usdOnBook(s.liveBalance);
  const cash = s.mode === "live" ? liveUsd : s.cash;
  const equity = s.mode === "live" ? liveUsd + s.positions.reduce((a, p) => a + p.mark * p.qty, 0) : markEquity(s);
  const existing = s.positions.find((p) => p.pair === pair);
  const def = PAIR_BY_ID[pair];
  const bias = s.brain.pairBias[pair] ?? 0;

  if (side === "sell") {
    if (!existing) return { ok: false, why: "no inventory to sell" };
    return { ok: true, qty: existing.qty, side: "sell" };
  }

  if (existing) return { ok: false, why: "already long this pair" };
  if (s.positions.length >= s.risk.maxPositions) {
    return { ok: false, why: "max positions open" };
  }
  if (s.brain.enabled && bias < -0.35) {
    return { ok: false, why: "brain retired this pair" };
  }
  const sleeve = def.sleeve;
  if (sleeve === "heat") {
    const heatOpen = s.positions.filter((p) => PAIR_BY_ID[p.pair].sleeve === "heat").length;
    if (heatOpen >= 2) return { ok: false, why: "heat book full — max 2 meme lots" };
  }
  const tilt = s.brain.enabled ? s.brain.sizeTilt : 1;
  const streakBoost = s.brain.enabled && s.brain.streak >= 3 ? 1.08 : 1;
  const sleeveTilt = sleeve === "heat" ? 0.55 : sleeve === "stock" ? 0.8 : 1;
  const sized =
    (equity *
      s.risk.sizePct *
      tilt *
      sleeveTilt *
      streakBoost *
      (0.7 + confidence * 0.6) *
      (1 + bias)) /
    price;
  const maxQty = (equity * s.risk.maxPosPct * (sleeve === "heat" ? 0.7 : 1)) / price;
  const qty = Math.min(sized, maxQty);
  const notional = qty * price;
  if (notional < 10) return { ok: false, why: "size below min ticket" };
  if (notional > cash * 0.98) return { ok: false, why: "not enough cash" };
  const rounded = Number(qty.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
  if (rounded < def.ordermin) return { ok: false, why: "below Kraken ordermin" };
  return { ok: true, qty: rounded, side: "buy" };
}

export async function executeOrder(order: Order) {
  const s = useFloor.getState();
  if (order.mode === "live") {
    try {
      const def = PAIR_BY_ID[order.pair];
      const volume = order.qty.toFixed(Math.min(def.decimals, 8));
      const res = await placeMarketOrder({
        data: {
          apiKey: s.keys.apiKey,
          apiSecret: s.keys.apiSecret,
          pair: order.pair,
          side: order.side,
          volume,
        },
      });
      const filled: Order = {
        ...order,
        status: "filled",
        fillPrice: order.price,
        krakenTxid: res.txid,
        ts: Date.now(),
      };
      applyFill(filled);
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

function applyFill(order: Order) {
  const s = useFloor.getState();
  const fill = order.fillPrice ?? order.price;
  const fee = order.fee ?? fill * order.qty * 0.0026;
  const existing = s.positions.find((p) => p.pair === order.pair);
  let positions = s.positions.slice();
  let cash = s.cash;
  let realized = s.realized;
  let reason = order.reason;
  let brain = s.brain;

  if (order.side === "sell") {
    if (!existing) {
      patch({
        orders: [{ ...order, status: "rejected" as const, reason: "no inventory" }, ...s.orders].slice(
          0,
          80,
        ),
      });
      return;
    }
    const pnl = (fill - existing.entry) * existing.qty - fee;
    realized += pnl;
    cash += fill * existing.qty - fee;
    positions = positions.filter((p) => p.pair !== order.pair);
    if (!reason.includes("TP") && !reason.includes("SL")) {
      reason = `${reason} · ${pnl >= 0 ? "TP" : "SL"}`;
    }
    const lessonReason = existing.note || order.reason;
    if (lessonReason.includes("DEMO")) {
      bumpAgent("archivist", "demo close — brain skipped", 0.6);
    } else {
      brain = learnFromClose(s.brain, { pair: order.pair, pnl, reason: lessonReason });
      bumpAgent("archivist", brain.lastNote, 1);
      pushEvent({
        agent: "archivist",
        stage: "signed",
        pair: order.pair,
        title: brain.enabled ? (pnl >= 0 ? "brain kept the setup" : "brain cut the setup") : "journal close",
        detail: brain.lastNote,
        tone: pnl >= 0 ? "good" : "bad",
      });
    }
  } else if (existing) {
    const totalQty = existing.qty + order.qty;
    const entry = (existing.entry * existing.qty + fill * order.qty) / totalQty;
    positions = positions.map((p) =>
      p.pair === order.pair ? { ...p, qty: totalQty, entry, mark: fill } : p,
    );
    cash -= fill * order.qty + fee;
  } else {
    cash -= fill * order.qty + fee;
    const stopPct =
      PAIR_BY_ID[order.pair].sleeve === "heat"
        ? Math.max(s.risk.stopPct, 0.032)
        : PAIR_BY_ID[order.pair].sleeve === "stock"
          ? Math.min(s.risk.stopPct, 0.014)
          : s.risk.stopPct;
    const takePct =
      PAIR_BY_ID[order.pair].sleeve === "heat"
        ? Math.max(s.risk.takePct, 0.055)
        : s.risk.takePct;
    const pos: Position = {
      id: uid("pos"),
      pair: order.pair,
      side: "buy",
      qty: order.qty,
      entry: fill,
      mark: fill,
      stop: fill * (1 - stopPct),
      take: fill * (1 + takePct),
      openedAt: Date.now(),
      mode: order.mode,
      krakenTxid: order.krakenTxid,
      note: order.reason,
    };
    positions = [...positions, pos];
  }

  patch({
    cash,
    realized,
    positions,
    orders: [{ ...order, fee, reason }, ...s.orders].slice(0, 80),
    pendingLive: null,
    brain,
  });
  bumpAgent("archivist", "journal fill", 0.85);
  emitPulse({ from: "runner", to: "archivist" });
  sampleEquity(true);
}

function checkStops() {
  const s = useFloor.getState();
  if (!s.floorOpen) return;
  for (const p of s.positions) {
    const mark = s.tickers[p.pair]?.last ?? p.mark;
    const hitStop = p.side === "buy" ? mark <= p.stop : mark >= p.stop;
    const hitTake = p.side === "buy" ? mark >= p.take : mark <= p.take;
    if (!hitStop && !hitTake) continue;
    const side = p.side === "buy" ? "sell" : "buy";
    const order: Order = {
      id: uid("ord"),
      pair: p.pair,
      side,
      qty: p.qty,
      price: mark,
      status: "queued",
      mode: p.mode,
      reason: hitStop ? "SL" : "TP",
      ts: Date.now(),
    };
    bumpAgent("sentinel", hitStop ? "stop hit" : "take hit", 1);
    bumpAgent("runner", `${order.reason} ${p.pair}`, 1);
    void executeOrder(order);
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
    hunter: "ranking the board",
    dispatcher: "routing next brief",
    signal: s.brain.enabled
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
    runner: s.mode === "live" ? "live desk hot" : "paper blotter ready",
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
    if (!s.floorOpen) patch({ floorOpen: true });
    bumpAgent("scanner", s.mode === "paper" ? "1m Kraken scan" : "5m Kraken scan", 1);
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

async function refreshTreasury() {
  const s = useFloor.getState();
  if (!s.keys.apiKey || !s.keys.apiSecret) return;
  try {
    const bal = await fetchBalance({ data: s.keys });
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
  if (s.mode === "live" && s.keys.apiKey && s.keys.apiSecret) {
    try {
      const res = await cancelAllOrders({
        data: { apiKey: s.keys.apiKey, apiSecret: s.keys.apiSecret },
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
    }
  }
}

export function startEngine(): () => void {
  if (running) return () => stopEngine();
  running = true;
  if (!useFloor.getState().shiftStartedAt) {
    patch({ shiftStartedAt: Date.now() });
  }
  seedHistory();

  const tick = window.setInterval(() => {
    coolAgents(0.25);
    sampleEquity();
  }, 250);
  const chatter = window.setInterval(idleChatter, 1600);
  const rest = window.setInterval(() => {
    if (!useFloor.getState().floorOpen) return;
    const src = useFloor.getState().feedSource;
    if (src === "sim") {
      runSimTick();
      checkStops();
      return;
    }
    void refreshTickersRest().then(() => checkStops());
  }, 5000);
  const ohlc = window.setInterval(() => {
    if (!useFloor.getState().floorOpen) return;
    void refreshOhlcAll();
  }, useFloor.getState().mode === "paper" ? 7_000 : 15_000);
  const stageSpin = window.setInterval(() => {
    const s = useFloor.getState();
    if (!s.floorOpen) return;
    const i = STAGE_CYCLE.indexOf(s.stage);
    const busy = Object.values(s.agents).some((a) => a.heat > 0.55);
    if (!busy) patch({ stage: STAGE_CYCLE[(i + 1) % STAGE_CYCLE.length]! });
  }, 3800);
  const simPulse = window.setInterval(() => {
    if (useFloor.getState().feedSource !== "sim") return;
    if (!useFloor.getState().floorOpen) return;
    runSimTick();
    checkStops();
  }, 1200);
  const treasury = window.setInterval(() => {
    void refreshTreasury();
  }, 45_000);
  const wire = window.setInterval(() => {
    void refreshWire();
  }, 180_000);

  timers = [tick, chatter, rest, ohlc, stageSpin, simPulse, treasury, wire];

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
    await refreshOhlcAll();
    await refreshTreasury();
    await refreshWire();
    sampleEquity(true);
  })();

  return () => stopEngine();
}

export function stopEngine() {
  running = false;
  for (const t of timers) window.clearInterval(t);
  timers = [];
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
