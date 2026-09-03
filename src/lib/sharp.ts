import type { MacdLane, PlaybookId } from "./playbook.ts";

export function liveEntry(input: {
  grokKind: string;
  readKind: string;
  lane: MacdLane;
  playbook: PlaybookId | null;
  conf: number;
  heat: boolean;
  changePct: number;
  recentPnl: number[];
  sessionPnl: number;
  budget: number;
}): { ok: true } | { ok: false; why: string } {
  if (!input.playbook) return { ok: false, why: "no book" };
  if (input.conf < (input.grokKind === "buy" ? 0.45 : 0.55)) {
    return { ok: false, why: "weak tape" };
  }
  if (input.grokKind === "sell") return { ok: false, why: "Grok veto" };
  if (input.readKind !== "buy") return { ok: false, why: "tape is not a buy" };
  if (input.playbook === "scalp" && input.lane !== "up") {
    return { ok: false, why: "MACD not up — no scalp" };
  }
  if (input.heat && !(input.changePct >= 1.2)) {
    return { ok: false, why: "heat not moving" };
  }
  const lastTwo = input.recentPnl.slice(0, 2);
  if (lastTwo.length >= 2 && lastTwo.every((n) => n < 0)) {
    return { ok: false, why: "two losses in a row — cooling" };
  }
  if (input.sessionPnl < -input.budget * 0.06) {
    return { ok: false, why: "session drawdown — wait" };
  }
  return { ok: true };
}
