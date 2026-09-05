import { PAIR_BY_ID, PAIR_BY_WS, getPair } from "./kraken.ts";
import type { Candle, PairId, Ticker } from "./types.ts";

type WsTicker = {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  vwap: number;
  low: number;
  high: number;
  change: number;
  change_pct: number;
};

type WsOhlc = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval?: number;
  interval_begin?: string;
  timestamp?: number | string;
};

export type LiveOhlcKind = "snapshot" | "update";

export function ohlcTime(row: WsOhlc): number {
  if (row.interval_begin) {
    const t = Date.parse(row.interval_begin);
    if (Number.isFinite(t)) return t;
  }
  const ts = Number(row.timestamp);
  if (Number.isFinite(ts) && ts > 0) return ts > 1e12 ? ts : ts * 1000;
  return Date.now();
}

export function asLiveCandle(row: WsOhlc): Candle | null {
  const close = Number(row.close);
  if (!(close > 0)) return null;
  return {
    time: ohlcTime(row),
    open: Number(row.open) || close,
    high: Number(row.high) || close,
    low: Number(row.low) || close,
    close,
    volume: Math.max(0, Number(row.volume) || 0),
  };
}

/** Fold a live 1m bar into REST history. Same timestamp replaces the last bar. */
export function mergeLiveCandle(existing: Candle[], bar: Candle): Candle[] {
  if (existing.length === 0) return [bar];
  const last = existing[existing.length - 1]!;
  if (bar.time === last.time) return [...existing.slice(0, -1), bar];
  if (bar.time > last.time) return [...existing, bar].slice(-180);
  return existing;
}

export function connectTickerFeed(
  pairs: PairId[],
  onTick: (ticker: Ticker) => void,
  onStatus: (ok: boolean) => void,
  onOhlc?: (pair: PairId, kind: LiveOhlcKind, bars: Candle[]) => void,
): () => void {
  const symbols = pairs.map((id) => (getPair(id) ?? PAIR_BY_ID[id])?.wsSymbol).filter(Boolean);
  if (symbols.length === 0) return () => {};

  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let ping: number | null = null;

  const open = () => {
    if (closed) return;
    try {
      ws = new WebSocket("wss://ws.kraken.com/v2");
    } catch {
      onStatus(false);
      schedule();
      return;
    }

    ws.onopen = () => {
      retry = 0;
      onStatus(true);
      ws?.send(
        JSON.stringify({
          method: "subscribe",
          params: { channel: "ticker", symbol: symbols, snapshot: true },
        }),
      );
      ws?.send(
        JSON.stringify({
          method: "subscribe",
          params: { channel: "ohlc", symbol: symbols, interval: 1, snapshot: true },
        }),
      );
      ping = window.setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ method: "ping" }));
        }
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          channel?: string;
          type?: string;
          data?: unknown;
        };
        if (msg.channel === "ticker" && Array.isArray(msg.data)) {
          for (const row of msg.data as WsTicker[]) {
            const def = PAIR_BY_WS[row.symbol];
            if (!def) continue;
            const last = Number(row.last);
            const openPx = last - Number(row.change || 0);
            onTick({
              pair: def.id,
              last,
              bid: Number(row.bid),
              ask: Number(row.ask),
              open: openPx,
              high: Number(row.high),
              low: Number(row.low),
              volume: Number(row.volume),
              vwap: Number(row.vwap),
              changePct: Number(row.change_pct),
              ts: Date.now(),
            });
          }
          return;
        }
        if (msg.channel === "ohlc" && Array.isArray(msg.data) && onOhlc) {
          const kind: LiveOhlcKind = msg.type === "snapshot" ? "snapshot" : "update";
          const byPair = new Map<PairId, Candle[]>();
          for (const row of msg.data as WsOhlc[]) {
            const def = PAIR_BY_WS[row.symbol];
            const bar = asLiveCandle(row);
            if (!def || !bar) continue;
            const list = byPair.get(def.id) ?? [];
            list.push(bar);
            byPair.set(def.id, list);
          }
          for (const [pair, bars] of byPair) onOhlc(pair, kind, bars);
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => {
      onStatus(false);
    };

    ws.onclose = () => {
      if (ping) window.clearInterval(ping);
      ping = null;
      if (!closed) schedule();
    };
  };

  const schedule = () => {
    const wait = Math.min(12_000, 800 * 2 ** retry);
    retry += 1;
    window.setTimeout(open, wait);
  };

  open();

  return () => {
    closed = true;
    if (ping) window.clearInterval(ping);
    try {
      ws?.close();
    } catch {
      /* noop */
    }
  };
}
