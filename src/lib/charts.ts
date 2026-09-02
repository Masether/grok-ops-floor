import { PAIR_BY_ID } from "./kraken.ts";
import type { PairId } from "./types.ts";

export type ChartType = "candles" | "bars" | "line";
export type ChartTool = "crosshair" | "hline" | "trend";
export type IndicatorId = "sma" | "ema" | "bb" | "volume" | "rsi" | "macd" | "stoch";

export type ChartIndicatorState = {
  id: IndicatorId;
  on: boolean;
  period: number;
  fast: number;
  slow: number;
  k: number;
};

export type ChartHLine = { id: string; kind: "hline"; price: number };
export type ChartTrend = {
  id: string;
  kind: "trend";
  t1: number;
  p1: number;
  t2: number;
  p2: number;
};
export type ChartDrawing = ChartHLine | ChartTrend;
export type ChartDrawings = Partial<Record<PairId, ChartDrawing[]>>;

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "bars", label: "Bars" },
  { id: "line", label: "Line" },
];

export const CHART_TOOLS: { id: ChartTool; label: string; hint: string }[] = [
  { id: "crosshair", label: "Cross", hint: "Read price" },
  { id: "hline", label: "H-Line", hint: "Tap to drop a level" },
  { id: "trend", label: "Trend", hint: "Tap two points, or drag" },
];

export const INDICATOR_IDS: IndicatorId[] = [
  "sma",
  "ema",
  "bb",
  "volume",
  "rsi",
  "macd",
  "stoch",
];

export const INDICATOR_META: Record<
  IndicatorId,
  { label: string; overlay: boolean; params: "ema" | "period" | "bb" | "none" }
> = {
  sma: { label: "SMA", overlay: true, params: "period" },
  ema: { label: "EMA", overlay: true, params: "ema" },
  bb: { label: "BB", overlay: true, params: "bb" },
  volume: { label: "Volume", overlay: false, params: "none" },
  rsi: { label: "RSI", overlay: false, params: "period" },
  macd: { label: "MACD", overlay: false, params: "none" },
  stoch: { label: "Stoch", overlay: false, params: "period" },
};

const blank = (
  id: IndicatorId,
  on: boolean,
  extra: Partial<ChartIndicatorState> = {},
): ChartIndicatorState => ({
  id,
  on,
  period: 20,
  fast: 12,
  slow: 26,
  k: 2,
  ...extra,
});

export const DEFAULT_CHART_TYPE: ChartType = "candles";
export const DEFAULT_CHART_TOOL: ChartTool = "crosshair";
export const DEFAULT_CHART_INDICATORS: ChartIndicatorState[] = [
  blank("sma", false, { period: 20 }),
  blank("ema", true, { fast: 12, slow: 26 }),
  blank("bb", false, { period: 20, k: 2 }),
  blank("volume", true),
  blank("rsi", true, { period: 14 }),
  blank("macd", false),
  blank("stoch", false, { period: 14 }),
];

export const EMA_PAIRS = [
  [12, 26],
  [20, 50],
  [9, 21],
] as const;
export const SMA_PERIODS = [10, 20, 50] as const;
export const RSI_PERIODS = [7, 14, 21] as const;
export const STOCH_PERIODS = [9, 14, 21] as const;
export const BB_PERIODS = [20, 50] as const;

const DRAWING_CAP = 40;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function asChartType(value: unknown): ChartType {
  if (value === "candles" || value === "bars" || value === "line") return value;
  if (value === "candlestick" || value === "candle") return "candles";
  if (value === "bar" || value === "ohlc") return "bars";
  return DEFAULT_CHART_TYPE;
}

export function asChartTool(value: unknown): ChartTool {
  if (value === "crosshair" || value === "hline" || value === "trend") return value;
  return DEFAULT_CHART_TOOL;
}

export function chartInd(list: ChartIndicatorState[], id: IndicatorId): ChartIndicatorState {
  return list.find((x) => x.id === id) ?? DEFAULT_CHART_INDICATORS.find((x) => x.id === id)!;
}

