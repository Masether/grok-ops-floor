import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { AGENTS } from "./agents.ts";
import { DEFAULT_BRAIN, type Brain, type BrainMsg } from "./learn.ts";
import { DEFAULT_PAIRS, liveWatchPairs } from "./kraken.ts";
import { modOn } from "./desk-mods.ts";
import { btcOnBook, clampLiveBudget, DEFAULT_LIVE_BUDGET, deskIsLive, krakenKeysOn, liveDayBase, livePositions, liveSleeve, pairsFromWallet, restoreLiveBudget } from "./live-budget.ts";
import { hydratePersistedShift, sliceShiftForPersist } from "./persist-shift.ts";
import { clampLaunch, inferLaunched, rejectWalletSecret } from "./launch.mjs";
import { bookDayPnl } from "./desk-pnl.ts";
import {
  GOAL_DEFAULTS,
  asGoalLevel,
  normalizeGoalDays,
  normalizeGoalProfit,
  type GoalLevelId,
} from "./goal.ts";
import {
  DEFAULT_CHART_TYPE,
  DEFAULT_CHART_TOOL,
  DEFAULT_CHART_INDICATORS,
  asChartType,
  asChartTool,
  capChartDrawings,
  normalizeChartDrawings,
  normalizeChartIndicators,
  type ChartDrawing,
  type ChartDrawings,
  type ChartIndicatorState,
  type ChartTool,
  type ChartType,
  type IndicatorId,
} from "./charts.ts";
import {
  DEFAULT_CHART_INTERVAL,
  DEFAULT_SESSION_MINUTES,
  asChartInterval,
  normalizeSessionMinutes,
  sessionEndsAtFromMinutes,
  type ChartInterval,
} from "./session.ts";
import { applyConvertCoin, applyConvertUsd, applySendCoin, applySendUsd, sweepableProfit, type ExternalDest, type VaultLot } from "./wallet.ts";
import { lotsMark } from "./live-pnl.ts";
import { asPlaybook, ALL_PLAYBOOKS, normalizePlaybooks, type PlaybookId } from "./playbook.ts";
import { idleSwarm, type SwarmSnap } from "./swarm.ts";
import type { VenueId } from "./venues/types.ts";
import type {
  AgentId,
  AgentState,
  Candle,
  DeskSnapshot,
  EquityPoint,
  FeedSource,
  Order,
  PairId,
  OpsMode,
  PipelineStage,
  Position,
  QueueItem,
  RiskConfig,
  TapeEvent,
  Ticker,
  TradeMode,
  TradeSignal,
  WireItem,
} from "./types.ts";

function freshAgents(): Record<AgentId, AgentState> {
  const out = {} as Record<AgentId, AgentState>;
  for (const a of AGENTS) {
    out[a.id] = {
      id: a.id,
      status: "idle",
      heat: 0.15,
      lastAction: "on desk",
      lastTs: 0,
      handled: 0,
      delayMs: 48 + a.orbit * 11,
      spark: Array.from({ length: 24 }, (_, i) => 0.2 + ((i * 13 + a.orbit * 7) % 8) / 20),
    };
  }
  return out;
}

export const DEFAULT_RISK: RiskConfig = {
  sizePct: 0.35,
  maxPosPct: 1,
  maxDailyLossPct: 0.15,
  stopPct: 0.0035,
  takePct: 0.0105,
  maxPositions: 6,
  cooldownMs: 12_000,
};

type Keys = { apiKey: string; apiSecret: string };

export type WalletId = "funding" | "trading";

export type DeskTab = "blotter" | "money" | "ticket";

export type TransferKind = "sweep" | "deposit" | "transfer" | "convert" | "send";

export type TransferRow = {
  id: string;
  ts: number;
  from: WalletId;
  to: WalletId;
  amount: number;
  kind?: TransferKind;
  note?: string;
  dest?: ExternalDest;
};


