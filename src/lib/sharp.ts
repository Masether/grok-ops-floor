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
  if (input.conf < 0.5) return { ok: false, why: "weak tape — need 50%+" };
  if (input.grokKind !== "buy" || input.readKind !== "buy") {
    return { ok: false, why: "Grok and tape disagree" };
  }
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