export function indicatorParamLabel(ind: ChartIndicatorState): string {
  const kind = INDICATOR_META[ind.id].params;
  if (kind === "ema") return `${ind.fast}/${ind.slow}`;
  if (kind === "period") return String(ind.period);
  if (kind === "bb") return `${ind.period}×${ind.k}`;
  return "";
}

export function nextPreset(current: number, presets: readonly number[]): number {
  const i = presets.indexOf(current);
  return presets[(i + 1) % presets.length] ?? presets[0]!;
}

export function cycleIndicatorParams(ind: ChartIndicatorState): Partial<ChartIndicatorState> {
  switch (ind.id) {
    case "ema": {
      const i = EMA_PAIRS.findIndex(([f, s]) => f === ind.fast && s === ind.slow);
      const next = EMA_PAIRS[(i + 1) % EMA_PAIRS.length]!;
      return { fast: next[0], slow: next[1] };
    }
    case "sma":
      return { period: nextPreset(ind.period, SMA_PERIODS) };
    case "rsi":
      return { period: nextPreset(ind.period, RSI_PERIODS) };
    case "stoch":
      return { period: nextPreset(ind.period, STOCH_PERIODS) };
    case "bb":
      return { period: nextPreset(ind.period, BB_PERIODS) };
    default:
      return {};
  }
}

export function normalizeChartIndicators(raw: unknown): ChartIndicatorState[] {
  const byId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object" && "id" in item) {
        const rec = item as Record<string, unknown>;
        byId.set(String(rec.id), rec);
      }
    }
  } else if (raw && typeof raw === "object") {
    for (const [id, item] of Object.entries(raw as Record<string, unknown>)) {
      if (item && typeof item === "object") {
        byId.set(id, item as Record<string, unknown>);
      } else if (typeof item === "boolean") {
        byId.set(id, { id, on: item });
      }
    }
  }
  return DEFAULT_CHART_INDICATORS.map((d) => {
    const p = byId.get(d.id);
    if (!p) return { ...d };
    return {
      ...d,
      on: typeof p.on === "boolean" ? p.on : d.on,
      period: clampInt(p.period, 2, 200, d.period),
      fast: clampInt(p.fast, 2, 200, d.fast),
      slow: clampInt(p.slow, 2, 200, d.slow),
      k: clampInt(p.k, 1, 5, d.k),
    };
  });
}

function asPairId(value: unknown): PairId | null {
  return typeof value === "string" && value in PAIR_BY_ID ? (value as PairId) : null;
}

function asDrawing(raw: unknown): ChartDrawing | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || d.id.length === 0) return null;
  if (d.kind === "hline") {
    const price = Number(d.price);
    if (!Number.isFinite(price)) return null;
    return { id: d.id, kind: "hline", price };
  }
  if (d.kind === "trend") {
    const t1 = Number(d.t1);
    const p1 = Number(d.p1);
    const t2 = Number(d.t2);
    const p2 = Number(d.p2);
    if (![t1, p1, t2, p2].every(Number.isFinite)) return null;
    return { id: d.id, kind: "trend", t1, p1, t2, p2 };
  }
  return null;
}

export function normalizeChartDrawings(raw: unknown): ChartDrawings {
  if (!raw || typeof raw !== "object") return {};
  const out: ChartDrawings = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const pair = asPairId(key);
    if (!pair || !Array.isArray(value)) continue;
    const rows = value.map(asDrawing).filter((d): d is ChartDrawing => d != null);
    if (rows.length) out[pair] = rows.slice(-DRAWING_CAP);
  }
  return out;
}

export function capChartDrawings(map: ChartDrawings): ChartDrawings {
  const out: ChartDrawings = {};
  for (const [key, rows] of Object.entries(map)) {
    const pair = asPairId(key);
    if (!pair || !rows?.length) continue;
    out[pair] = rows.slice(-DRAWING_CAP);
  }
  return out;
}

export function indexOfTime(times: number[], t: number): number {
  if (times.length === 0) return 0;
  let best = 0;
  let bestD = Math.abs(times[0]! - t);
  for (let i = 1; i < times.length; i++) {
    const d = Math.abs(times[i]! - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function barClock(ts: number): string {
  const d = new Date(ts);
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}
