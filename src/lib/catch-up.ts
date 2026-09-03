/** Replay paper lots across the gap while the phone was closed. */

import { readScalp } from "./indicators.ts";
import { PAIR_BY_ID } from "./kraken.ts";
import { SCALP, scalpManage, scalpStops } from "./scalp.ts";
import type { Order, PairId, Position } from "./types.ts";

export const AWAY_MIN_MS = 90_000;
export const AWAY_MAX_MS = 12 * 3_600_000;
const FEE = 0.0026;

function uid(p: string) {
  return `${p}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
}

export type AwayBar = {
  time: number;
  pair: PairId;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AwayBook = {
  cash: number;
  realized: number;
  positions: Position[];
  orders: Order[];
  risk: { sizePct: number; maxPositions: number };
  pairs: PairId[];
};

export type AwayReport = {
  awayMs: number;
  fills: number;
  takes: number;
  stops: number;
  pnl: number;
};

export function replayAway(book: AwayBook, bars: AwayBar[]): { book: AwayBook; report: AwayReport } {
  const next: AwayBook = {
    cash: book.cash,
    realized: book.realized,
    positions: book.positions.map((p) => ({ ...p })),
    orders: book.orders.slice(),
    risk: book.risk,
    pairs: book.pairs,
  };
  const startRealized = book.realized;
  let fills = 0;
  let takes = 0;
  let stops = 0;
  const candles: Partial<Record<PairId, number[]>> = {};
  const volumes: Partial<Record<PairId, number[]>> = {};
  const firstClose: Partial<Record<PairId, number>> = {};

  const sorted = bars.slice().sort((a, b) => a.time - b.time || a.pair.localeCompare(b.pair));
  for (const bar of sorted) {
    if (!next.pairs.includes(bar.pair)) continue;
    if (!(bar.close > 0)) continue;
    if (firstClose[bar.pair] == null) firstClose[bar.pair] = bar.close;
    const cs = (candles[bar.pair] ??= []);
    const vs = (volumes[bar.pair] ??= []);
    cs.push(bar.close);
    vs.push(bar.volume);
    if (cs.length > 48) {
      cs.shift();
      vs.shift();
    }

    const pos = next.positions.find((p) => p.pair === bar.pair);
    if (pos) {
      const managed = scalpManage(
        { openedAt: pos.openedAt, entry: pos.entry, mark: bar.close, stop: pos.stop, take: pos.take },
        bar.time,
      );
      pos.mark = bar.close;
      pos.stop = managed.stop;
      let action = managed.action;
      if (bar.low <= pos.stop) action = "stop";
      else if (bar.high >= pos.take) action = "take";
      if (action === "hold") continue;
      const fillPx = action === "stop" ? pos.stop : action === "take" ? pos.take : bar.close;
      closeLot(next, pos, fillPx, bar.time, action);
      fills += 1;
      if (action === "take") takes += 1;
      if (action === "stop") stops += 1;
      continue;
    }

    if (cs.length < 8) continue;
    if (next.positions.length >= next.risk.maxPositions) continue;
    const sleeve = PAIR_BY_ID[bar.pair]?.sleeve;
    if (sleeve === "core") {
      const cores = next.positions.filter((p) => PAIR_BY_ID[p.pair]?.sleeve === "core").length;
      if (cores >= 2) continue;
    }
    if (sleeve === "heat") {
      const heats = next.positions.filter((p) => PAIR_BY_ID[p.pair]?.sleeve === "heat").length;
      if (heats >= 2) continue;
      const open = firstClose[bar.pair] ?? bar.close;
      if (open > 0 && (bar.close - open) / open < 0.004) continue;
    }
    const read = readScalp(cs, vs);
    if (read.kind !== "buy" || read.confidence < SCALP.minConf) continue;
    const sized = sizeLot(next, bar.pair, bar.close, read.confidence);
    if (!sized) continue;
    openLot(next, bar.pair, sized, bar.close, bar.time, read.reason);
    fills += 1;
  }

  return {
    book: next,
    report: {
      awayMs: 0,
      fills,
      takes,
      stops,
      pnl: next.realized - startRealized,
    },
  };
}

function sizeLot(book: AwayBook, pair: PairId, price: number, confidence: number): number | null {
  const def = PAIR_BY_ID[pair];
  if (!def || !(price > 0)) return null;
  const posValue = book.positions.reduce((a, p) => a + p.mark * p.qty, 0);
  const equity = book.cash + posValue;
  const sleeveTilt = def.sleeve === "heat" ? 0.7 : def.sleeve === "stock" ? 0.8 : 1;
  const qty =
    (equity * book.risk.sizePct * sleeveTilt * (0.55 + confidence * 0.9)) / price;
  const notional = qty * price;
  if (notional < 10 || notional > book.cash * 0.98) return null;
  const rounded = Number(qty.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
  if (rounded < def.ordermin) return null;
  return rounded;
}

function openLot(book: AwayBook, pair: PairId, qty: number, price: number, ts: number, reason: string) {
  const fee = price * qty * FEE;
  const heat = PAIR_BY_ID[pair]?.sleeve === "heat";
  const band = scalpStops(price, heat);
  book.cash -= price * qty + fee;
  book.positions.push({
    id: uid("pos"),
    pair,
    side: "buy",
    qty,
    entry: price,
    mark: price,
    stop: band.stop,
    take: band.take,
    openedAt: ts,
    mode: "paper",
    note: `AWAY ${reason}`,
  });
  book.orders = [
    {
      id: uid("ord"),
      pair,
      side: "buy" as const,
      qty,
      price,
      fillPrice: price,
      fee,
      status: "filled" as const,
      mode: "paper" as const,
      reason: `AWAY IN · ${reason}`,
      ts,
    },
    ...book.orders,
  ].slice(0, 80);
}

function closeLot(book: AwayBook, pos: Position, fill: number, ts: number, action: string) {
  const fee = fill * pos.qty * FEE;
  const pnl = (fill - pos.entry) * pos.qty - fee;
  book.cash += fill * pos.qty - fee;
  book.realized += pnl;
  book.positions = book.positions.filter((p) => p.id !== pos.id);
  const tag = action === "take" ? "TP" : action === "stop" ? "SL" : "TIME";
  book.orders = [
    {
      id: uid("ord"),
      pair: pos.pair,
      side: "sell" as const,
      qty: pos.qty,
      price: fill,
      fillPrice: fill,
      fee,
      pnl,
      status: "filled" as const,
      mode: "paper" as const,
      reason: `AWAY OUT · ${tag}`,
      ts,
    },
    ...book.orders,
  ].slice(0, 80);
}
