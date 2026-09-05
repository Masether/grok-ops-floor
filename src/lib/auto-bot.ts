/** One gate for the live auto bot. Tape can watch; this is what may SEND to Kraken. */

import { MIN_LIVE_TICKET, krakenKeysOn, usdStable, usdtStable } from "./live-budget.ts";
import type { FloorState } from "./store.ts";

export function autoBotReady(s: Pick<
  FloorState,
  "keys" | "keysOk" | "autoTrade" | "floorOpen" | "liveArmed" | "liveBalance" | "launched"
>): { ok: true; usd: number } | { ok: false; why: string } {
  if (!s.launched) return { ok: false, why: "desk not launched" };
  if (!krakenKeysOn(s.keys)) return { ok: false, why: "paste Kraken Query + Orders keys" };
  if (s.keysOk === false) return { ok: false, why: "Kraken auth failed — tap Test keys" };
  if (!s.autoTrade && !s.liveArmed && !s.floorOpen) return { ok: false, why: "auto is off" };
  if (!s.liveBalance) return { ok: false, why: "waiting on Kraken wallet read" };
  const usd = usdStable(s.liveBalance);
  const usdt = usdtStable(s.liveBalance);
  if (usd < MIN_LIVE_TICKET && usdt < MIN_LIVE_TICKET) {
    return { ok: false, why: `need ≥$${MIN_LIVE_TICKET} USD on Kraken (have ${usd.toFixed(2)})` };
  }
  return { ok: true, usd };
}
