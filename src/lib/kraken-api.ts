import { createServerFn } from "@tanstack/react-start";
import { findPairResult, getPair, PAIR_BY_ID, PAIRS, type PairDef } from "./kraken.ts";
import { cleanKrakenSecret, mapKrakenAuthError, signKraken } from "./kraken-sign.ts";
import type { Candle, PairId, Ticker } from "./types.ts";

const KRAKEN = "https://api.kraken.com";

type KrakenEnvelope<T> = { error: string[]; result?: T };

let lastNonce = 0n;

/** Always-increasing nonce. Wall clock + counter so concurrent serverless isolates rarely collide. */
function nextNonce(): string {
  const base = BigInt(Date.now()) * 1000n;
  lastNonce = base > lastNonce ? base : lastNonce + 1n;
  return lastNonce.toString();
}

async function sign(path: string, nonce: string, body: string, secret: string): Promise<string> {
  return signKraken(path, nonce, body, secret);
}

async function publicGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(KRAKEN + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const json = (await res.json()) as KrakenEnvelope<T>;
  if (json.error?.length) throw new Error(json.error.join("; "));
  if (!json.result) throw new Error("Kraken empty result");
  return json.result;
}

async function privatePost<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string,
): Promise<T> {
  const nonce = nextNonce();
  const key = cleanKrakenSecret(apiKey);
  const secret = cleanKrakenSecret(apiSecret);
  const body = new URLSearchParams({ nonce, ...params }).toString();
  const res = await fetch(KRAKEN + path, {
    method: "POST",
    headers: {
      "API-Key": key,
      "API-Sign": await sign(path, nonce, body, secret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) throw new Error(mapKrakenAuthError(`Kraken ${res.status}`));
  const json = (await res.json()) as KrakenEnvelope<T>;
  if (json.error?.length) throw new Error(mapKrakenAuthError(json.error.join("; ")));
  if (!json.result) throw new Error("Kraken empty result");
  return json.result;
}

type RawTicker = {
  a: string[];
  b: string[];
  c: string[];
  v: string[];
  p: string[];
  t: number[];
  l: string[];
  h: string[];
  o: string;
};

function toTicker(pair: PairDef, raw: RawTicker): Ticker {
  const last = Number(raw.c[0]);
  const open = Number(raw.o);
  return {
    pair: pair.id,
    last,
    bid: Number(raw.b[0]),
    ask: Number(raw.a[0]),
    open,
    high: Number(raw.h[1] ?? raw.h[0]),
    low: Number(raw.l[1] ?? raw.l[0]),
    volume: Number(raw.v[1] ?? raw.v[0]),
    vwap: Number(raw.p[1] ?? raw.p[0]),
    changePct: open ? ((last - open) / open) * 100 : 0,
    ts: Date.now(),
  };
}

export const fetchTickers = createServerFn({ method: "POST" })
  .validator((input: { pairs: PairId[] }) => input)
  .handler(async ({ data }) => {
    const defs = data.pairs
      .map((id) => PAIR_BY_ID[id])
      .filter((d): d is PairDef => Boolean(d));
    if (defs.length === 0) return [] as Ticker[];
    const groups = [
      defs.filter((d) => d.sleeve !== "stock"),
      defs.filter((d) => d.sleeve === "stock"),
    ].filter((g) => g.length > 0);
    const out: Ticker[] = [];
    for (const group of groups) {
      try {
        const result = await publicGet<Record<string, RawTicker>>("/0/public/Ticker", {
          pair: group.map((d) => d.kraken).join(","),
        });
        for (const def of group) {
          const raw = findPairResult(result, def);
          if (raw) out.push(toTicker(def, raw));
        }
      } catch {
        for (const def of group) {
          try {
            const result = await publicGet<Record<string, RawTicker>>("/0/public/Ticker", {
              pair: def.kraken,
            });
            const raw = findPairResult(result, def);
            if (raw) out.push(toTicker(def, raw));
          } catch {
            /* pair not listed in this region */
          }
        }
      }
    }
    return out;
  });

export const fetchOhlc = createServerFn({ method: "POST" })
  .validator((input: { pair: PairId; interval?: number; since?: number }) => input)
  .handler(async ({ data }) => {
    const def = getPair(data.pair);
    if (!def) return [] as Candle[];
    const params: Record<string, string> = {
      pair: def.kraken,
      interval: String(data.interval ?? 5),
    };
    if (data.since) params.since = String(Math.floor(data.since / 1000));
    const result = await publicGet<Record<string, unknown>>("/0/public/OHLC", params);
    const rows = findPairResult(result, def);
    if (!Array.isArray(rows)) return [] as Candle[];
    const candles: Candle[] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 7) continue;
      candles.push({
        time: Number(row[0]) * 1000,
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[6]),
      });
    }
    return candles;
  });

