/** Extra books next to scalp. All still sized inside the live $200 USD cap. */

export type PlaybookId = "scalp" | "grid" | "dca";

export const PLAYBOOKS: { id: PlaybookId; label: string; hint: string }[] = [
  { id: "scalp", label: "Scalp", hint: "2–5m lots · cut dead tape" },
  { id: "grid", label: "Grid", hint: "buy dips / sell rips in a range" },
  { id: "dca", label: "DCA", hint: "add on dips · hold for the average" },
];

export const DEFAULT_PLAYBOOK: PlaybookId = "scalp";

export function asPlaybook(v: unknown): PlaybookId {
  if (v === "grid" || v === "dca" || v === "scalp") return v;
  return DEFAULT_PLAYBOOK;
}

export const GRID = {
  rangePct: 0.025,
  stepPct: 0.006,
  slicePct: 0.12,
  maxAdds: 4,
  breakPct: 0.012,
  reduceFrac: 0.45,
} as const;

export const DCA = {
  dipPct: 0.008,
  slicePct: 0.15,
  maxAdds: 3,
  takePct: 0.025,
  stopPct: 0.04,
  cooldownMs: 20 * 60_000,
  maxHoldMs: 24 * 60 * 60_000,
} as const;

export type BookAction = "hold" | "stop" | "take" | "time" | "reduce";

export function gridStops(entry: number): { stop: number; take: number } {
  return {
    stop: entry * (1 - GRID.rangePct - GRID.breakPct),
    take: entry * (1 + GRID.rangePct),
  };
}

export function dcaStops(entry: number): { stop: number; take: number } {
  return {
    stop: entry * (1 - DCA.stopPct),
    take: entry * (1 + DCA.takePct),
  };
}

export function bookStops(
  playbook: PlaybookId,
  entry: number,
  heat: boolean,
): { stop: number; take: number } {
  if (playbook === "grid") return gridStops(entry);
  if (playbook === "dca") return dcaStops(entry);
  const stopPct = heat ? 0.007 : 0.0035;
  const takePct = heat ? 0.02 : 0.0105;
  return { stop: entry * (1 - stopPct), take: entry * (1 + takePct) };
}

export function gridManage(p: {
  entry: number;
  mark: number;
  stop: number;
  take: number;
  qty: number;
}): { action: BookAction; stop: number; sellFrac: number } {
  const pnl = p.entry > 0 ? (p.mark - p.entry) / p.entry : 0;
  if (p.mark <= p.stop) return { action: "stop", stop: p.stop, sellFrac: 1 };
  if (p.mark >= p.take) return { action: "take", stop: p.stop, sellFrac: 1 };
  if (pnl >= GRID.stepPct && p.qty > 0) {
    return { action: "reduce", stop: Math.max(p.stop, p.entry * 0.999), sellFrac: GRID.reduceFrac };
  }
  return { action: "hold", stop: p.stop, sellFrac: 0 };
}

export function dcaManage(
  p: { openedAt: number; entry: number; mark: number; stop: number; take: number },
  now = Date.now(),
): { action: BookAction; stop: number; sellFrac: number } {
  if (p.mark <= p.stop) return { action: "stop", stop: p.stop, sellFrac: 1 };
  if (p.mark >= p.take) return { action: "take", stop: p.stop, sellFrac: 1 };
  if (now - p.openedAt >= DCA.maxHoldMs) {
    return { action: p.mark >= p.entry ? "time" : "stop", stop: p.stop, sellFrac: 1 };
  }
  return { action: "hold", stop: p.stop, sellFrac: 0 };
}

export function playbookWantsBuy(input: {
  playbook: PlaybookId;
  kind: "buy" | "sell" | "hold";
  rsi: number;
  changePct: number;
  hasPos: boolean;
  dipFromEntry: number;
  adds: number;
  msSinceAdd: number;
}): boolean {
  const { playbook, kind, rsi, changePct, hasPos, dipFromEntry, adds, msSinceAdd } = input;
  if (playbook === "scalp") return kind === "buy";
  if (kind === "sell") return false;
  if (playbook === "grid") {
    if (hasPos) {
      return dipFromEntry >= GRID.stepPct && adds < GRID.maxAdds;
    }
    return kind === "buy" || (rsi < 48 && changePct <= 0.15);
  }
  if (hasPos) {
    return dipFromEntry >= DCA.dipPct && adds < DCA.maxAdds && msSinceAdd >= DCA.cooldownMs;
  }
  return kind === "buy" || rsi < 52;
}

export function playbookSlicePct(playbook: PlaybookId): number {
  if (playbook === "grid") return GRID.slicePct;
  if (playbook === "dca") return DCA.slicePct;
  return 0;
}
