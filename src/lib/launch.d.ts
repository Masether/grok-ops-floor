export const LAUNCH_DEFAULTS: {
  startingCash: number;
  sizePct: number;
  stopPct: number;
  takePct: number;
  maxDailyLossPct: number;
  maxPositions: number;
};
export const LAUNCH_BOUNDS: {
  startingCash: { min: number; max: number };
  sizePct: { min: number; max: number };
  stopPct: { min: number; max: number };
  takePct: { min: number; max: number };
  maxDailyLossPct: { min: number; max: number };
  maxPositions: { min: number; max: number };
};
export function asFraction(value: number, fallback: number): number;
export function clampLaunch(input?: {
  startingCash?: number;
  sizePct?: number;
  stopPct?: number;
  takePct?: number;
  maxDailyLossPct?: number;
  maxPositions?: number;
}): {
  startingCash: number;
  sizePct: number;
  stopPct: number;
  takePct: number;
  maxDailyLossPct: number;
  maxPositions: number;
};
export function ticketNotional(capital: number, sizePct: number): number;
export function launchPreviewLine(input?: {
  startingCash?: number;
  sizePct?: number;
  stopPct?: number;
  takePct?: number;
  maxDailyLossPct?: number;
  maxPositions?: number;
}): string;
export function inferLaunched(persisted: unknown): boolean;
export function rejectWalletSecret(value: unknown): string | null;
