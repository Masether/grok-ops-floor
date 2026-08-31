import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { AGENTS } from "./agents";
import { DEFAULT_BRAIN, type Brain } from "./learn";
import { DEFAULT_PAIRS } from "./kraken";
import { hydratePersistedShift, sliceShiftForPersist } from "./persist-shift";
import { clampLaunch, inferLaunched, rejectWalletSecret } from "./launch.mjs";
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
} from "./charts";
import {
  DEFAULT_CHART_INTERVAL,
  DEFAULT_SESSION_MINUTES,
  asChartInterval,
  normalizeSessionMinutes,
  sessionEndsAtFromMinutes,
  type ChartInterval,
} from "./session";
import type { VenueId } from "./venues/types";
import type {
  AgentId,
  AgentState,
  Candle,
  DeskSnapshot,
  EquityPoint,
  FeedSource,
  Order,
  PairId,
  PipelineStage,
  Position,
  QueueItem,
  RiskConfig,
  TapeEvent,
  Ticker,
  TradeMode,
  TradeSignal,
  WireItem,
} from "./types";

function freshAgents(): Record<AgentId, AgentState> {
  const out = {} as Record<AgentId, AgentState>;
  for (const a of AGENTS) {
    out[a.id] = {
      id: a.id,
      status: "idle",
      heat: 0.15,
      lastAction: "on desk",
      lastTs: Date.now(),
      handled: 0,
      delayMs: 48 + a.orbit * 11,
      spark: Array.from({ length: 24 }, (_, i) => 0.2 + ((i * 13 + a.orbit * 7) % 8) / 20),
    };
  }
  return out;
}

export const DEFAULT_RISK: RiskConfig = {
  sizePct: 0.02,
  maxPosPct: 0.18,
  maxDailyLossPct: 0.04,
  stopPct: 0.015,
  takePct: 0.025,
  maxPositions: 5,
  cooldownMs: 12 * 60_000,
};

type Keys = { apiKey: string; apiSecret: string };

export type FloorState = {
  launched: boolean;
  floorOpen: boolean;
  mode: TradeMode;
  autoTrade: boolean;
  liveArmed: boolean;
  venueId: VenueId;
  humanVerified: boolean;
  keys: Keys;
  keysOk: boolean | null;
  pairs: PairId[];
  risk: RiskConfig;
  startingCash: number;
  cash: number;
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
  lastFeedAt: number;
  shiftStartedAt: number;
  briefs: number;
  ticks: number;
  liveBalance: Record<string, string> | null;
  pendingLive: Order | null;
  inspectPair: PairId | null;
  grokNote: string | null;
  grokBusy: boolean;
  settingsOpen: boolean;
  handoff: { from: AgentId; to: AgentId } | null;
  brain: Brain;
  selfLearn: boolean;
  wire: WireItem[];
  fearGreed: { value: number; label: string } | null;
  wireAt: number;
  sessionMinutes: number;
  sessionEndsAt: number | null;
  chartInterval: ChartInterval;
  chartsOpen: boolean;
  chartType: ChartType;
  chartIndicators: ChartIndicatorState[];
  chartTool: ChartTool;
  chartDrawings: ChartDrawings;

  setFloorOpen: (open: boolean) => void;
  setMode: (mode: TradeMode) => void;
  setAutoTrade: (v: boolean) => void;
  setLiveArmed: (v: boolean) => void;
  setVenueId: (id: VenueId) => void;
  setHumanVerified: (v: boolean) => void;
  launchDesk: (input: Partial<{
    startingCash: number;
    sizePct: number;
    stopPct: number;
    takePct: number;
    maxDailyLossPct: number;
    maxPositions: number;
    sessionMinutes: number;
  }>) => void;
  stopDesk: () => void;
  setKeys: (keys: Keys) => void;
  setKeysOk: (v: boolean | null) => void;
  setPairs: (pairs: PairId[]) => void;
  setRisk: (risk: Partial<RiskConfig>) => void;
  setStartingCash: (n: number) => void;
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
  setWire: (items: WireItem[], fearGreed: { value: number; label: string } | null) => void;
  setSessionMinutes: (minutes: number) => void;
  setChartInterval: (n: ChartInterval) => void;
  setChartsOpen: (v: boolean) => void;
  setChartType: (t: ChartType) => void;
  toggleChartIndicator: (id: IndicatorId) => void;
  setChartIndicatorParams: (id: IndicatorId, params: Partial<ChartIndicatorState>) => void;
  setChartTool: (t: ChartTool) => void;
  addChartDrawing: (pair: PairId, drawing: ChartDrawing) => void;
  clearChartDrawings: (pair: PairId) => void;
};

