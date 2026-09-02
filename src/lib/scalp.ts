/** Auto-desk scalp: short lots, hold only while the tape is still paying. */

/** Auto-desk scalp: cut losers fast, let a paying lot run to take. */

export const SCALP = {
  maxHoldMs: 5 * 60_000,
  growHoldMs: 90_000,
  deadMs: 45_000,
  stopPct: 0.0035,
  takePct: 0.0105,
  heatStopPct: 0.007,
  heatTakePct: 0.02,
  trailArmPct: 0.0012,
  trailGapPct: 0.0018,
  growPct: 0.0006,
  cooldownMs: 10_000,
  minConf: 0.36,
} as const;

export type ScalpAction = "hold" | "stop" | "take" | "time";

export function scalpStops(entry: number, heat: boolean): { stop: number; take: number } {
  const stopPct = heat ? SCALP.heatStopPct : SCALP.stopPct;
  const takePct = heat ? SCALP.heatTakePct : SCALP.takePct;
  return { stop: entry * (1 - stopPct), take: entry * (1 + takePct) };
}

export function scalpManage(
  p: { openedAt: number; entry: number; mark: number; stop: number; take: number },
  now = Date.now(),
): { action: ScalpAction; stop: number } {
  const age = now - p.openedAt;
  const pnlPct = p.entry > 0 ? (p.mark - p.entry) / p.entry : 0;
  const growing = pnlPct > SCALP.growPct;
  let stop = p.stop;
  if (pnlPct >= SCALP.trailArmPct) {
    stop = Math.max(stop, p.entry * 1.0002);
    stop = Math.max(stop, p.mark * (1 - SCALP.trailGapPct));
  }
  if (pnlPct >= SCALP.takePct * 0.55) {
    stop = Math.max(stop, p.entry * (1 + SCALP.takePct * 0.2));
  }
  if (p.mark <= stop) return { action: "stop", stop };
  if (p.mark >= p.take) return { action: "take", stop };
  if (age >= SCALP.maxHoldMs) return { action: "time", stop };
  if (age >= SCALP.growHoldMs && !growing) return { action: "time", stop };
  if (age >= SCALP.deadMs && pnlPct <= 0) return { action: "time", stop };
  return { action: "hold", stop };
}
