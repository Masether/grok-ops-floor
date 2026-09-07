/** Narrow the desk to a calm hold — no scalp spray. */

import type { PairId } from "./types.ts";

export const HOLD_FOCUS_KEY = "ops-hold-focus";
export const HOLD_FOCUS_PAIRS: PairId[] = ["TAOUSD"];
/** Release the hold when spot BTC prints at/above this (USD). */
export const HOLD_FOCUS_RELEASE_BTC = 82_000;

export type HoldFocusState = {
  on: boolean;
  pairs: PairId[];
  releaseBtcUsd: number;
};

export function defaultHoldFocus(): HoldFocusState {
  return { on: false, pairs: [...HOLD_FOCUS_PAIRS], releaseBtcUsd: HOLD_FOCUS_RELEASE_BTC };
}

export function loadHoldFocus(): HoldFocusState {
  const base = defaultHoldFocus();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(HOLD_FOCUS_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<HoldFocusState>;
    return {
      on: Boolean(p.on),
      pairs: Array.isArray(p.pairs) && p.pairs.length
        ? (p.pairs.filter((id) => typeof id === "string") as PairId[])
        : [...HOLD_FOCUS_PAIRS],
      releaseBtcUsd:
        typeof p.releaseBtcUsd === "number" && p.releaseBtcUsd > 0
          ? p.releaseBtcUsd
          : HOLD_FOCUS_RELEASE_BTC,
    };
  } catch {
    return base;
  }
}

export function saveHoldFocus(next: HoldFocusState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HOLD_FOCUS_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function holdFocusOn(): boolean {
  return loadHoldFocus().on;
}

export function holdFocusPairs(): PairId[] {
  const h = loadHoldFocus();
  return h.on ? h.pairs : [];
}