export function computeDesk(s: FloorState): DeskSnapshot {
  let posValue = 0;
  let unrealized = 0;
  for (const p of s.positions) {
    const mark = s.tickers[p.pair]?.last ?? p.mark;
    posValue += mark * p.qty;
    unrealized += (mark - p.entry) * p.qty;
  }
  const equity = s.cash + posValue;
  const fills = s.orders.filter((o) => o.status === "filled");
  const wins = fills.filter((o) => o.reason.includes("TP")).length;
  const losses = fills.filter((o) => o.reason.includes("SL")).length;
  return {
    equity,
    cash: s.cash,
    exposure: posValue,
    unrealized,
    realized: s.realized,
    dayPnl: equity - s.dayStartEquity,
    fills: fills.length,
    wins,
    losses,
    briefs: s.briefs,
    openPositions: s.positions.length,
  };
}

export function markEquity(s: FloorState): number {
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

export const useFloor = create<FloorState>()(
  persist(
    (set, get) => ({
      launched: false,
      floorOpen: false,
      mode: "paper",
      autoTrade: false,
      liveArmed: false,
      venueId: "kraken",
      humanVerified: false,
      keys: { apiKey: "", apiSecret: "" },
      keysOk: null,
      pairs: DEFAULT_PAIRS,
      risk: DEFAULT_RISK,
      startingCash: 10_000,
      cash: 10_000,
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
      shiftStartedAt: Date.now(),
      briefs: 0,
      ticks: 0,
      liveBalance: null,
      pendingLive: null,
      inspectPair: null,
      grokNote: null,
      grokBusy: false,
      settingsOpen: false,
      handoff: null,
      brain: DEFAULT_BRAIN,
      selfLearn: true,
      wire: [],
      fearGreed: null,
      wireAt: 0,
      sessionMinutes: DEFAULT_SESSION_MINUTES,
      sessionEndsAt: null,
      chartInterval: DEFAULT_CHART_INTERVAL,
      chartsOpen: false,
      chartType: DEFAULT_CHART_TYPE,
      chartIndicators: DEFAULT_CHART_INDICATORS.map((x) => ({ ...x })),
      chartTool: DEFAULT_CHART_TOOL,
      chartDrawings: {},

      setFloorOpen: (open) => {
        if (open && !get().launched) return;
        set({ floorOpen: open });
      },
      setMode: (mode) => set({ mode, liveArmed: mode === "live" ? get().liveArmed : false }),
      setAutoTrade: (v) => {
        if (v && !get().launched) return;
        set({ autoTrade: v });
      },
      setLiveArmed: (v) => set({ liveArmed: v }),
      setVenueId: (id) => set({ venueId: id === "paper" ? "paper" : "kraken" }),
      setHumanVerified: (v) => set({ humanVerified: v }),
      launchDesk: (input) => {
        const payload = clampLaunch(input);
        const minutes = normalizeSessionMinutes(
          input.sessionMinutes ?? get().sessionMinutes,
        );
        set({
          launched: true,
          floorOpen: true,
          autoTrade: true,
          mode: "paper",
          liveArmed: false,
          startingCash: payload.startingCash,
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
        });
        get().resetPaper();
      },
      stopDesk: () => set({ floorOpen: false, autoTrade: false, sessionEndsAt: null }),
      setKeys: (keys) => {
        if (!get().humanVerified) return;
        if (rejectWalletSecret(keys.apiKey) || rejectWalletSecret(keys.apiSecret)) return;
        set({ keys, keysOk: null });
      },
      setKeysOk: (v) => set({ keysOk: v }),
      setPairs: (pairs) => set({ pairs: pairs.length ? pairs : DEFAULT_PAIRS }),
      setRisk: (risk) => set({ risk: { ...get().risk, ...risk } }),
      setStartingCash: (n) => set({ startingCash: n }),
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
          agents: freshAgents(),
          pendingLive: null,
        });
      },
      selectAgent: (id) => set({ selectedAgent: id }),
      setPendingLive: (order) => set({ pendingLive: order }),
      setInspectPair: (pair) => set({ inspectPair: pair }),
      setGrokNote: (note) => set({ grokNote: note }),
      setGrokBusy: (v) => set({ grokBusy: v }),
      setLiveBalance: (b) => set({ liveBalance: b }),
      setSettingsOpen: (v) => set({ settingsOpen: v }),
      bumpTicks: () => set({ ticks: get().ticks + 1 }),
      setBrain: (brain) => set({ brain }),
      setSelfLearn: (v) => set({ selfLearn: v, brain: { ...get().brain, enabled: v } }),
      resetBrain: () => set({ brain: { ...DEFAULT_BRAIN, enabled: get().selfLearn } }),
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
      partialize: (s) => {
        const shift = sliceShiftForPersist(s);
        return {
          launched: s.launched,
          venueId: s.venueId,
          mode: s.mode,
          autoTrade: s.autoTrade,
          liveArmed: false,
          keys: s.keys,
          pairs: s.pairs,
          risk: s.risk,
          startingCash: s.startingCash,
          cash: s.cash,
          realized: s.realized,
          dayStartEquity: s.dayStartEquity,
          positions: s.positions,
          orders: s.orders.slice(-80),
          events: s.events.slice(-40),
          shiftStartedAt: s.shiftStartedAt,
          briefs: s.briefs,
          floorOpen: s.floorOpen,
          brain: s.brain,
          selfLearn: s.selfLearn,
          equityHistory: shift.equityHistory,
          signals: shift.signals,
          sessionMinutes: s.sessionMinutes,
          sessionEndsAt: s.sessionEndsAt,
          chartInterval: s.chartInterval,
          chartType: s.chartType,
          chartIndicators: s.chartIndicators,
          chartDrawings: capChartDrawings(s.chartDrawings),
        };
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FloorState>;
        const oldFour = ["XBTUSD", "ETHUSD", "SOLUSD", "XRPUSD"];
        const pairs =
          p.pairs &&
          p.pairs.length === 4 &&
          p.pairs.every((id) => oldFour.includes(id))
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
        const launched = inferLaunched(p);
        const venueId: VenueId = p.venueId === "paper" ? "paper" : "kraken";
        return {
          ...current,
          ...p,
          pairs,
          launched,
          venueId,
          floorOpen: launched ? Boolean(p.floorOpen ?? current.floorOpen) : false,
          autoTrade: launched ? Boolean(p.autoTrade ?? current.autoTrade) : false,
          agents: freshAgents(),
          liveArmed: false,
          humanVerified: false,
          pendingLive: null,
          queue: [],
          equityHistory: shift.equityHistory,
          signals: shift.signals,
          dayStartEquity: shift.dayStartEquity,
          shiftStartedAt: shift.shiftStartedAt,
          settingsOpen: false,
          chartsOpen: false,
          sessionMinutes: normalizeSessionMinutes(p.sessionMinutes ?? current.sessionMinutes),
          sessionEndsAt:
            typeof p.sessionEndsAt === "number"
              ? p.sessionEndsAt
              : p.sessionEndsAt === null
                ? null
                : current.sessionEndsAt,
          chartInterval: asChartInterval(p.chartInterval ?? current.chartInterval),
          chartType: asChartType(p.chartType ?? current.chartType),
          chartIndicators: normalizeChartIndicators(p.chartIndicators ?? current.chartIndicators),
          chartDrawings: normalizeChartDrawings(p.chartDrawings ?? current.chartDrawings),
          chartTool: DEFAULT_CHART_TOOL,
          brain: {
            ...DEFAULT_BRAIN,
            ...(p.brain ?? {}),
            pairBias: { ...DEFAULT_BRAIN.pairBias, ...(p.brain?.pairBias ?? {}) },
            setupScore: { ...DEFAULT_BRAIN.setupScore, ...(p.brain?.setupScore ?? {}) },
            lessons: p.brain?.lessons ?? [],
          },
        };
      },
    },
  ),
);
