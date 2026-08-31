import { PAIR_BY_ID, SEED_PRICE } from "./kraken";
import type { Candle, PairId, Ticker } from "./types";

type Walk = { price: number; open: number; high: number; low: number; volume: number };

const walks = new Map<PairId, Walk>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function walkFor(pair: PairId): Walk {
  let w = walks.get(pair);
  if (!w) {
    const p = SEED_PRICE[pair];
    w = { price: p, open: p, high: p, low: p, volume: 1200 };
    walks.set(pair, w);
  }
  return w;
}

export function resetSim(pair?: PairId) {
  if (pair) walks.delete(pair);
  else walks.clear();
}

export function stepSim(pair: PairId): Ticker {
  const w = walkFor(pair);
  const vol = pair === "XBTUSD" ? 0.0014 : 0.0026;
  const shock = (Math.random() - 0.48) * vol * w.price * (Math.random() < 0.05 ? 4.5 : 1);
  w.price = Math.max(w.price * 0.0001, w.price + shock);
  w.high = Math.max(w.high, w.price);
  w.low = Math.min(w.low, w.price);
  w.volume += Math.random() * 12;
  const last = w.price;
  return {
    pair,
    last,
    bid: last * 0.9997,
    ask: last * 1.0003,
    open: w.open,
    high: w.high,
    low: w.low,
    volume: w.volume,
    vwap: (w.open + last) / 2,
    changePct: w.open ? ((last - w.open) / w.open) * 100 : 0,
    ts: Date.now(),
  };
}

export function makeSimCandles(pair: PairId, n = 120, intervalMs = 5 * 60_000): Candle[] {
  const seed = Array.from(pair).reduce((a, c) => a + c.charCodeAt(0), 1);
  const rand = rng(seed * 997);
  let price = SEED_PRICE[pair];
  const now = Date.now();
  const out: Candle[] = [];
  for (let i = n; i >= 1; i--) {
    const drift = (rand() - 0.49) * 0.004;
    const open = price;
    const close = price * (1 + drift);
    const high = Math.max(open, close) * (1 + rand() * 0.002);
    const low = Math.min(open, close) * (1 - rand() * 0.002);
    out.push({
      time: now - i * intervalMs,
      open,
      high,
      low,
      close,
      volume: 40 + rand() * 400,
    });
    price = close;
  }
  const last = out[out.length - 1];
  if (last) {
    const w = walkFor(pair);
    w.price = last.close;
    w.open = out[0]?.open ?? last.close;
    w.high = Math.max(...out.map((c) => c.high));
    w.low = Math.min(...out.map((c) => c.low));
  }
  return out;
}