export const fetchBalance = createServerFn({ method: "POST" })
  .validator((input: { apiKey: string; apiSecret: string }) => input)
  .handler(async ({ data }) => {
    const result = await privatePost<Record<string, string>>(
      "/0/private/Balance",
      {},
      data.apiKey.trim(),
      data.apiSecret.trim(),
    );
    return result;
  });

export const placeMarketOrder = createServerFn({ method: "POST" })
  .validator(
    (input: {
      apiKey: string;
      apiSecret: string;
      pair: PairId;
      side: "buy" | "sell";
      volume: string;
      kraken?: string;
      oflags?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const def = getPair(data.pair);
    const pair = (data.kraken || def?.kraken || "").trim();
    if (!pair) throw new Error("Unknown pair");
    const oflags = data.oflags ?? (data.side === "sell" ? "fciq" : undefined);
    const body: Record<string, string> = {
      pair,
      type: data.side,
      ordertype: "market",
      volume: data.volume,
    };
    if (oflags) body.oflags = oflags;
    const result = await privatePost<{ txid?: string[]; descr?: { order?: string } }>(
      "/0/private/AddOrder",
      body,
      data.apiKey.trim(),
      data.apiSecret.trim(),
    );
    return {
      txid: result.txid?.[0] ?? "",
      descr: result.descr?.order ?? "",
    };
  });

export const fetchOrderFill = createServerFn({ method: "POST" })
  .validator((input: { apiKey: string; apiSecret: string; txid: string }) => input)
  .handler(async ({ data }) => {
    const result = await privatePost<
      Record<string, { fee?: string; cost?: string; vol_exec?: string; price?: string }>
    >(
      "/0/private/QueryOrders",
      { txid: data.txid, trades: "true" },
      data.apiKey.trim(),
      data.apiSecret.trim(),
    );
    const row = result[data.txid] ?? Object.values(result)[0];
    return {
      fee: Number(row?.fee ?? 0),
      cost: Number(row?.cost ?? 0),
      vol: Number(row?.vol_exec ?? 0),
      price: Number(row?.price ?? 0),
    };
  });

export const cancelAllOrders = createServerFn({ method: "POST" })
  .validator((input: { apiKey: string; apiSecret: string }) => input)
  .handler(async ({ data }) => {
    const result = await privatePost<{ count?: number }>(
      "/0/private/CancelAll",
      {},
      data.apiKey.trim(),
      data.apiSecret.trim(),
    );
    return { count: result.count ?? 0 };
  });

export const fetchOpenOrders = createServerFn({ method: "POST" })
  .validator((input: { apiKey: string; apiSecret: string }) => input)
  .handler(async ({ data }) => {
    const result = await privatePost<{ open?: Record<string, { descr?: { order?: string } }> }>(
      "/0/private/OpenOrders",
      {},
      data.apiKey.trim(),
      data.apiSecret.trim(),
    );
    const open = result.open ?? {};
    return { ids: Object.keys(open), count: Object.keys(open).length };
  });

export const fetchUsdUniverse = createServerFn({ method: "POST" }).handler(async () => {
  const tickers = await publicGet<Record<string, RawTicker>>("/0/public/Ticker", {});
  const hits: {
    pair: string;
    kraken: string;
    last: number;
    liquidity: number;
    changePct: number;
  }[] = [];
  const defs: PairDef[] = [];
  const known = PAIRS;
  for (const [key, raw] of Object.entries(tickers)) {
    if (!/USD$|ZUSD$/.test(key)) continue;
    const last = Number(raw.c?.[0]);
    const open = Number(raw.o);
    const vol = Number(raw.v?.[1] ?? raw.v?.[0]);
    if (!(last > 0) || !(vol > 0)) continue;
    const def = known.find((d) => d.resultKeys.includes(key) || d.kraken === key);
    const pair = def?.id ?? key.replace(/^X/, "").replace("ZUSD", "USD");
    hits.push({
      pair,
      kraken: def?.kraken ?? key,
      last,
      liquidity: last * vol,
      changePct: open ? ((last - open) / open) * 100 : 0,
    });
    if (def) continue;
    const base = String(pair).replace(/USD$/i, "") || pair;
    defs.push({
      id: pair as PairId,
      kraken: key,
      wsSymbol: `${base}/USD`,
      resultKeys: [key, String(pair)],
      base,
      quote: "USD",
      label: `${base}/USD`,
      decimals: 8,
      ordermin: 0.0001,
      sleeve: "heat",
    });
  }
  return { hits, defs };
});

export const pairUniverse = PAIRS.map((p) => p.id);
