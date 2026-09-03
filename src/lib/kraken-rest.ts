/** Node-safe Kraken REST. No browser, no TanStack server fn. */

import { createHash, createHmac } from "node:crypto";
import { findPairResult, getPair, PAIR_BY_ID, type PairDef } from "./kraken.ts";
import type { Candle, PairId, Ticker } from "./types.ts";

const KRAKEN = "https://api.kraken.com";

type Envelope<T> = { error: string[]; result?: T };

let lastNonce = 0;

function nextNonce(): string {
  const n = Date.now() * 1000;
  lastNonce = n <= lastNonce ? lastNonce + 1 : n;
  return String(lastNonce);
}

async function sign(path: string, nonce: string, body: string, secret: string): Promise<string> {
  const sha256 = createHash("sha256").update(nonce + body).digest();
  const hmac = createHmac("sha512", Buffer.from(secret, "base64"));
  hmac.update(path);
  hmac.update(sha256);
  return hmac.digest("base64");
}

async function publicGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(KRAKEN + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const json = (await res.json()) as Envelope<T>;
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
  const body = new URLSearchParams({ nonce, ...params }).toString();
  const res = await fetch(KRAKEN + path, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": await sign(path, nonce, body, apiSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const json = (await res.json()) as Envelope<T>;
  if (json.error?.length) throw new Error(json.error.join("; "));
  if (!json.result) throw new Error("Kraken empty result");
  return json.result;
}

type RawTicker = {
  a: string[];
  b: string[];
  c: string[];
  v: string[];
  p: string[];
  h: string[];
  l: string[];
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

export async function restTickers(pairs: PairId[]): Promise<Ticker[]> {
  const defs = pairs.map((id) => getPair(id) ?? PAIR_BY_ID[id]).filter((d): d is PairDef => Boolean(d));
  if (!defs.length) return [];
  const result = await publicGet<Record<string, RawTicker>>("/0/public/Ticker", {
    pair: defs.map((d) => d.kraken).join(","),
  });
  const out: Ticker[] = [];
  for (const def of defs) {
    const raw = findPairResult(result, def);
    if (raw) out.push(toTicker(def, raw));
  }
  return out;
}

export async function restOhlc(pair: PairId, interval = 1): Promise<Candle[]> {
  const def = getPair(pair);
  if (!def) return [];
  const result = await publicGet<Record<string, unknown>>("/0/public/OHLC", {
    pair: def.kraken,
    interval: String(interval),
  });
  const rows = findPairResult(result, def);
  if (!Array.isArray(rows)) return [];
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
}

export async function restBalance(apiKey: string, apiSecret: string): Promise<Record<string, string>> {
  return privatePost("/0/private/Balance", {}, apiKey.trim(), apiSecret.trim());
}

export async function restMarketOrder(input: {
  apiKey: string;
  apiSecret: string;
  pair: PairId;
  side: "buy" | "sell";
  volume: string;
}): Promise<{ txid: string; descr: string }> {
  const def = getPair(input.pair);
  if (!def) throw new Error("Unknown pair");
  const result = await privatePost<{ txid?: string[]; descr?: { order?: string } }>(
    "/0/private/AddOrder",
    {
      pair: def.kraken,
      type: input.side,
      ordertype: "market",
      volume: input.volume,
    },
    input.apiKey.trim(),
    input.apiSecret.trim(),
  );
  return { txid: result.txid?.[0] ?? "", descr: result.descr?.order ?? "" };
}
