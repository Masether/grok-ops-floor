export type AgentId =
  | "scanner"
  | "signal"
  | "risk"
  | "runner"
  | "dispatcher"
  | "archivist"
  | "sentinel"
  | "hunter"
  | "regime"
  | "flow"
  | "treasury"
  | "wire";

export type AgentStatus = "idle" | "working" | "handoff" | "blocked" | "halted";

export type Side = "buy" | "sell";
export type TradeMode = "paper" | "live";
export type OpsMode = "paper" | "auto" | "learn";
export type OrderStatus = "queued" | "working" | "filled" | "rejected" | "cancelled";
export type PipelineStage =
  | "brief"
  | "split"
  | "handout"
  | "tool"
  | "second"
  | "signed";
export type FeedSource = "kraken" | "sim";
export type WireTone = "bull" | "bear" | "neutral";
export type WireKind = "news" | "trend" | "macro";

export type WireItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  ts: number;
  tone: WireTone;
  pairs: PairId[];
  orgs: string[];
  kind: WireKind;
  note: string;
};

export type PairId =
  | "XBTUSD"
  | "ETHUSD"
  | "SOLUSD"
  | "XRPUSD"
  | "ADAUSD"
  | "DOGEUSD"
  | "LINKUSD"
  | "AVAXUSD"
  | "SUIUSD"
  | "TAOUSD"
  | "NEARUSD"
  | "SHIBUSD"
  | "PEPEUSD"
  | "WIFUSD"
  | "BONKUSD"
  | "FLOKIUSD"
  | "PENGUUSD"
  | "NVDAxUSD"
  | "TSLAxUSD"
  | "AAPLxUSD"
  | "MSFTxUSD"
  | "PLTRxUSD"
  | "SPYxUSD";

export type BookSleeve = "core" | "heat" | "stock";

export type Ticker = {
  pair: PairId;
  last: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  vwap: number;
  changePct: number;
  ts: number;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SignalKind = "buy" | "sell" | "hold";
export type SetupId = "cross" | "rsi" | "momentum";

export type TradeSignal = {
  id: string;
  pair: PairId;
  kind: SignalKind;
  confidence: number;
  reason: string;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  macdHist: number;
  price: number;
  ts: number;
  setup?: SetupId | "unknown";
};

export type Position = {
  id: string;
  pair: PairId;
  side: Side;
  qty: number;
  entry: number;
  stop: number;
  take: number;
  mark: number;
  openedAt: number;
  mode: TradeMode;
  krakenTxid?: string;
  note?: string;
  adds?: number;
  book?: "scalp" | "grid" | "dca";
  fee?: number;
  banked?: boolean;
  peakPnlUsd?: number;
  costUsd?: number;
};

export type Order = {
  id: string;
  pair: PairId;
  side: Side;
  qty: number;
  price: number;
  status: OrderStatus;
  mode: TradeMode;
  reason: string;
  ts: number;
  fillPrice?: number;
  fee?: number;
  pnl?: number;
  krakenTxid?: string;
  book?: "scalp" | "grid" | "dca";
};

export type TapeEvent = {
  id: string;
  ts: number;
  agent: AgentId;
  next?: AgentId;
  stage: PipelineStage;
  pair?: PairId;
  title: string;
  detail: string;
  tone: "info" | "good" | "warn" | "bad";
};

export type QueueItem = {
  id: string;
  ts: number;
  title: string;
  detail: string;
  severity: "stall" | "empty" | "playbook" | "reject";
  pair?: PairId;
};

export type AgentState = {
  id: AgentId;
  status: AgentStatus;
  heat: number;
  lastAction: string;
  lastTs: number;
  handled: number;
  delayMs: number;
  spark: number[];
};

export type EquityPoint = {
  t: number;
  equity: number;
  cash: number;
  unrealized: number;
  scanner: number;
  signal: number;
  risk: number;
  runner: number;
};

export type RiskConfig = {
  sizePct: number;
  maxPosPct: number;
  maxDailyLossPct: number;
  stopPct: number;
  takePct: number;
  maxPositions: number;
  cooldownMs: number;
};

export type DeskSnapshot = {
  equity: number;
  cash: number;
  exposure: number;
  unrealized: number;
  realized: number;
  dayPnl: number;
  fills: number;
  wins: number;
  losses: number;
  briefs: number;
  openPositions: number;
};