export type FloorState = {
  launched: boolean;
  floorOpen: boolean;
  mode: TradeMode;
  opsMode: OpsMode;
  playbooks: PlaybookId[];
  autoTrade: boolean;
  liveArmed: boolean;
  liveBudget: number;
  liveTakerPct: number;
  venueId: VenueId;
  humanVerified: boolean;
  keys: Keys;
  keysOk: boolean | null;
  pairs: PairId[];
  scoutHot: PairId[];
  scoutScanned: number;
  scoutDropped: number;
  lastScoutAt: number;
  risk: RiskConfig;
  startingCash: number;
  cash: number;
  fundingCash: number;
  vault: VaultLot[];
  autoSweep: boolean;
  sweptTotal: number;
  lifetimePnl: number;
  transfers: TransferRow[];
  realized: number;
  dayStartEquity: number;
  positions: Position[];
  orders: Order[];
  events: TapeEvent[];
  queue: QueueItem[];
  agents: Record<AgentId, AgentState>;
  tickers: Partial<Record<PairId, Ticker>>;
  candles: Partial<Record<PairId, Candle[]>>;
  signals: TradeSignal[];
  equityHistory: EquityPoint[];
  selectedAgent: AgentId | null;
  stage: PipelineStage;
  feedOk: boolean;
  feedError: string | null;
  feedSource: FeedSource;
  lastEngineAt: number;
  lastFeedAt: number;
  shiftStartedAt: number;
  briefs: number;
  ticks: number;
  liveBalance: Record<string, string> | null;
  pendingLive: Order | null;
  inspectPair: PairId | null;
  grokNote: string | null;
  grokBusy: boolean;
  swarm: SwarmSnap;
  settingsOpen: boolean;
  handoff: { from: AgentId; to: AgentId } | null;
  brain: Brain;
  selfLearn: boolean;
  brainOpen: boolean;
  brainChat: BrainMsg[];
  wire: WireItem[];
  fearGreed: { value: number; label: string } | null;
  wireAt: number;
  sessionMinutes: number;
  sessionEndsAt: number | null;
  chartInterval: ChartInterval;
  chartsOpen: boolean;
  deskOpen: boolean;
  deskTab: DeskTab;
  chartType: ChartType;
  chartIndicators: ChartIndicatorState[];
  chartTool: ChartTool;
  chartDrawings: ChartDrawings;
  goalProfit: number;
  goalDays: number;
  goalLevel: GoalLevelId;

  setFloorOpen: (open: boolean) => void;
  setMode: (mode: TradeMode) => void;
  setOpsMode: (mode: OpsMode) => void;
  setPlaybook: (id: PlaybookId) => void;
  togglePlaybook: (id: PlaybookId) => void;
  setAutoTrade: (v: boolean) => void;
  setLiveArmed: (v: boolean) => void;
  setLiveBudget: (n: number) => void;
  setGoal: (input: { goalProfit?: number; goalDays?: number; goalLevel?: GoalLevelId }) => void;
  setVenueId: (id: VenueId) => void;
  setHumanVerified: (v: boolean) => void;
  launchDesk: (
    input: Partial<{
      startingCash: number;
      sizePct: number;
      stopPct: number;
      takePct: number;
      maxDailyLossPct: number;
      maxPositions: number;
      sessionMinutes: number;
      goalProfit: number;
      goalDays: number;
      goalLevel: GoalLevelId;
    }>,
  ) => void;
  stopDesk: () => void;
  setKeys: (keys: Keys) => void;
  setKeysOk: (v: boolean | null) => void;
  setPairs: (pairs: PairId[]) => void;
  setRisk: (risk: Partial<RiskConfig>) => void;
  setStartingCash: (n: number) => void;
  depositFunding: (amount: number) => { ok: true } | { ok: false; reason: string };
  setAutoSweep: (v: boolean) => void;
  sweepProfit: () => { ok: true; amount: number } | { ok: false; reason: string };
  convertWallet: (
    side: "buy" | "sell",
    pair: PairId,
    amount: number,
  ) => { ok: true } | { ok: false; reason: string };
  sendOut: (
    dest: ExternalDest,
    asset: "usd" | PairId,
    amount: number,
    note?: string,
  ) => { ok: true; amount: number } | { ok: false; reason: string };
  transferFunds: (
    from: WalletId,
    to: WalletId,
    amount: number,
  ) => { ok: true } | { ok: false; reason: string };
  resetPaper: () => void;
  selectAgent: (id: AgentId | null) => void;
  setPendingLive: (order: Order | null) => void;
  setInspectPair: (pair: PairId | null) => void;
  setGrokNote: (note: string | null) => void;
  setGrokBusy: (v: boolean) => void;
  setLiveBalance: (b: Record<string, string> | null) => void;
  setSettingsOpen: (v: boolean) => void;
  bumpTicks: () => void;
  setBrain: (brain: Brain) => void;
  setSelfLearn: (v: boolean) => void;
  resetBrain: () => void;
  setBrainOpen: (v: boolean) => void;
  pushBrainChat: (msg: BrainMsg) => void;
  setWire: (items: WireItem[], fearGreed: { value: number; label: string } | null) => void;
  setSessionMinutes: (minutes: number) => void;
  setChartInterval: (n: ChartInterval) => void;
  setChartsOpen: (v: boolean) => void;
  setDeskOpen: (v: boolean) => void;
  setDeskTab: (t: DeskTab) => void;
  setChartType: (t: ChartType) => void;
  toggleChartIndicator: (id: IndicatorId) => void;
  setChartIndicatorParams: (id: IndicatorId, params: Partial<ChartIndicatorState>) => void;
  setChartTool: (t: ChartTool) => void;
  addChartDrawing: (pair: PairId, drawing: ChartDrawing) => void;
  clearChartDrawings: (pair: PairId) => void;
};

