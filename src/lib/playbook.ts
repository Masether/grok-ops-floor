import type { TapeLens } from "./tape-lens.ts";
import { coversFees, feeAwareStops, USD_TAKER } from "./fees.ts";

export type PlaybookId = "scalp" | "grid" | "dca";

export const PLAYBOOKS: { id: PlaybookId; label: string; hint: string }[] = [
  { id: "scalp", label: "Scalp", hint: "fee-clear spike only · fewer tickets" },
  { id: "grid", label: "Grid", hint: "range · MACD chop · fee-clear steps" },
  { id: "dca", label: "DCA", hint: "dip adds · fee-clear take · MACD reset" },
];

export const ALL_PLAYBOOKS: PlaybookId[] = ["scalp", "grid", "dca"];

export const DEFAULT_PLAYBOOK: PlaybookId = "scalp";

/** Split of the $200 (or paper equity) across books when they run together. */
export const BOOK_SHARE: Record<PlaybookId, number> = {
  scalp: 0.08,
  grid: 0.52,
  dca: 0.40,
};

export function asPlaybook(v: unknown): PlaybookId {
  if (v === "grid" || v === "dca" || v === "scalp") return v;
  return DEFAULT_PLAYBOOK;
}

export function normalizePlaybooks(v: unknown): PlaybookId[] {
  if (Array.isArray(v)) {
    const next = [...new Set(v.map(asPlaybook).filter((id, i, a) => a.indexOf(id) === i))];
    const uniq = ALL_PLAYBOOKS.filter((id) => next.includes(id));
    if (uniq.length) return uniq;
  }
  if (v === "grid" || v === "dca" || v === "scalp") return [v];
  return [...ALL_PLAYBOOKS];
}

export type MacdLane = "up" | "down" | "chop";

export function macdLane(hist: number, prev: number): MacdLane {
  if (prev <= 0 && hist > 0) return "up";
  if (prev >= 0 && hist < 0) return "down";
  if (hist > 0 && hist >= prev) return "up";
  if (hist < 0 && hist <= prev) return "down";
  return "chop";
}

export const GRID = {
  rangePct: 0.025,
  stepPct: 0.009,
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
  taker = USD_TAKER,
): { stop: number; take: number } {
  if (playbook === "grid") return gridStops(entry);
  if (playbook === "dca") return dcaStops(entry);
  const band = feeAwareStops(entry, heat, taker);
  return { stop: band.stop, take: band.take };
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
  const paid = coversFees({ entry: p.entry, mark: p.mark, qty: p.qty, taker: USD_TAKER });
  if (p.mark >= p.take && paid) return { action: "take", stop: p.stop, sellFrac: 1 };
  if (paid && pnl >= GRID.stepPct && p.qty > 0) {
    return { action: "reduce", stop: Math.max(p.stop, p.entry * 0.999), sellFrac: GRID.reduceFrac };
  }
  return { action: "hold", stop: p.stop, sellFrac: 0 };
}

export function dcaManage(
  p: { openedAt: number; entry: number; mark: number; stop: number; take: number },
  now = Date.now(),
): { action: BookAction; stop: number; sellFrac: number } {
  if (p.mark <= p.stop) return { action: "stop", stop: p.stop, sellFrac: 1 };
  if (
    p.mark >= p.take &&
    coversFees({ entry: p.entry, mark: p.mark, taker: USD_TAKER })
  ) {
    return { action: "take", stop: p.stop, sellFrac: 1 };
  }
  if (now - p.openedAt >= DCA.maxHoldMs) {
    const paid = coversFees({ entry: p.entry, mark: p.mark, taker: USD_TAKER });
    return { action: paid ? "time" : "stop", stop: p.stop, sellFrac: 1 };
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
  macd?: MacdLane;
}): boolean {
  const { playbook, kind, rsi, changePct, hasPos, dipFromEntry, adds, msSinceAdd } = input;
  const lane = input.macd ?? "chop";
  if (playbook === "scalp") return kind === "buy" && lane !== "down";
  if (kind === "sell") return false;
  if (playbook === "grid") {
    if (hasPos) return dipFromEntry >= GRID.stepPct && adds < GRID.maxAdds && lane !== "up";
    if (lane === "up" && changePct > 1.2) return false;
    return Math.abs(changePct) <= 2.4 && rsi < 62;
  }
  if (hasPos) {
    return (
      dipFromEntry >= DCA.dipPct &&
      adds < DCA.maxAdds &&
      msSinceAdd >= DCA.cooldownMs &&
      lane !== "up"
    );
  }
  // Fresh DCA: prefer dips / soft tape, allow hold-kind scans.
  return lane !== "up" && (kind === "buy" || rsi < 58 || changePct <= -0.25);
}

/** Assign a free pair to one of the enabled books using MACD. */
export function pickPlaybook(input: {
  enabled: PlaybookId[];
  sleeve: "core" | "heat" | "stock";
  lane: MacdLane;
  kind: "buy" | "sell" | "hold";
  rsi: number;
  changePct: number;
  hasPos: boolean;
  existingBook?: PlaybookId;
  dipFromEntry: number;
  adds: number;
  msSinceAdd: number;
  bookScore?: Partial<Record<PlaybookId, number>>;
  lens?: TapeLens;
}): PlaybookId | null {
  const enabled = normalizePlaybooks(input.enabled);
  if (input.existingBook) {
    if (!enabled.includes(input.existingBook)) return null;
    return playbookWantsBuy({ playbook: input.existingBook, ...input, macd: input.lane })
      ? input.existingBook
      : null;
  }
  if (input.sleeve === "heat") {
    return enabled.includes("scalp") &&
      playbookWantsBuy({ playbook: "scalp", ...input, macd: input.lane })
      ? "scalp"
      : null;
  }
  const base: PlaybookId[] =
    input.lane === "chop"
      ? ["grid", "dca", "scalp"]
      : input.lane === "up"
        ? ["scalp", "grid", "dca"]
        : ["dca", "grid", "scalp"];
  const order = base.slice().sort((a, b) => {
    const boost = (id: PlaybookId) => (input.lens === id ? 1 : 0);
    const sa = (input.bookScore?.[a] ?? 0) + boost(a);
    const sb = (input.bookScore?.[b] ?? 0) + boost(b);
    if (sb !== sa) return sb - sa;
    return base.indexOf(a) - base.indexOf(b);
  });
  for (const pb of order) {
    if (!enabled.includes(pb)) continue;
    if ((input.bookScore?.[pb] ?? 0) <= -5) continue;
    if (playbookWantsBuy({ playbook: pb, ...input, macd: input.lane })) return pb;
  }
  return null;
}

export function playbookSlicePct(playbook: PlaybookId): number {
  if (playbook === "grid") return GRID.slicePct;
  if (playbook === "dca") return DCA.slicePct;
  return 0;
}
