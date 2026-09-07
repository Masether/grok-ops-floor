import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { AGENTS } from "./agents.ts";
import { DEFAULT_BRAIN, type Brain, type BrainMsg } from "./learn.ts";
import { DEFAULT_PAIRS, liveWatchPairs } from "./kraken.ts";
import { defaultTradeBook } from "./universe.ts";
import { holdFocusOn, loadHoldFocus, saveHoldFocus, HOLD_FOCUS_PAIRS, HOLD_FOCUS_RELEASE_BTC } from "./focus-hold.ts";
import { applyHoldFocusMods, restoreSprayMods, modOn } from "./desk-mods.ts";
import { btcOnBook, clampLiveBudget, DEFAULT_LIVE_BUDGET, deskIsLive, krakenKeysOn, liveDayBase, livePositions, liveSleeve, pairsFromWallet, restoreLiveBudget } from "./live-budget.ts";
import { hydratePersistedShift, sliceShiftForPersist } from "./persist-shift.ts";
import {
  closedRealizedFromOrders,
  dayStartOnLiveArm,
  pickJournal,
  preferRicherBook,
  syncClosedRealized,
} from "./book-sync.ts";
import { clampLaunch, inferLaunched, rejectWalletSecret } from "./launch.mjs";
import { bookDayPnl, sessionProfit } from "./desk-pnl.ts";
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
  /** Last armed-desk closed+open from profile sync (watch devices). */
  syncedTradePnl: number;
  syncedTradePnlAt: number;
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
  /** UI heartbeat — not used for profile sync LWW. */
  lastBeatAt: number;
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
  resetLiveBook: () => void;
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
  const fromOrders = closedRealizedFromOrders(fills, live);
  const realized = live ? syncClosedRealized(s.realized, fromOrders) : s.realized;
  const dayBase = live
    ? liveDayBase({
        dayStart: s.dayStartEquity,
        budget: sleeve?.budget ?? s.liveBudget,
        equity,
        openLots: book.length,
        tradePnl: sessionProfit(s.realized, unrealized),
      })
    : s.dayStartEquity > 0
      ? s.dayStartEquity
      : s.startingCash > 0
        ? s.startingCash
        : equity;
  // Live Day/Sleeve must be closed+open after fees — never equity−$200 budget (fake ±$100).
  const dayPnl = live
    ? sessionProfit(realized, unrealized)
    : bookDayPnl(equity, dayBase);
  // Live In lots = sleeve deployed only. Synced wallet bags must not inflate exposure
  // (Free + In lots = Desk equity). Paper still marks every open lot.
  const exposure = live ? (sleeve?.deployed ?? 0) : posValue;
  return {
    equity,
    cash,
    exposure,
    unrealized,
    realized,
    dayPnl,
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
    const live = useFloor.getState();
    if ((live.orders.length > 0 || live.positions.length > 0) && !live.lastEngineAt) {
      useFloor.setState({ lastEngineAt: Date.now() });
    }
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
      pairs: defaultTradeBook(),
      scoutHot: [],
      scoutScanned: 0,
      scoutDropped: 0,
      lastScoutAt: 0,
      risk: DEFAULT_RISK,
      startingCash: DEFAULT_LIVE_BUDGET,
      cash: DEFAULT_LIVE_BUDGET,
      fundingCash: 0,
      vault: [],
      autoSweep: true,
      sweptTotal: 0,
      lifetimePnl: 0,
      syncedTradePnl: 0,
      syncedTradePnlAt: 0,
      transfers: [],
      realized: 0,
      dayStartEquity: DEFAULT_LIVE_BUDGET,
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
      lastBeatAt: 0,
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
      setMode: (_mode) => set({ mode: "live", venueId: "kraken" }),
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
          opsMode: v ? "auto" : get().opsMode === "learn" ? "learn" : "auto",
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
          const day = dayStartOnLiveArm({
            dayStartEquity: s.dayStartEquity,
            shiftStartedAt: s.shiftStartedAt,
            sleeveEquity: sleeve.equity,
            liveBudget: s.liveBudget,
          });
          const hold = holdFocusOn();
          set({
            liveArmed: true,
            mode: "live",
            venueId: "kraken",
            opsMode: "auto",
            autoTrade: true,
            floorOpen: true,
            autoSweep: true,
            playbooks: hold ? (["dca"] as const) : [...ALL_PLAYBOOKS],
            pairs: liveWatchPairs(
              hold ? [...loadHoldFocus().pairs, ...s.pairs] : [...defaultTradeBook(), ...s.pairs],
              sleeve.btcUsd,
              false,
            ),
            dayStartEquity: day.dayStartEquity,
            shiftStartedAt: day.shiftStartedAt,
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
      setVenueId: (_id) => set({ venueId: "kraken" }),
      setHumanVerified: (v) => set({ humanVerified: v }),
      launchDesk: (input) => {
        launchedThisSession = true;
        const payload = clampLaunch(input);
        const minutes = normalizeSessionMinutes(input.sessionMinutes ?? 0);
        const budget = clampLiveBudget(payload.startingCash);
        set({
          launched: true,
          floorOpen: true,
          autoTrade: true,
          opsMode: "auto",
          selfLearn: true,
          mode: "live",
          venueId: "kraken",
          liveArmed: false,
          liveBudget: budget,
          startingCash: budget,
          cash: budget,
          dayStartEquity: budget,
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
        get().resetLiveBook();
        queueMicrotask(flushFloorPersist);
      },
      stopDesk: () => set({ floorOpen: false, autoTrade: false, sessionEndsAt: null }),
      setKeys: (keys) => {
        const apiKey = keys.apiKey.replace(/\s+/g, "").trim();
        const apiSecret = keys.apiSecret.replace(/\s+/g, "").trim();
        if (apiKey && rejectWalletSecret(apiKey)) return;
        if (apiSecret && rejectWalletSecret(apiSecret)) return;
        const prev = get().keys;
        const hadPair = prev.apiKey.length >= 8 && prev.apiSecret.length >= 16;
        // Full clear is allowed.
        if (!apiKey && !apiSecret) {
          set({ keys: { apiKey: "", apiSecret: "" }, keysOk: null });
          queueMicrotask(flushFloorPersist);
          return;
        }
        // Progressive paste (one field at a time). Never wipe a working pair mid-edit —
        // keep the other side from prev when only one field is long enough yet.
        if (apiKey.length < 8 || apiSecret.length < 16) {
          const mergedKey = apiKey.length >= 8 ? apiKey : prev.apiKey;
          const mergedSecret = apiSecret.length >= 16 ? apiSecret : prev.apiSecret;
          if (mergedKey.length >= 8 && mergedSecret.length >= 16) {
            const touched = mergedKey !== prev.apiKey || mergedSecret !== prev.apiSecret;
            set({
              keys: { apiKey: mergedKey, apiSecret: mergedSecret },
              keysOk: touched ? null : get().keysOk,
              humanVerified: true,
            });
            if (touched) queueMicrotask(flushFloorPersist);
            return;
          }
          if (hadPair) return;
          set({ keys: { apiKey, apiSecret }, keysOk: null });
          return;
        }
        const same = prev.apiKey === apiKey && prev.apiSecret === apiSecret;
        set({
          keys: { apiKey, apiSecret },
          keysOk: same ? get().keysOk : null,
          humanVerified: true,
        });
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
      resetLiveBook: () => {
        // Live journal reset only — never invent paper $10k.
        const s = get();
        const cash = s.liveBudget > 0 ? s.liveBudget : DEFAULT_LIVE_BUDGET;
        set({
          mode: "live",
          venueId: "kraken",
          cash,
          startingCash: cash,
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
        set((s) => {
          const btcUsd = btcOnBook(b) * (s.tickers.XBTUSD?.last ?? 0);
          // Keep the user's toggles. Only fold in wallet names + rescue meme-stuck books.
          const base = s.pairs.length ? s.pairs : defaultTradeBook();
          return {
            liveBalance: b,
            pairs: liveWatchPairs([...base, ...pairsFromWallet(b)], btcUsd, false),
          };
        }),
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
        const venueId: VenueId = "kraken";
        const keyed =
          typeof (p.keys ?? current.keys)?.apiKey === "string" &&
          ((p.keys ?? current.keys)?.apiKey?.trim().length ?? 0) > 8 &&
          typeof (p.keys ?? current.keys)?.apiSecret === "string" &&
          ((p.keys ?? current.keys)?.apiSecret?.trim().length ?? 0) > 8;
        const liveOn = keyed;
        const book = preferRicherBook(
          {
            realized: typeof p.realized === "number" ? p.realized : 0,
            lifetimePnl: typeof p.lifetimePnl === "number" ? p.lifetimePnl : 0,
            orders: Array.isArray(p.orders) ? p.orders : [],
            lastEngineAt: typeof p.lastEngineAt === "number" ? p.lastEngineAt : 0,
            dayStartEquity: shift.dayStartEquity,
            equityHistory: shift.equityHistory,
          },
          {
            realized: current.realized,
            lifetimePnl: current.lifetimePnl,
            orders: current.orders,
            lastEngineAt: current.lastEngineAt,
            dayStartEquity: current.dayStartEquity,
            equityHistory: current.equityHistory,
          },
        );
        return {
          ...current,
          ...p,
          pairs: liveWatchPairs(pairs.length ? pairs : defaultTradeBook(), 0, false),
          launched: launched || keyed,
          venueId: "kraken",
          opsMode: "auto",
          playbooks: [...ALL_PLAYBOOKS],
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
          realized: book.realized ?? current.realized,
          orders: pickJournal(
            Array.isArray(book.orders) ? book.orders : p.orders,
            current.orders,
          ),
          positions: pickJournal(p.positions, current.positions),
          equityHistory: Array.isArray(book.equityHistory) ? book.equityHistory : shift.equityHistory,
          signals: shift.signals,
          dayStartEquity: book.dayStartEquity ?? shift.dayStartEquity,
          shiftStartedAt: shift.shiftStartedAt,
          lastEngineAt: book.lastEngineAt ?? current.lastEngineAt,
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
          sessionMinutes: typeof p.sessionMinutes === "number" ? p.sessionMinutes : current.sessionMinutes,
          sessionEndsAt: typeof p.sessionEndsAt === "number" ? p.sessionEndsAt : current.sessionEndsAt,
          chartInterval: asChartInterval(p.chartInterval ?? current.chartInterval),
          chartType: asChartType(p.chartType ?? current.chartType),
          chartIndicators: normalizeChartIndicators(p.chartIndicators ?? current.chartIndicators),
          chartDrawings: normalizeChartDrawings(p.chartDrawings ?? current.chartDrawings),
          chartTool: DEFAULT_CHART_TOOL,
          fundingCash: typeof p.fundingCash === "number" && p.fundingCash >= 0 ? p.fundingCash : 0,
          vault: Array.isArray(p.vault) ? p.vault : [],
          autoSweep: p.autoSweep !== false,
          sweptTotal: typeof p.sweptTotal === "number" && p.sweptTotal >= 0 ? p.sweptTotal : 0,
          lifetimePnl: typeof book.lifetimePnl === "number" ? book.lifetimePnl : current.lifetimePnl,
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
  const hold = holdFocusOn();
  useFloor.setState({
    launched: true,
    floorOpen: true,
    autoTrade: true,
    opsMode: "auto",
    mode: "live",
    venueId: "kraken",
    liveArmed: keyed ? true : s.liveArmed,
    playbooks: hold ? (["dca"] as const) : [...ALL_PLAYBOOKS],
    pairs: liveWatchPairs(
      hold ? [...loadHoldFocus().pairs, ...s.pairs] : [...defaultTradeBook(), ...s.pairs],
      0,
      false,
    ),
  });
  return keyed;
}

/** Sit on BTC reserve + TAO until spot BTC hits release — no scalp spray. */
export function enableBtcTaoHold(releaseBtcUsd = HOLD_FOCUS_RELEASE_BTC) {
  saveHoldFocus({
    on: true,
    pairs: [...HOLD_FOCUS_PAIRS],
    releaseBtcUsd: releaseBtcUsd > 0 ? releaseBtcUsd : HOLD_FOCUS_RELEASE_BTC,
  });
  applyHoldFocusMods();
  const s = useFloor.getState();
  useFloor.setState({
    pairs: liveWatchPairs([...HOLD_FOCUS_PAIRS], 0, false),
    playbooks: ["dca"],
    autoTrade: true,
    floorOpen: true,
    opsMode: "auto",
  });
  flushFloorPersist();
  return loadHoldFocus();
}

export function clearHoldFocus() {
  const prev = loadHoldFocus();
  saveHoldFocus({ ...prev, on: false });
  restoreSprayMods();
  const s = useFloor.getState();
  useFloor.setState({
    pairs: liveWatchPairs([...defaultTradeBook(), ...s.pairs], 0, false),
    playbooks: [...ALL_PLAYBOOKS],
  });
  flushFloorPersist();
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
    const cur = useFloor.getState();
    const budget = restoreLiveBudget(p.liveBudget ?? cur.liveBudget);
    // Scrub legacy paper $10k baselines so they never paint live meters.
    const dayStart =
      typeof p.dayStartEquity === "number" && p.dayStartEquity > budget * 3
        ? budget
        : typeof p.dayStartEquity === "number"
          ? p.dayStartEquity
          : cur.dayStartEquity;
    useFloor.setState({
      launched: true,
      floorOpen: true,
      autoTrade: true,
      opsMode: "auto",
      mode: "live",
      venueId: "kraken",
      playbooks: [...ALL_PLAYBOOKS],
      liveArmed: keyed,
      keys: p.keys ?? cur.keys,
      // Keep last known auth when keys are already on disk — don't force a re-test wipe.
      keysOk: keyed ? (typeof p.keysOk === "boolean" ? p.keysOk : cur.keysOk) : false,
      liveBudget: budget,
      liveBalance: p.liveBalance ?? cur.liveBalance ?? null,
      liveTakerPct: typeof p.liveTakerPct === "number" ? p.liveTakerPct : cur.liveTakerPct,
      pairs: liveWatchPairs([...(Array.isArray(p.pairs) ? p.pairs : []), ...defaultTradeBook()], 0, false),
      lastEngineAt: typeof p.lastEngineAt === "number" ? p.lastEngineAt : cur.lastEngineAt,
      shiftStartedAt: typeof p.shiftStartedAt === "number" ? p.shiftStartedAt : cur.shiftStartedAt,
      dayStartEquity: dayStart,
      startingCash: budget,
      cash: typeof p.cash === "number" && p.cash <= budget * 3 ? p.cash : budget,
      realized: typeof p.realized === "number" && (Math.abs(p.realized) > 0 || cur.realized === 0)
        ? p.realized
        : cur.realized,
      lifetimePnl: typeof p.lifetimePnl === "number" ? p.lifetimePnl : cur.lifetimePnl,
      positions: pickJournal(Array.isArray(p.positions) ? p.positions : undefined, cur.positions),
      orders: pickJournal(Array.isArray(p.orders) ? p.orders : undefined, cur.orders),
      events: Array.isArray(p.events) ? p.events : cur.events,
      equityHistory: Array.isArray(p.equityHistory) ? p.equityHistory : cur.equityHistory,
      sweptTotal: typeof p.sweptTotal === "number" ? p.sweptTotal : cur.sweptTotal,
    });
  } catch {
    /* corrupt disk — keep defaults */
  }
}
