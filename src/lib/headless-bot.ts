/**
 * ShellOut Bot headless runner — same $200 live desk, no window.
 * Needs a machine that stays on. Keys from env, never logged.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { budgetStake } from "./budget-size.ts";
import { macdHist, readScalp } from "./indicators.ts";
import { DEFAULT_PAIRS, getPair, isBtcUsd } from "./kraken.ts";
import { restBalance, restMarketOrder, restOhlc, restTickers } from "./kraken-rest.ts";
import { DEFAULT_BRAIN } from "./learn.ts";
import { btcOnBook, liveSleeve, MIN_LIVE_TICKET } from "./live-budget.ts";
import { usdOnBook } from "./specialists.ts";
import { macdLane, pickPlaybook, type PlaybookId } from "./playbook.ts";
import { SCALP, scalpManage, scalpStops } from "./scalp.ts";
import { liveEntry } from "./sharp.ts";
import type { PairId, Ticker } from "./types.ts";

const BUDGET = Number(process.env.SHELLOUT_BUDGET ?? 200) || 200;
const SCAN_MS = Number(process.env.SHELLOUT_SCAN_MS ?? 5000) || 5000;
const BOOK_FILE = resolve(process.cwd(), ".shellout-book.json");
const KEYS_FILE = resolve(process.cwd(), ".shellout-keys.json");
const WATCH: PairId[] = DEFAULT_PAIRS.filter((id) => !isBtcUsd(id)).slice(0, 8);

type Lot = {
  id: string;
  pair: PairId;
  qty: number;
  entry: number;
  mark: number;
  stop: number;
  take: number;
  openedAt: number;
  book: PlaybookId;
};

type Book = {
  lots: Lot[];
  fills: { ts: number; pair: PairId; side: string; qty: number; px: number; note: string }[];
  lastScanAt: number;
};

function loadKeys(): { apiKey: string; apiSecret: string } {
  const envKey = process.env.KRAKEN_API_KEY?.trim() ?? "";
  const envSec = process.env.KRAKEN_API_SECRET?.trim() ?? "";
  if (envKey.length > 8 && envSec.length > 8) return { apiKey: envKey, apiSecret: envSec };
  if (existsSync(KEYS_FILE)) {
    const raw = JSON.parse(readFileSync(KEYS_FILE, "utf8")) as { apiKey?: string; apiSecret?: string };
    if ((raw.apiKey ?? "").trim().length > 8 && (raw.apiSecret ?? "").trim().length > 8) {
      return { apiKey: raw.apiKey!.trim(), apiSecret: raw.apiSecret!.trim() };
    }
  }
  throw new Error(
    "No Kraken keys. Set KRAKEN_API_KEY + KRAKEN_API_SECRET, or write .shellout-keys.json { apiKey, apiSecret }. Query + Orders. Withdraw off.",
  );
}

function loadBook(): Book {
  if (!existsSync(BOOK_FILE)) return { lots: [], fills: [], lastScanAt: 0 };
  try {
    return JSON.parse(readFileSync(BOOK_FILE, "utf8")) as Book;
  } catch {
    return { lots: [], fills: [], lastScanAt: 0 };
  }
}

function saveBook(book: Book) {
  writeFileSync(BOOK_FILE, JSON.stringify({ ...book, fills: book.fills.slice(0, 80) }, null, 2));
}

function log(line: string) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${line}`);
}

function qtyFor(pair: PairId, usd: number, px: number): number {
  const def = getPair(pair);
  if (!def || !(px > 0)) return 0;
  let q = usd / px;
  q = Number(q.toFixed(Math.min(Math.max(def.decimals, 0), 8)));
  if (q < def.ordermin) return 0;
  return q;
}

async function manageLots(
  keys: { apiKey: string; apiSecret: string },
  book: Book,
  tickers: Map<PairId, Ticker>,
) {
  const next: Lot[] = [];
  for (const lot of book.lots) {
    const mark = tickers.get(lot.pair)?.last ?? lot.mark;
    lot.mark = mark;
    const m = scalpManage(
      { openedAt: lot.openedAt, entry: lot.entry, mark, stop: lot.stop, take: lot.take },
      Date.now(),
    );
    lot.stop = m.stop;
    if (m.action === "hold") {
      next.push(lot);
      continue;
    }
    try {
      const res = await restMarketOrder({
        ...keys,
        pair: lot.pair,
        side: "sell",
        volume: String(lot.qty),
      });
      const pnl = (mark - lot.entry) * lot.qty;
      book.fills.unshift({
        ts: Date.now(),
        pair: lot.pair,
        side: "sell",
        qty: lot.qty,
        px: mark,
        note: `${m.action} ${res.txid || res.descr} ${pnl.toFixed(2)}`,
      });
      log(`OUT ${getPair(lot.pair)?.label ?? lot.pair} ${m.action} pnl ${pnl.toFixed(2)}`);
    } catch (err) {
      log(`OUT fail ${lot.pair}: ${err instanceof Error ? err.message : "error"}`);
      next.push(lot);
    }
  }
  book.lots = next;
}

async function considerEntry(
  keys: { apiKey: string; apiSecret: string },
  book: Book,
  pair: PairId,
  ticker: Ticker | undefined,
  bal: Record<string, string>,
) {
  if (isBtcUsd(pair)) return;
  if (book.lots.some((l) => l.pair === pair)) return;
  if (book.lots.length >= 3) return;
  const candles = await restOhlc(pair, 1);
  if (candles.length < 30) return;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const read = readScalp(closes, volumes, DEFAULT_BRAIN);
  const price = ticker?.last ?? closes[closes.length - 1]!;
  const histPrev = closes.length > 28 ? macdHist(closes.slice(0, -1)) : read.macdHist;
  const lane = macdLane(read.macdHist, histPrev);
  const def = getPair(pair);
  const playbook =
    pickPlaybook({
      enabled: ["scalp", "grid", "dca"],
      sleeve: def?.sleeve ?? "heat",
      lane,
      kind: read.kind,
      rsi: read.rsi,
      changePct: ticker?.changePct ?? 0,
      hasPos: false,
      existingBook: undefined,
      dipFromEntry: 0,
      adds: 1,
      msSinceAdd: 1e12,
    }) ?? (lane !== "down" && read.kind !== "sell" ? "scalp" : null);
  if (!playbook) {
    log(`HOLD ${def?.label ?? pair} · ${read.reason}`);
    return;
  }
  const gate = liveEntry({
    grokKind: read.kind,
    readKind: read.kind,
    lane,
    playbook,
    conf: read.confidence,
    heat: def?.sleeve === "heat",
    changePct: ticker?.changePct ?? 0,
    recentPnl: book.fills.filter((f) => f.side === "sell").slice(0, 2).map((f) => Number(f.note.split(" ").pop()) || 0),
    sessionPnl: book.fills.reduce((a, f) => a + (Number(f.note.split(" ").pop()) || 0), 0),
    budget: BUDGET,
  });
  if (!gate.ok) {
    log(`HOLD ${def?.label ?? pair} · ${gate.why}`);
    return;
  }
  const sleeve = liveSleeve({
    liveBudget: BUDGET,
    liveBalance: bal,
    positions: book.lots.map((l) => ({
      id: l.id,
      pair: l.pair,
      qty: l.qty,
      entry: l.entry,
      mark: l.mark,
      stop: l.stop,
      take: l.take,
      side: "buy" as const,
      openedAt: l.openedAt,
      mode: "live" as const,
    })),
    tickers: Object.fromEntries(ticker ? [[pair, ticker]] : []),
  });
  const usd = Math.min(sleeve.cash, usdOnBook(bal));
  const stake = budgetStake({
    remaining: usd,
    confidence: read.confidence,
    pWin: 0.48,
    payoff: 1.1,
    heat: def?.sleeve === "heat",
  });
  if (stake < MIN_LIVE_TICKET) {
    log(`skip ${def?.label ?? pair} — cash ${usd.toFixed(0)}`);
    return;
  }
  const qty = qtyFor(pair, stake, price);
  if (!qty) return;
  try {
    const res = await restMarketOrder({
      ...keys,
      pair,
      side: "buy",
      volume: String(qty),
    });
    const stops = scalpStops(price, def?.sleeve === "heat");
    book.lots.push({
      id: res.txid || `lot-${Date.now()}`,
      pair,
      qty,
      entry: price,
      mark: price,
      stop: stops.stop,
      take: stops.take,
      openedAt: Date.now(),
      book: playbook,
    });
    book.fills.unshift({
      ts: Date.now(),
      pair,
      side: "buy",
      qty,
      px: price,
      note: `IN ${playbook} ${res.txid || res.descr}`,
    });
    log(`IN ${def?.label ?? pair} ${playbook} $${stake.toFixed(0)} · ${read.reason}`);
  } catch (err) {
    log(`IN fail ${pair}: ${err instanceof Error ? err.message : "error"}`);
  }
}

export async function runHeadlessBot() {
  const keys = loadKeys();
  log(`ShellOut Bot headless · budget $${BUDGET} · scan ${SCAN_MS}ms · lid can be shut if THIS process stays up`);
  const book = loadBook();

  const tick = async () => {
    try {
      const bal = await restBalance(keys.apiKey, keys.apiSecret);
      const usd = usdOnBook(bal);
      const btc = btcOnBook(bal);
      log(`treasury USD ${usd.toFixed(2)} · BTC ${btc.toFixed(5)} · lots ${book.lots.length}`);
      const tickers = await restTickers([...WATCH, "XBTUSD"]);
      const byPair = new Map(tickers.map((t) => [t.pair, t]));
      await manageLots(keys, book, byPair);
      for (const pair of WATCH) {
        await considerEntry(keys, book, pair, byPair.get(pair), bal);
      }
      book.lastScanAt = Date.now();
      saveBook(book);
    } catch (err) {
      log(`scan fail: ${err instanceof Error ? err.message : "error"}`);
    }
  };

  await tick();
  setInterval(() => void tick(), SCAN_MS);
}

const isMain = process.argv[1]?.endsWith("headless-bot.ts");
if (isMain) {
  void runHeadlessBot().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
