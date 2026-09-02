/** Session clock + shared chart interval. Pure helpers for store, engine, and tests. */

export const DEFAULT_SESSION_MINUTES = 0;

export const SESSION_PRESETS = [
  { minutes: 0, label: "24/7" },
  { minutes: 15, label: "15m" },
  { minutes: 60, label: "1h" },
  { minutes: 240, label: "4h" },
  { minutes: 480, label: "8h" },
] as const;

export const CHART_INTERVALS = [1, 5, 15, 60, 240] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];
export const DEFAULT_CHART_INTERVAL: ChartInterval = 1;

export function normalizeSessionMinutes(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return DEFAULT_SESSION_MINUTES;
  return v;
}

export function sessionEndsAtFromMinutes(minutes: number, now = Date.now()): number | null {
  const n = normalizeSessionMinutes(minutes);
  if (n === 0) return null;
  return now + n * 60_000;
}

export function sessionRemainingMs(endsAt: number | null, now = Date.now()): number | null {
  if (endsAt == null || !Number.isFinite(endsAt)) return null;
  return Math.max(0, endsAt - now);
}

export function sessionEnded(endsAt: number | null, now = Date.now()): boolean {
  return endsAt != null && Number.isFinite(endsAt) && now >= endsAt;
}

export function asChartInterval(value: unknown): ChartInterval {
  if (value === 1 || value === 5 || value === 15 || value === 60 || value === 240) return value;
  const n = Number(value);
  if (n === 1 || n === 5 || n === 15 || n === 60 || n === 240) return n;
  return DEFAULT_CHART_INTERVAL;
}

export function chartIntervalLabel(n: ChartInterval): string {
  return n < 60 ? `${n}m` : `${n / 60}h`;
}
