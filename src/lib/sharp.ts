import type { MacdLane, PlaybookId } from "./playbook.ts";

export function liveEntry(input: {
  grokKind: string;
  readKind: string;
  lane: MacdLane;
  playbook: PlaybookId | null;
  conf: number;
  heat: boolean;
  hot?: boolean;
  changePct: number;
  recentPnl: number[];
  sessionPnl: number;
  budget: number;
}): { ok: true } | { ok: false; why: string } {
  const hot = Boolean(input.hot) || (input.heat && input.changePct >= 0.06);
  if (!input.playbook) return { ok: false, why: "no book" };
  if (input.grokKind === "sell" && !hot) return { ok: false, why: "Grok veto" };
  if (input.conf < 0.26 && !(input.heat && hot)) return { ok: false, why: "weak tape" };
  const bookBuy = input.playbook === "grid" || input.playbook === "dca";
  const spikeBuy = input.playbook === "scalp" && hot;
  const wants = bookBuy || spikeBuy || input.readKind === "buy" || input.grokKind === "buy";
  if (!wants) return { ok: false, why: "no buy from tape or Grok" };
  if (input.playbook === "scalp" && input.lane === "down" && !(input.heat && hot)) {
    return { ok: false, why: "MACD down — no scalp" };
  }
  if (input.heat && input.changePct < -2) {
    return { ok: false, why: "heat dumping" };
  }
  if (input.heat && !hot && input.lane !== "up") {
    return { ok: false, why: "heat not moving" };
  }
  const lastTwo = input.recentPnl.slice(0, 2);
  if (input.playbook === "scalp" && lastTwo.length >= 2 && lastTwo.every((n) => n < 0)) {
    return { ok: false, why: "two losses in a row — cooling" };
  }
  if (input.sessionPnl < -input.budget * 0.12) {
    return { ok: false, why: "session drawdown — wait" };
  }
  return { ok: true };
}
