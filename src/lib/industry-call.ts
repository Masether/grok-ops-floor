import type { PlaybookId } from "./playbook.ts";
import type { DailyStance } from "./daily-trend.ts";
import type { RegimeState } from "./specialists.ts";
import type { WireTone } from "./types.ts";

export type IndustryCallInput = {
  kind: "buy" | "sell" | "hold";
  playbook: PlaybookId | null;
  daily: DailyStance | "unknown";
  regime: RegimeState | "cold";
  fearGreed?: number | null;
  pairWireTone?: WireTone | null;
  spike: boolean;
  feesClear: boolean;
};

export type IndustryCall = { allow: boolean; why: string };

/**
 * Sit-USD / skip gates. Risk control only — not a profit promise.
 * Scalp is strict; grid/DCA keep working on core when the tape is quiet.
 */
export function industryCall(input: IndustryCallInput): IndustryCall {
  if (input.kind !== "buy") return { allow: true, why: "clear" };
  if (!input.playbook) return { allow: false, why: "no book" };

  // Dead daily: sit cash for every book.
  if (input.daily === "cash") return { allow: false, why: "daily sit USD" };

  const scalp = input.playbook === "scalp";
  const book = input.playbook === "grid" || input.playbook === "dca";

  // Hard trend-down: skip fresh scalps; grid/DCA may still mean-revert.
  if (input.regime === "trend-down" && scalp) {
    return { allow: false, why: "tape trend down — no scalp" };
  }

  if (scalp && input.daily === "chop" && !input.spike) {
    return { allow: false, why: "daily chop — no scalp" };
  }
  if (scalp && input.regime === "chop" && !input.spike) {
    return { allow: false, why: "tape chop — no scalp" };
  }
  if (scalp && input.pairWireTone === "bear") {
    return { allow: false, why: "wire bear — skip scalp" };
  }

  const fg = input.fearGreed;
  if (typeof fg === "number" && fg <= 15 && scalp && !input.spike) {
    return { allow: false, why: "extreme fear — sit" };
  }
  if (typeof fg === "number" && fg >= 85 && scalp && input.daily !== "long") {
    return { allow: false, why: "extreme greed — no chase" };
  }
  // Entry: spike quality is enough; exit path still uses coversFees / minTakePct.
  if (scalp && !input.feesClear && !input.spike) {
    return { allow: false, why: "fees eat this clip" };
  }
  // Soft: extreme fear shrinks appetite for new DCA adds (not grid rungs).
  if (typeof fg === "number" && fg <= 12 && book && input.playbook === "dca") {
    return { allow: false, why: "extreme fear — no DCA add" };
  }

  return { allow: true, why: "clear" };
}
