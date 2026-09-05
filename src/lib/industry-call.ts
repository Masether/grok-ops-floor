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

/** Sit-USD / skip gates from daily trend, short tape, wire, F&G, and fees. Risk control only. */
export function industryCall(input: IndustryCallInput): IndustryCall {
  if (input.kind !== "buy") return { allow: true, why: "clear" };

  if (!input.playbook) return { allow: false, why: "no book" };
  if (input.daily === "cash") return { allow: false, why: "daily sit USD" };
  if (input.regime === "trend-down") return { allow: false, why: "tape trend down — sit" };

  const scalp = input.playbook === "scalp";
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
  if (scalp && !input.feesClear) {
    return { allow: false, why: "fees eat this clip" };
  }

  return { allow: true, why: "clear" };
}
