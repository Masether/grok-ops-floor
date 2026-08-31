import { PAIR_BY_ID, PAIR_BY_WS } from "./kraken";
import type { PairId, Ticker } from "./types";

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

export function connectTickerFeed(
  pairs: PairId[],
  onTick: (ticker: Ticker) => void,
  onStatus: (ok: boolean) => void,
): () => void {
  const symbols = pairs.map((id) => PAIR_BY_ID[id]?.wsSymbol).filter(Boolean);
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
          data?: WsTicker[];
        };
        if (msg.channel !== "ticker" || !msg.data) return;
        for (const row of msg.data) {
          const def = PAIR_BY_WS[row.symbol];
          if (!def) continue;
          const last = Number(row.last);
          const open = last - Number(row.change || 0);
          onTick({
            pair: def.id,
            last,
            bid: Number(row.bid),
            ask: Number(row.ask),
            open,
            high: Number(row.high),
            low: Number(row.low),
            volume: Number(row.volume),
            vwap: Number(row.vwap),
            changePct: Number(row.change_pct),
            ts: Date.now(),
          });
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
