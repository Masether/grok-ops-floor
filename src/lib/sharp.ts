import type { MacdLane, PlaybookId } from "./playbook.ts";
import type { DailyStance } from "./daily-trend.ts";
import type { WireTone } from "./types.ts";
import { edgeClearsFees, minTakePct, USD_TAKER } from "./fees.ts";
import { industryCall } from "./industry-call.ts";
import type { RegimeState } from "./specialists.ts";

export function liveEntry(input: {
  grokKind: string;
  readKind: string;
  lane: MacdLane;
  playbook: PlaybookId | null;
  conf: number;
  heat: boolean;
  hot?: boolean;
  changePct: number;
  /** Expected move as a fraction (e.g. 0.025 = 2.5%). */
  expectedMovePct?: number;
  taker?: number;
  recentPnl: number[];
  sessionPnl: number;
  budget: number;
  daily?: DailyStance | "unknown";
  regime?: RegimeState | "cold" | string;
  fearGreed?: number | null;
  pairWireTone?: WireTone | null;
  spike?: boolean;
}): { ok: true } | { ok: false; why: string } {
  const hot = Boolean(input.hot) || (input.heat && input.changePct >= 0.06);
  const taker = input.taker ?? USD_TAKER;
  if (!input.playbook) return { ok: false, why: "no book" };
  if (input.grokKind === "sell" && !hot) return { ok: false, why: "Grok veto" };
  if (input.conf < 0.34 && !(input.heat && hot)) return { ok: false, why: "weak tape" };
  const bookBuy = input.playbook === "grid" || input.playbook === "dca";
  const spikeBuy = input.playbook === "scalp" && hot;
  const wants = bookBuy || spikeBuy || input.readKind === "buy" || input.grokKind === "buy";
  if (!wants) return { ok: false, why: "no buy from tape or Grok" };
  if (input.playbook === "scalp" && input.lane === "down" && !(input.heat && hot)) {
    return { ok: false, why: "MACD down — no scalp" };
  }
  const move = input.expectedMovePct ?? input.changePct / 100;
  const hotEscape = hot && input.changePct >= minTakePct(taker) * 100 * 0.55;
  const feesClear =
    input.playbook !== "scalp" || edgeClearsFees(move, taker) || hotEscape;
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

  const spike = input.spike ?? hot;
  const daily = input.daily ?? "unknown";
  const regimeRaw = input.regime ?? "cold";
  const regime =
    regimeRaw === "trend-up" ||
    regimeRaw === "trend-down" ||
    regimeRaw === "chop" ||
    regimeRaw === "cold"
      ? regimeRaw
      : "cold";
  const call = industryCall({
    kind: "buy",
    playbook: input.playbook,
    daily,
    regime,
    fearGreed: input.fearGreed ?? null,
    pairWireTone: input.pairWireTone ?? null,
    spike,
    feesClear,
  });
  if (!call.allow) return { ok: false, why: call.why };

  return { ok: true };
}