export function computeDesk(s: FloorState): DeskSnapshot {
  const live = deskIsLive(s);
  const book = live ? livePositions(s.positions) : s.positions;
  const marked = lotsMark(book, s.tickers);
  const posValue = marked.lots;
  const unrealized = marked.unrealized;
  const sleeve = live
    ? liveSleeve({
        liveBudget: s.liveBudget,
        liveBalance: s.liveBalance,
        positions: s.positions,
        tickers: s.tickers,
      })
    : null;
  const cash = live ? (sleeve?.cash ?? 0) : s.cash;
  const equity = live ? (sleeve?.equity ?? 0) : s.cash + posValue;
  const fills = s.orders.filter(
    (o) => o.status === "filled" && (live ? o.mode === "live" : o.mode !== "live"),
  );
  const wins = fills.filter((o) => o.side === "sell" && (o.pnl ?? 0) > 0).length;
  const losses = fills.filter((o) => o.side === "sell" && (o.pnl ?? 0) < 0).length;
  const realized = live
    ? fills.filter((o) => o.side === "sell").reduce((a, o) => a + (o.pnl ?? 0), 0)
    : s.realized;
  const dayBase = live
    ? liveDayBase({
        dayStart: s.dayStartEquity,
        budget: sleeve?.budget ?? s.liveBudget,
        equity,
        openLots: book.length,
      })
    : s.dayStartEquity > 0
      ? s.dayStartEquity
      : s.startingCash > 0
        ? s.startingCash
        : equity;
  return {
    equity,
    cash,
    exposure: posValue,
    unrealized,
    realized,
    dayPnl: bookDayPnl(equity, dayBase),
    fills: fills.length,
    wins,
    losses,
    briefs: s.briefs,
    openPositions: book.length,
  };
}

export function markEquity(s: FloorState): number {
  if (deskIsLive(s)) {
    return liveSleeve({
      liveBudget: s.liveBudget,
      liveBalance: s.liveBalance,
      positions: s.positions,
      tickers: s.tickers,
    }).equity;
  }
  let posValue = 0;
  for (const p of s.positions) {
    const mark = s.tickers[p.pair]?.last ?? p.mark;
    posValue += mark * p.qty;
  }
  return s.cash + posValue;
}

export function useDesk(): DeskSnapshot {
  return useFloor(useShallow(computeDesk));
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let persistName = "";
let persistValue = "";
let persistBound = false;

function writeFloorPersist() {
  persistTimer = undefined;
  if (!persistName) return;
  try {
    localStorage.setItem(persistName, persistValue);
  } catch {
    try {
      localStorage.removeItem(persistName);
      localStorage.setItem(persistName, persistValue);
    } catch {
      /* quota — keep the desk running */
    }
  }
}

export function flushFloorPersist() {
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  writeFloorPersist();
}

function bindPersistFlush() {
  if (persistBound || typeof window === "undefined") return;
  persistBound = true;
  window.addEventListener("pagehide", flushFloorPersist);
  window.addEventListener("beforeunload", flushFloorPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushFloorPersist();
  });
}

function debounceStorage(ms: number): StateStorage {
  bindPersistFlush();
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      persistName = name;
      persistValue = value;
      if (persistTimer != null) clearTimeout(persistTimer);
      persistTimer = setTimeout(writeFloorPersist, ms);
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* private mode */
      }
    },
  };
}

/** Prevents a second persist.rehydrate() from wiping a desk that just launched. */
let launchedThisSession = false;
let floorHydrate: Promise<void> | null = null;

export function hydrateFloor(): Promise<void> {
  if (!floorHydrate) {
    floorHydrate = Promise.resolve(useFloor.persist.rehydrate()).then(
      () => undefined,
      () => undefined,
    );
  }
  return floorHydrate;
}

