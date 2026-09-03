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
  if (input.grokKind === "sell") return { ok: false, why: "Grok veto" };
  if (input.conf < 0.36) return { ok: false, why: "weak tape" };
  const wants =
    input.readKind === "buy" ||
    input.grokKind === "buy" ||
    (input.playbook === "scalp" && input.lane === "up");
  if (!wants) return { ok: false, why: "no buy from tape or Grok" };
  if (input.playbook === "scalp" && input.lane === "down") {
    return { ok: false, why: "MACD down — no scalp" };
  }
  if (input.heat && input.changePct < -1) {
    return { ok: false, why: "heat dumping" };
  }
  const lastTwo = input.recentPnl.slice(0, 2);
  if (lastTwo.length >= 2 && lastTwo.every((n) => n < -0.5)) {
    return { ok: false, why: "two losses in a row — cooling" };
  }
  if (input.sessionPnl < -input.budget * 0.12) {
    return { ok: false, why: "session drawdown — wait" };
  }
  return { ok: true };
}
