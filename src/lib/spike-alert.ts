/** Scalp only a huge spike that is still rising, from a trusted source. */

import type { MacdLane } from "./playbook.ts";

export type SpikeSource = "tape" | "wire";

export function volumeRatio(volumes: number[]): number {
  if (volumes.length < 6) return 1;
  const last = volumes[volumes.length - 1] ?? 0;
  const prev = volumes.slice(-12, -1);
  const avg = prev.reduce((a, n) => a + n, 0) / Math.max(prev.length, 1);
  return avg > 0 ? last / avg : 1;
}

export function hugeSpike(input: {
  oneMinPct: number;
  threePct: number;
  volRatio: number;
  lane: MacdLane;
  wireKind?: string | null;
  wireAgeMs?: number;
}): { ok: true; source: SpikeSource } | { ok: false; why: string } {
  if (input.lane === "down" || input.oneMinPct <= 0) {
    return { ok: false, why: "not rising" };
  }
  const tapeRip = input.oneMinPct >= 0.8 && input.volRatio >= 1.5;
  const tapeBlast = input.threePct >= 2.2 && input.oneMinPct >= 0.25 && input.volRatio >= 1.3;
  if (tapeRip || tapeBlast) return { ok: true, source: "tape" };
  const wireFresh = input.wireKind === "trend" && (input.wireAgeMs ?? 1e12) < 30 * 60_000;
  if (wireFresh && input.oneMinPct >= 0.35 && input.lane === "up") {
    return { ok: true, source: "wire" };
  }
  return { ok: false, why: "no huge spike" };
}