export const useFloor = create<FloorState>()(
  persist(
    (set, get) => ({
      launched: true,
      floorOpen: true,
      mode: "live",
      opsMode: "auto",
      playbooks: [...ALL_PLAYBOOKS],
      autoTrade: true,
      liveArmed: false,
      liveBudget: DEFAULT_LIVE_BUDGET,
      liveTakerPct: 0,
      venueId: "kraken",
      humanVerified: true,
      keys: { apiKey: "", apiSecret: "" },
      keysOk: null,
      pairs: DEFAULT_PAIRS,
      scoutHot: [],
      scoutScanned: 0,
      scoutDropped: 0,
      lastScoutAt: 0,
      risk: DEFAULT_RISK,
      startingCash: 10_000,
      cash: 10_000,
      fundingCash: 0,
      vault: [],
      autoSweep: true,
      sweptTotal: 0,
      lifetimePnl: 0,
      transfers: [],
      realized: 0,
      dayStartEquity: 10_000,
      positions: [],
      orders: [],
      events: [],
      queue: [],
      agents: freshAgents(),
      tickers: {},
      candles: {},
      signals: [],
      equityHistory: [],
      selectedAgent: null,
      stage: "brief",
      feedOk: false,
      feedError: null,
      feedSource: "kraken",
      lastFeedAt: 0,
      lastEngineAt: 0,
      shiftStartedAt: 0,
      briefs: 0,
      ticks: 0,
      liveBalance: null,
      pendingLive: null,
      inspectPair: null,
      grokNote: null,
      grokBusy: false,
      swarm: idleSwarm(),
      settingsOpen: false,
      handoff: null,
      brain: DEFAULT_BRAIN,
      selfLearn: true,
      brainOpen: false,
      brainChat: [],
      wire: [],
      fearGreed: null,
      wireAt: 0,
      sessionMinutes: DEFAULT_SESSION_MINUTES,
      sessionEndsAt: null,
      chartInterval: DEFAULT_CHART_INTERVAL,
      chartsOpen: false,
      deskOpen: false,
      deskTab: "blotter",
      chartType: DEFAULT_CHART_TYPE,
      chartIndicators: DEFAULT_CHART_INDICATORS.map((x) => ({ ...x })),
      chartTool: DEFAULT_CHART_TOOL,
      chartDrawings: {},
      goalProfit: 0,
      goalDays: 0,
      goalLevel: GOAL_DEFAULTS.level,

      setFloorOpen: (open) => {
        if (open && !get().launched) return;
        set({ floorOpen: open });
      },
      setMode: (mode) => set({ mode, liveArmed: mode === "live" ? get().liveArmed : false }),
      setOpsMode: (opsMode) => {
        if (!get().launched) return;
        set({
          opsMode,
          autoTrade: opsMode === "auto",
          floorOpen: true,
          selfLearn: true,
          brain: { ...get().brain, enabled: true },
        });
      },
      setPlaybook: (id) => {
        const on = asPlaybook(id);
        const cur = normalizePlaybooks(get().playbooks);
        const next = cur.includes(on) ? cur.filter((x) => x !== on) : [...cur, on];
        set({ playbooks: next.length ? next : [on] });
      },
      togglePlaybook: (id) => get().setPlaybook(id),
      setAutoTrade: (v) => {
        if (v && !get().launched) return;
        set({
          autoTrade: v,
          opsMode: v ? "auto" : get().opsMode === "learn" ? "learn" : "paper",
          floorOpen: v ? true : get().floorOpen,
        });
      },
      setLiveArmed: (v) => {
        if (v) {
          const s = get();
          const sleeve = liveSleeve({
            liveBudget: s.liveBudget,
            liveBalance: s.liveBalance,
            positions: s.positions,
            tickers: s.tickers,
          });
          set({
            liveArmed: true,
            mode: "live",
            venueId: "kraken",
            opsMode: "auto",
            autoTrade: true,
            floorOpen: true,
            autoSweep: true,
            pairs: liveWatchPairs(
              [...DEFAULT_PAIRS.filter((id) => id !== "XBTUSD"), ...s.pairs],
              sleeve.btcUsd,
              !modOn("core"),
            ),
            dayStartEquity: sleeve.equity > 0 ? sleeve.equity : s.liveBudget,
          });
          return;
        }
        set({ liveArmed: false });
      },
      setLiveBudget: (n) => set({ liveBudget: clampLiveBudget(n) }),
      setGoal: (input) => {
        const s = get();
        set({
          goalProfit:
            input.goalProfit != null ? normalizeGoalProfit(input.goalProfit) : s.goalProfit,
          goalDays: input.goalDays != null ? normalizeGoalDays(input.goalDays) : s.goalDays,
          goalLevel: input.goalLevel != null ? asGoalLevel(input.goalLevel) : s.goalLevel,
        });
        queueMicrotask(flushFloorPersist);
      },
      setVenueId: (id) => set({ venueId: id === "paper" ? "paper" : "kraken" }),
      setHumanVerified: (v) => set({ humanVerified: v }),
      launchDesk: (input) => {
        launchedThisSession = true;
        const payload = clampLaunch(input);
        const minutes = normalizeSessionMinutes(input.sessionMinutes ?? 0);
        set({
          launched: true,
          floorOpen: true,
          autoTrade: true,
          opsMode: "auto",
          selfLearn: true,
          mode: "paper",
          liveArmed: false,
          startingCash: payload.startingCash,
          cash: payload.startingCash,
          dayStartEquity: payload.startingCash,
          risk: {
            ...get().risk,
            sizePct: payload.sizePct,
            stopPct: payload.stopPct,
            takePct: payload.takePct,
            maxDailyLossPct: payload.maxDailyLossPct,
            maxPositions: payload.maxPositions,
          },
          sessionMinutes: minutes,
          sessionEndsAt: sessionEndsAtFromMinutes(minutes),
          goalProfit:
            input.goalProfit != null ? normalizeGoalProfit(input.goalProfit) : get().goalProfit,
          goalDays: input.goalDays != null ? normalizeGoalDays(input.goalDays) : get().goalDays,
          goalLevel: input.goalLevel != null ? asGoalLevel(input.goalLevel) : get().goalLevel,
        });
        get().resetPaper();
        queueMicrotask(flushFloorPersist);
      },
      stopDesk: () => set({ floorOpen: false, autoTrade: false, sessionEndsAt: null }),
      setKeys: (keys) => {
        const apiKey = keys.apiKey.replace(/\s+/g, "").trim();
        const apiSecret = keys.apiSecret.replace(/\s+/g, "").trim();
        if (rejectWalletSecret(apiKey) || rejectWalletSecret(apiSecret)) return;
        set({ keys: { apiKey, apiSecret }, keysOk: null, humanVerified: true });
        queueMicrotask(flushFloorPersist);
      },
      setKeysOk: (v) => set({ keysOk: v }),
      setPairs: (pairs) => set({ pairs: pairs.length ? pairs : DEFAULT_PAIRS }),
      setRisk: (risk) => set({ risk: { ...get().risk, ...risk } }),
      setStartingCash: (n) => set({ startingCash: n }),
      depositFunding: (amount) => {
        const n = Math.round(amount * 100) / 100;
        if (!Number.isFinite(n) || n <= 0) return { ok: false as const, reason: "Enter an amount." };
        if (n > 10_000_000) return { ok: false as const, reason: "Cap is $10M per deposit." };
        const s = get();
        const row: TransferRow = {
          id: `${Date.now()}-dep`,
          ts: Date.now(),
          from: "funding",
          to: "funding",
          amount: n,
          kind: "deposit",
          note: "paper deposit",
        };
        set({
          fundingCash: s.fundingCash + n,
          transfers: [row, ...s.transfers].slice(0, 24),
        });
        return { ok: true as const };
      },
      setAutoSweep: (v) => set({ autoSweep: v }),
      sweepProfit: () => {
        const s = get();
        const take = sweepableProfit(s.realized, s.sweptTotal, s.cash);
        if (!(take >= 0.5)) return { ok: false as const, reason: "No free profit to sweep." };
        const row: TransferRow = {
          id: `${Date.now()}-sw`,
          ts: Date.now(),
          from: "trading",
          to: "funding",
          amount: take,
          kind: "sweep",
          note: "profit sweep",
        };
        set({
          cash: s.cash - take,
          fundingCash: s.fundingCash + take,
          sweptTotal: s.sweptTotal + take,
          transfers: [row, ...s.transfers].slice(0, 24),
        });
        return { ok: true as const, amount: take };
      },
      convertWallet: (side, pair, amount) => {
        const s = get();
        const price = s.tickers[pair]?.last ?? 0;
        if (!(price > 0)) return { ok: false as const, reason: "No mark yet — wait for the tape." };
        const res =
          side === "buy"
            ? applyConvertUsd(s.fundingCash, s.vault, pair, amount, price)
            : applyConvertCoin(s.fundingCash, s.vault, pair, amount, price);
        if (!res.ok) return res;
        const usd = side === "buy" ? amount : amount * price;
        const row: TransferRow = {
          id: `${Date.now()}-cv`,
          ts: Date.now(),
          from: "funding",
          to: "funding",
          amount: Math.round(usd * 100) / 100,
          kind: "convert",
          note: `${side} ${pair}`,
        };
        set({
          fundingCash: res.fundingCash,
          vault: res.vault,
          transfers: [row, ...s.transfers].slice(0, 24),
        });
        return { ok: true as const };
      },
      sendOut: (dest, asset, amount, note) => {
        const s = get();
        const destLabel = dest === "coinbase" ? "Coinbase" : "Kraken";
        if (asset === "usd") {
          const res = applySendUsd(s.fundingCash, amount);
          if (!res.ok) return res;
          const n = Math.round(amount * 100) / 100;
          const row: TransferRow = {
            id: `${Date.now()}-out`,
            ts: Date.now(),
            from: "funding",
            to: "funding",
            amount: n,
            kind: "send",
            dest,
            note: note?.trim() || `USD → ${destLabel}`,
          };
          set({
            fundingCash: res.fundingCash,
            transfers: [row, ...s.transfers].slice(0, 24),
          });
          return { ok: true as const, amount: n };
        }
        const price = s.tickers[asset]?.last ?? 0;
        const res = applySendCoin(s.vault, asset, amount, price);
        if (!res.ok) return res;
        const row: TransferRow = {
          id: `${Date.now()}-out`,
          ts: Date.now(),
          from: "funding",
          to: "funding",
          amount: res.usd,
          kind: "send",
          dest,
          note: note?.trim() || `${asset} → ${destLabel}`,
        };
        set({
          vault: res.vault,
          transfers: [row, ...s.transfers].slice(0, 24),
        });
        return { ok: true as const, amount: res.usd };
      },
      transferFunds: (from, to, amount) => {
        const n = Math.round(amount * 100) / 100;
        if (from === to) return { ok: false as const, reason: "Pick two different wallets." };
        if (!Number.isFinite(n) || n <= 0) return { ok: false as const, reason: "Enter an amount." };
        const s = get();
        if (from === "funding") {
          if (n > s.fundingCash + 1e-9) return { ok: false as const, reason: "Not enough in Funding." };
          set({
            fundingCash: s.fundingCash - n,
            cash: s.cash + n,
            startingCash: s.startingCash + n,
            dayStartEquity: s.dayStartEquity + n,
            transfers: [
              {
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                ts: Date.now(),
                from,
                to,
                amount: n,
                kind: "transfer" as const,
              },
              ...s.transfers,
            ].slice(0, 12),
          });
          return { ok: true as const };
        }
        if (n > s.cash + 1e-9) {
          return { ok: false as const, reason: "Not enough free cash on the desk. Close lots first." };
        }
        set({
          fundingCash: s.fundingCash + n,
          cash: s.cash - n,
          startingCash: Math.max(100, s.startingCash - n),
          dayStartEquity: Math.max(0, s.dayStartEquity - n),
          transfers: [
            { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ts: Date.now(), from, to, amount: n },
            ...s.transfers,
          ].slice(0, 12),
        });
        return { ok: true as const };
      },
      resetPaper: () => {
        const cash = get().startingCash;
        set({
          cash,
          realized: 0,
          dayStartEquity: cash,
          positions: [],
          orders: [],
          events: [],
          queue: [],
          signals: [],
          equityHistory: [],
          briefs: 0,
          ticks: 0,
          shiftStartedAt: Date.now(),
          lastEngineAt: Date.now(),
          agents: freshAgents(),
          pendingLive: null,
          swarm: idleSwarm(),
          grokNote: "Grok core online — 300-bot swarm on the rails",
        });
      },
      selectAgent: (id) => set({ selectedAgent: id }),
      setPendingLive: (order) => set({ pendingLive: order }),
      setInspectPair: (pair) => set({ inspectPair: pair }),
      setGrokNote: (note) => set({ grokNote: note }),
      setGrokBusy: (v) => set({ grokBusy: v }),
      setLiveBalance: (b) =>
        set((s) => ({
          liveBalance: b,
          pairs: liveWatchPairs(
            [...pairsFromWallet(b), ...DEFAULT_PAIRS.filter((id) => id !== "XBTUSD"), ...s.pairs],
            btcOnBook(b) * (s.tickers.XBTUSD?.last ?? 0),
            !modOn("core"),
          ),
        })),
      setSettingsOpen: (v) => set({ settingsOpen: v }),
      bumpTicks: () => set({ ticks: get().ticks + 1 }),
      setBrain: (brain) => set({ brain }),
      setSelfLearn: (_v) => set({ selfLearn: true, brain: { ...get().brain, enabled: true } }),
      resetBrain: () =>
        set({
          brain: { ...DEFAULT_BRAIN, enabled: true, assetMemory: get().brain.assetMemory },
        }),
      setBrainOpen: (v) => set({ brainOpen: v }),
      pushBrainChat: (msg) =>
        set({ brainChat: [...get().brainChat, msg].slice(-24) }),
      setWire: (items, fearGreed) => set({ wire: items, fearGreed, wireAt: Date.now() }),
      setSessionMinutes: (minutes) => {
        const n = normalizeSessionMinutes(minutes);
        const launched = get().launched;
        set({
          sessionMinutes: n,
          sessionEndsAt: launched ? sessionEndsAtFromMinutes(n) : null,
        });
      },
      setChartInterval: (n) => set({ chartInterval: asChartInterval(n) }),
      setChartsOpen: (v) => set({ chartsOpen: v }),
      setDeskOpen: (v) => set({ deskOpen: v }),
      setDeskTab: (t) => set({ deskTab: t }),
      setChartType: (t) => set({ chartType: asChartType(t) }),
      toggleChartIndicator: (id) =>
        set((s) => ({
          chartIndicators: s.chartIndicators.map((ind) =>
            ind.id === id ? { ...ind, on: !ind.on } : ind,
          ),
        })),
      setChartIndicatorParams: (id, params) =>
        set((s) => ({
          chartIndicators: s.chartIndicators.map((ind) =>
            ind.id === id ? { ...ind, ...params, id: ind.id } : ind,
          ),
        })),
      setChartTool: (t) => set({ chartTool: asChartTool(t) }),
      addChartDrawing: (pair, drawing) =>
        set((s) => ({
          chartDrawings: capChartDrawings({
            ...s.chartDrawings,
            [pair]: [...(s.chartDrawings[pair] ?? []), drawing],
          }),
        })),
      clearChartDrawings: (pair) =>
        set((s) => {
          const next = { ...s.chartDrawings };
          delete next[pair];
          return { chartDrawings: next };
        }),
    }),
    {
      name: "grok-ops-floor",
      skipHydration: true,
      storage: createJSONStorage(() => debounceStorage(400)),
      partialize: (s) => {
        const shift = sliceShiftForPersist(s);
        return {
          launched: s.launched,
          venueId: s.venueId,
          mode: s.mode,
          opsMode: s.opsMode,
          playbooks: s.playbooks,
          autoTrade: s.autoTrade,
          liveArmed: s.liveArmed,
          liveBudget: s.liveBudget,
          liveTakerPct: s.liveTakerPct,
          keys: s.keys,
          keysOk: s.keysOk,
          liveBalance: s.liveBalance,
          pairs: s.pairs,
          scoutHot: s.scoutHot,
          lastScoutAt: s.lastScoutAt,
          risk: s.risk,
          startingCash: s.startingCash,
          cash: s.cash,
          fundingCash: s.fundingCash,
          vault: s.vault,
          autoSweep: s.autoSweep,
          sweptTotal: s.sweptTotal,
          lifetimePnl: s.lifetimePnl,
          transfers: s.transfers.slice(0, 24),
          realized: s.realized,
          dayStartEquity: s.dayStartEquity,
          positions: s.positions,
          orders: s.orders.slice(-80),
          events: s.events.slice(-40),
          lastEngineAt: s.lastEngineAt,
          shiftStartedAt: s.shiftStartedAt,
          briefs: s.briefs,
          floorOpen: s.floorOpen,
          brain: s.brain,
          selfLearn: s.selfLearn,
          brainChat: s.brainChat.slice(-16),
          equityHistory: shift.equityHistory,
          signals: shift.signals,
          sessionMinutes: s.sessionMinutes,
          sessionEndsAt: s.sessionEndsAt,
          chartInterval: s.chartInterval,
          chartType: s.chartType,
          chartIndicators: s.chartIndicators,
          chartDrawings: capChartDrawings(s.chartDrawings),
          goalProfit: s.goalProfit,
          goalDays: s.goalDays,
          goalLevel: s.goalLevel,
        };
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FloorState>;
        const oldFour = ["XBTUSD", "ETHUSD", "SOLUSD", "XRPUSD"];
        const oldSix = ["XBTUSD", "ETHUSD", "SOLUSD", "PEPEUSD", "WIFUSD", "NVDAxUSD"];
        const sameIds = (have: PairId[] | undefined, want: string[]) =>
          Boolean(
            have &&
              have.length === want.length &&
              [...have].sort().join(",") === [...want].sort().join(","),
          );
        const pairs =
          sameIds(p.pairs, oldFour) || sameIds(p.pairs, oldSix)
            ? DEFAULT_PAIRS
            : (p.pairs ?? current.pairs);
        const shift = hydratePersistedShift(
          {
            cash: p.cash,
            positions: p.positions,
            dayStartEquity: p.dayStartEquity,
            shiftStartedAt: p.shiftStartedAt,
            equityHistory: p.equityHistory,
            signals: p.signals,
            liveArmed: p.liveArmed,
          },
          {
            cash: current.cash,
            positions: current.positions,
            dayStartEquity: current.dayStartEquity,
            shiftStartedAt: current.shiftStartedAt,
            equityHistory: current.equityHistory,
            signals: current.signals,
          },
        );
        const launched = launchedThisSession || inferLaunched(p);
        const venueId: VenueId = p.liveArmed || p.mode === "live" ? "kraken" : p.venueId === "paper" ? "paper" : "kraken";
        const keyed =
          typeof (p.keys ?? current.keys)?.apiKey === "string" &&
          ((p.keys ?? current.keys)?.apiKey?.trim().length ?? 0) > 8 &&
          typeof (p.keys ?? current.keys)?.apiSecret === "string" &&
          ((p.keys ?? current.keys)?.apiSecret?.trim().length ?? 0) > 8;
        const liveOn = keyed;
        return {
          ...current,
          ...p,
          pairs: liveWatchPairs(pairs.length ? pairs : DEFAULT_PAIRS, 0, !modOn("core")),
          launched: launched || keyed,
          venueId: "kraken",
          opsMode: "auto",
          playbooks: ["grid", "dca", "scalp"],
          floorOpen: launched || keyed,
          autoTrade: true,
          agents: current.agents,
          mode: "live",
          liveArmed: liveOn,
          liveBudget: restoreLiveBudget(p.liveBudget ?? current.liveBudget),
          liveTakerPct: typeof p.liveTakerPct === "number" ? p.liveTakerPct : current.liveTakerPct,
          humanVerified: keyed,
          pendingLive: null,
          queue: [],
          swarm: idleSwarm(),
          equityHistory: shift.equityHistory,
          signals: shift.signals,
          dayStartEquity: shift.dayStartEquity,
          shiftStartedAt: shift.shiftStartedAt,
          lastEngineAt: typeof p.lastEngineAt === "number" ? p.lastEngineAt : current.lastEngineAt,
          settingsOpen: false,
          chartsOpen: false,
          deskOpen: false,
          deskTab: "blotter",
          brainOpen: false,
          goalProfit: normalizeGoalProfit(
            typeof p.goalProfit === "number" ? p.goalProfit : current.goalProfit,
          ),
          goalDays: normalizeGoalDays(
            typeof p.goalDays === "number" ? p.goalDays : current.goalDays,
          ),
          goalLevel: asGoalLevel(p.goalLevel ?? current.goalLevel),
          sessionMinutes: 0,
          sessionEndsAt: null,
          chartInterval: asChartInterval(p.chartInterval ?? current.chartInterval),
          chartType: asChartType(p.chartType ?? current.chartType),
          chartIndicators: normalizeChartIndicators(p.chartIndicators ?? current.chartIndicators),
          chartDrawings: normalizeChartDrawings(p.chartDrawings ?? current.chartDrawings),
          chartTool: DEFAULT_CHART_TOOL,
          fundingCash: typeof p.fundingCash === "number" && p.fundingCash >= 0 ? p.fundingCash : 0,
          vault: Array.isArray(p.vault) ? p.vault : [],
          autoSweep: p.autoSweep !== false,
          sweptTotal: typeof p.sweptTotal === "number" && p.sweptTotal >= 0 ? p.sweptTotal : 0,
          lifetimePnl: typeof p.lifetimePnl === "number" ? p.lifetimePnl : 0,
          transfers: Array.isArray(p.transfers) ? p.transfers.slice(0, 24) : [],
          brain: {
            ...DEFAULT_BRAIN,
            ...(p.brain ?? {}),
            pairBias: { ...DEFAULT_BRAIN.pairBias, ...(p.brain?.pairBias ?? {}) },
            setupScore: { ...DEFAULT_BRAIN.setupScore, ...(p.brain?.setupScore ?? {}) },
            bookScore: { ...DEFAULT_BRAIN.bookScore, ...(p.brain?.bookScore ?? {}) },
            hourScore:
              Array.isArray(p.brain?.hourScore) && p.brain.hourScore.length === 24
                ? p.brain.hourScore
                : DEFAULT_BRAIN.hourScore.slice(),
            rejectCount: { ...(p.brain?.rejectCount ?? {}) },
            lessons: p.brain?.lessons ?? [],
            assetMemory: { ...DEFAULT_BRAIN.assetMemory, ...(p.brain?.assetMemory ?? {}) },
          },
          brainChat: Array.isArray(p.brainChat) ? p.brainChat.slice(-16) : [],
        };
      },
    },
  ),
);

