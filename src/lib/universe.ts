import { DEFAULT_PAIRS, PAIR_BY_ID } from "./kraken";
import type { PairId, Ticker } from "./types";

export type UniverseId = "all" | "balanced" | "core" | "heat" | "rising";
export type LaneId = "hot" | "rising" | "meme";

export type Universe = {
  id: UniverseId;
  label: string;
  blurb: string;
  pairs: PairId[];
};

export type Lane = {
  id: LaneId;
  label: string;
  blurb: string;
  pairs: PairId[];
};

export const ALL_LANE_IDS: LaneId[] = ["hot", "rising", "meme"];

export const LANES: Lane[] = [
  {
    id: "hot",
    label: "Hot tape",
    blurb: "What's moving on the majors.",
    pairs: ["XBTUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ADAUSD", "LINKUSD"],
  },
  {
    id: "rising",
    label: "Uprising",
    blurb: "Alts with room to run — SUI, TAO, NEAR, AVAX.",
    pairs: ["AVAXUSD", "SUIUSD", "TAOUSD", "NEARUSD", "LINKUSD", "SOLUSD"],
  },
  {
    id: "meme",
    label: "Meme mix",
    blurb: "New memes with upside. Can go to zero.",
    pairs: ["DOGEUSD", "SHIBUSD", "PEPEUSD", "WIFUSD", "BONKUSD", "FLOKIUSD", "PENGUUSD"],
  },
];

export const LANE_BY_ID: Record<LaneId, Lane> = Object.fromEntries(
  LANES.map((l) => [l.id, l]),
) as Record<LaneId, Lane>;

export const UNIVERSES: Universe[] = [
  {
    id: "all",
    label: "All three",
    blurb: "Hot tape, uprising alts, and memes.",
    pairs: DEFAULT_PAIRS,
  },
  {
    id: "balanced",
    label: "Balanced mix",
    blurb: "Majors plus a few memes with upside.",
    pairs: DEFAULT_PAIRS,
  },
  {
    id: "core",
    label: "Core only",
    blurb: "BTC, ETH, SOL and names that can compound.",
    pairs: ["XBTUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ADAUSD", "LINKUSD"],
  },
  {
    id: "heat",
    label: "Heat + meme",
    blurb: "Rising memes, small size. Can go to zero.",
    pairs: ["XBTUSD", "SOLUSD", "DOGEUSD", "PEPEUSD", "WIFUSD", "BONKUSD", "FLOKIUSD"],
  },
  {
    id: "rising",
    label: "Rising alts",
    blurb: "Names that are moving — SUI, TAO, NEAR, AVAX.",
    pairs: ["SOLUSD", "AVAXUSD", "SUIUSD", "TAOUSD", "NEARUSD", "LINKUSD"],
  },
];

export const UNIVERSE_BY_ID: Record<UniverseId, Universe> = Object.fromEntries(
  UNIVERSES.map((u) => [u.id, u]),
) as Record<UniverseId, Universe>;

export function inferUniverse(pairs: PairId[]): UniverseId | "custom" {
  const key = [...pairs].sort().join(",");
  for (const u of UNIVERSES) {
    if ([...u.pairs].sort().join(",") === key) return u.id;
  }
  return "custom";
}

export function inferLanes(pairs: PairId[]): LaneId[] {
  const on = LANES.filter((lane) => lane.pairs.some((id) => pairs.includes(id))).map(
    (lane) => lane.id,
  );
  return on.length ? on : [...ALL_LANE_IDS];
}

function scorePair(id: PairId, tickers: Partial<Record<PairId, Ticker>>): number {
  const t = tickers[id];
  const ch = t?.changePct ?? 0;
  const vol = t?.volume ?? 0;
  return ch + Math.min(vol / 1e9, 2);
}

function hasTape(tickers: Partial<Record<PairId, Ticker>>): boolean {
  return Object.values(tickers).some((t) => t && (t.changePct !== 0 || t.volume > 0));
}

/** Rank live tape inside the enabled lanes. All three: 2 hot + 2 uprising + 2 memes. */
export function pickHotBook(
  tickers: Partial<Record<PairId, Ticker>>,
  lanes: readonly LaneId[] = ALL_LANE_IDS,
): PairId[] {
  const enabled = (lanes.length ? lanes : ALL_LANE_IDS).filter((id) => LANE_BY_ID[id]);
  if (enabled.length === ALL_LANE_IDS.length && !hasTape(tickers)) {
    return [...DEFAULT_PAIRS];
  }
  const per = enabled.length >= 3 ? 2 : enabled.length === 2 ? 3 : 6;
  const out: PairId[] = [];
  for (const id of enabled) {
    const pool = LANE_BY_ID[id].pairs.filter((p) => !out.includes(p));
    const ranked = [...pool]
      .sort((a, b) => scorePair(b, tickers) - scorePair(a, tickers))
      .slice(0, per);
    out.push(...ranked);
  }
  return out.length ? out : [...DEFAULT_PAIRS];
}

export function pairLabels(ids: PairId[]): string {
  return ids.map((id) => PAIR_BY_ID[id]?.base ?? id).join(" · ");
}
