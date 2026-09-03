import { usdOnBook } from "./specialists.ts";
import { getPair, isBtcQuote } from "./kraken.ts";
import type { Position, Ticker, PairId } from "./types.ts";

export const DEFAULT_LIVE_BUDGET = 200;
export const MAX_LIVE_TICKET = 100;
export const MIN_LIVE_BUDGET = 20;
export const MAX_LIVE_BUDGET = 50_000;
export const LIVE_BUDGET_PRESETS = [50, 100, 200, 500] as const;
export const MIN_LIVE_TICKET = 12;
export const MIN_LIVE_HALT_USD = 40;

export function clampLiveBudget(n: number): number {
  const x = Number.isFinite(n) ? n : DEFAULT_LIVE_BUDGET;
  return Math.min(MAX_LIVE_BUDGET, Math.max(MIN_LIVE_BUDGET, x));
}

export function restoreLiveBudget(n: unknown): number {
  const x = clampLiveBudget(typeof n === "number" ? n : DEFAULT_LIVE_BUDGET);
  if (x === 100) return DEFAULT_LIVE_BUDGET;
  return x;
}

export function liveDayBase(input: {
  dayStart: number;
  budget: number;
  equity: number;
  openLots: number;
}): number {
  const start = input.dayStart;
  if (start > 0 && start <= input.budget * 1.25 && start >= input.budget * 0.4) return start;
  if (!(input.openLots > 0)) return input.equity;
  return input.equity;
}

export function deskIsLive(s: {
  mode?: string;
  liveArmed?: boolean;
  liveBalance?: Record<string, string> | null;
}): boolean {
  return s.mode === "live" || Boolean(s.liveArmed) || hasKrakenBook(s.liveBalance);
}

export function usdStable(bal: Record<string, string> | null | undefined): number {
  if (!bal) return 0;
  const keys = ["ZUSD", "USD", "ZUSD.F", "USD.F", "USD.HOLD", "ZUSD.HOLD"];
  return keys.reduce((a, k) => a + Number(bal[k] ?? 0), 0);
}

export function usdtStable(bal: Record<string, string> | null | undefined): number {
  if (!bal) return 0;
  return (
    Number(bal.USDT ?? 0) + Number(bal.ZUSDT ?? 0) + Number(bal["USDT.F"] ?? 0)
  );
}

export function krakenKeysOn(keys: { apiKey?: string; apiSecret?: string } | null | undefined): {
  apiKey: string;
  apiSecret: string;
} | null {
  const apiKey = keys?.apiKey?.trim() ?? "";
  const apiSecret = keys?.apiSecret?.trim() ?? "";
  if (apiKey.length < 8 || apiSecret.length < 8) return null;
  return { apiKey, apiSecret };
}

export function krakenBaseKeys(base: string): string[] {
  const b = base.replace(/x$/i, "").toUpperCase();
  const keys = [b, `X${b}`, `XX${b}`, `${b}.F`, `X${b}.F`, `XX${b}.F`];
  if (b === "BTC" || b === "XBT") keys.push("XXBT", "XBT", "XXBT.F", "XBT.F");
  if (b === "ETH") keys.push("XETH", "ETH", "XETH.F");
  if (b === "DOGE") keys.push("XXDG", "XDG", "XXDG.F");
  return [...new Set(keys)];
}

export function spotQty(bal: Record<string, string> | null | undefined, base: string): number {
  if (!bal) return 0;
  return krakenBaseKeys(base).reduce((a, k) => a + Number(bal[k] ?? 0), 0);
}

export function btcOnBook(bal: Record<string, string> | null | undefined): number {
  return spotQty(bal, "BTC");
}

export function btcUsdValue(
  bal: Record<string, string> | null | undefined,
  btcUsd: number,
): number {
  const btc = btcOnBook(bal);
  if (!(btc > 0) || !(btcUsd > 0)) return 0;
  return btc * btcUsd;
}

export function hasKrakenBook(bal: Record<string, string> | null | undefined): boolean {
  return Boolean(bal && Object.keys(bal).length > 0);
}

export function lotUsd(
  p: { pair: PairId; qty: number; mark: number; entry?: number },
  tickers: Partial<Record<PairId, Ticker>> | undefined,
  btcPx: number,
  useEntry = false,
): number {
  const px = useEntry ? (p.entry ?? p.mark) : (tickers?.[p.pair]?.last ?? p.mark);
  const notion = px * p.qty;
  if (isBtcQuote(p.pair) && btcPx > 0) return notion * btcPx;
  return notion;
}

export function livePositions(positions: Position[]): Position[] {
  return positions.filter((p) => p.mode === "live");
}

export function liveSleeve(input: {
  liveBudget: number;
  liveBalance: Record<string, string> | null | undefined;
  positions: Position[];
  tickers?: Partial<Record<PairId, Ticker>>;
}): {
  budget: number;
  venue: number;
  usd: number;
  usdt: number;
  btc: number;
  btcUsd: number;
  cost: number;
  deployed: number;
  cash: number;
  equity: number;
} {
  const budget = clampLiveBudget(input.liveBudget);
  const usd = usdStable(input.liveBalance);
  const usdt = usdtStable(input.liveBalance);
  const btcPx = input.tickers?.XBTUSD?.last ?? 0;
  const btc = btcOnBook(input.liveBalance);
  const btcUsd = btcUsdValue(input.liveBalance, btcPx);
  const venue = usdOnBook(input.liveBalance) + btcUsd;
  const lots = livePositions(input.positions).filter((p) => p.pair !== "XBTUSD");
  const cost = lots.reduce((a, p) => a + lotUsd(p, input.tickers, btcPx, true), 0);
  const deployed = lots.reduce((a, p) => a + lotUsd(p, input.tickers, btcPx), 0);
  const cash = Math.max(0, Math.min(venue, Math.max(0, budget - cost)));
  return {
    budget,
    venue,
    usd,
    usdt,
    btc,
    btcUsd,
    cost,
    deployed,
    cash,
    equity: cash + deployed,
  };
}