/** Open the live Kraken desk. No paper book. */
export function ensureLiveDesk(): boolean {
  const s = useFloor.getState();
  const keyed = Boolean(krakenKeysOn(s.keys));
  useFloor.setState({
    launched: true,
    floorOpen: true,
    autoTrade: true,
    opsMode: "auto",
    mode: "live",
    venueId: "kraken",
    liveArmed: keyed ? true : s.liveArmed,
    playbooks: ["grid", "dca", "scalp"],
    pairs: liveWatchPairs(s.pairs, 0, false),
  });
  return keyed;
}

/** @deprecated live-only desk */
export function ensurePaperDesk(): boolean {
  return ensureLiveDesk();
}

/** First paint is live — don't wait 20s for async persist. */
export function bootFloorFromDisk() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("grok-ops-floor");
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: Partial<FloorState> };
    const p = (parsed.state ?? parsed) as Partial<FloorState>;
    const keyed = Boolean(krakenKeysOn(p.keys));
    useFloor.setState({
      launched: true,
      floorOpen: true,
      autoTrade: true,
      opsMode: "auto",
      mode: "live",
      venueId: "kraken",
      liveArmed: keyed,
      keys: p.keys ?? useFloor.getState().keys,
      keysOk: keyed ? null : false,
      liveBudget: restoreLiveBudget(p.liveBudget),
      liveBalance: p.liveBalance ?? null,
      liveTakerPct: typeof p.liveTakerPct === "number" ? p.liveTakerPct : 0,
      pairs: liveWatchPairs(Array.isArray(p.pairs) ? p.pairs : [], 0, false),
      lastEngineAt: typeof p.lastEngineAt === "number" ? p.lastEngineAt : 0,
      shiftStartedAt:
        typeof p.shiftStartedAt === "number" ? p.shiftStartedAt : useFloor.getState().shiftStartedAt,
    });
  } catch {
    /* corrupt disk — keep defaults */
  }
}
