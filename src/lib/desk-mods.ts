/** What actually fires. Boot writes this; engine reads it. */

export const DESK_MOD_KEY = "ops-desk-mods";
export const DESK_MOD_VER_KEY = "ops-desk-mods-ver";
export const DESK_MOD_VER = "8";

export const DESK_MODS = [
  { id: "live", label: "Kraken live tape", hint: "prices, candles, fills", group: "must", on: true },
  { id: "scalp", label: "Scalp spikes", hint: "only a huge rising spike from tape or trend wire", group: "trade", on: true },
  { id: "heat", label: "Heat memes", hint: "scalp only if they rip", group: "trade", on: true },
  { id: "core", label: "Core majors", hint: "ETH SOL — grid + DCA", group: "trade", on: true },
  { id: "grid", label: "Grid", hint: "range rungs — main book today", group: "trade", on: true },
  { id: "dca", label: "DCA", hint: "dip adds — main book today", group: "trade", on: true },
  { id: "dust", label: "Dust → USD", hint: "parked", group: "trade", on: false },
  { id: "scout", label: "Scout 800 books", hint: "find names, don't scalp from 24h alone", group: "trade", on: true },
  { id: "brain", label: "Brain", hint: "learn from closes", group: "trade", on: true },
  { id: "grok", label: "Grok vote", hint: "swarm debate on every ticket", group: "trade", on: false },
  { id: "compound", label: "Bank PnL to USD", hint: "lock green into the wallet", group: "trade", on: false },
  { id: "swarm", label: "Swarm animation", hint: "12 orbs + dust, in sync with the tape", group: "ui", on: true },
  { id: "wire", label: "News wire", hint: "source for spike alerts", group: "ui", on: true },
  { id: "charts", label: "Charts bubble", hint: "the chart drawer", group: "ui", on: false },
  { id: "deskui", label: "Desk blotter UI", hint: "the big desk panel", group: "ui", on: false },
  { id: "catchup", label: "Away replay", hint: "replay bars when the tab slept", group: "ui", on: false },
] as const;

export type DeskModId = (typeof DESK_MODS)[number]["id"];

export type DeskModMap = Record<DeskModId, boolean>;

export function defaultDeskMods(): DeskModMap {
  const out = {} as DeskModMap;
  for (const m of DESK_MODS) out[m.id] = m.on;
  return out;
}

export function loadDeskMods(): DeskModMap {
  const base = defaultDeskMods();
  if (typeof window === "undefined") return base;
  try {
    const ver = window.localStorage.getItem(DESK_MOD_VER_KEY);
    if (ver !== DESK_MOD_VER) {
      window.localStorage.setItem(DESK_MOD_VER_KEY, DESK_MOD_VER);
      window.localStorage.setItem(DESK_MOD_KEY, JSON.stringify(base));
      return base;
    }
    const raw = window.localStorage.getItem(DESK_MOD_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DeskModMap>;
    for (const m of DESK_MODS) {
      if (typeof parsed[m.id] === "boolean") base[m.id] = parsed[m.id]!;
    }
  } catch {
    /* keep defaults */
  }
  base.live = true;
  return base;
}

export function saveDeskMods(mods: DeskModMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DESK_MOD_VER_KEY, DESK_MOD_VER);
    window.localStorage.setItem(DESK_MOD_KEY, JSON.stringify({ ...mods, live: true }));
  } catch {
    /* private mode */
  }
}

export function modOn(id: DeskModId): boolean {
  return loadDeskMods()[id] !== false;
}
