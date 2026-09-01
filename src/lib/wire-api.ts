import { createServerFn } from "@tanstack/react-start";
import { PAIR_BY_ID } from "./kraken.ts";
import { tagHeadline } from "./wire-map.ts";
import type { PairId, WireItem } from "./types.ts";

const UA = "GrokOpsFloor/1.0";

function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function parseRss(xml: string, fallbackSource: string): Omit<WireItem, "tone" | "pairs" | "orgs" | "note" | "kind" | "id">[] {
  const out: Omit<WireItem, "tone" | "pairs" | "orgs" | "note" | "kind" | "id">[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
  for (const block of blocks.slice(0, 18)) {
    const title = decode((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " "));
    if (!title) continue;
    const link = decode(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const date = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "";
    const srcMatch = title.match(/\s[-—–]\s([^—–-]{2,40})$/);
    const source = srcMatch?.[1]?.trim() || fallbackSource;
    const clean = srcMatch ? title.slice(0, title.length - srcMatch[0].length).trim() : title;
    out.push({
      title: clean.slice(0, 180),
      source,
      url: link.startsWith("http") ? link : "",
      ts: date ? Date.parse(date) || Date.now() : Date.now(),
    });
  }
  return out;
}

async function pull(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`wire ${res.status}`);
  return res.text();
}

function toItem(
  row: { title: string; source: string; url: string; ts: number },
  kind: WireItem["kind"],
  extra?: Partial<WireItem>,
): WireItem {
  const tag = tagHeadline(`${row.title} ${extra?.note ?? ""}`);
  return {
    id: `${kind}_${row.ts}_${row.title.slice(0, 24)}`,
    title: row.title,
    source: row.source,
    url: row.url,
    ts: row.ts,
    kind,
    tone: extra?.tone ?? tag.tone,
    pairs: extra?.pairs ?? tag.pairs,
    orgs: extra?.orgs ?? tag.orgs,
    note: extra?.note ?? tag.note,
  };
}

export const fetchWire = createServerFn({ method: "POST" }).handler(async () => {
  const items: WireItem[] = [];
  const queries = [
    "https://news.google.com/rss/search?q=Bitcoin+OR+Ethereum+OR+Solana+OR+MicroStrategy+OR+BlackRock+ETF&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=PEPE+OR+BONK+OR+WIF+OR+DOGE+OR+memecoin&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=NVIDIA+OR+Tesla+OR+Apple+OR+Palantir+crypto+OR+xStocks&hl=en-US&gl=US&ceid=US:en",
  ];

  const settled = await Promise.allSettled([
    ...queries.map((u) => pull(u)),
    pull("https://cointelegraph.com/rss"),
    fetch("https://api.alternative.me/fng/?limit=1", { headers: { Accept: "application/json" } }).then((r) => r.json()),
    fetch("https://api.coingecko.com/api/v3/search/trending", { headers: { Accept: "application/json" } }).then((r) =>
      r.json(),
    ),
  ]);

  const [g1, g2, g3, ct, fngRaw, trendRaw] = settled;

  for (const [res, src] of [
    [g1, "Google News"],
    [g2, "Google News"],
    [g3, "Google News"],
    [ct, "Cointelegraph"],
  ] as const) {
    if (res.status !== "fulfilled") continue;
    for (const row of parseRss(res.value, src)) items.push(toItem(row, "news"));
  }

  let fearGreed: { value: number; label: string } | null = null;
  if (fngRaw.status === "fulfilled") {
    const row = (fngRaw.value as { data?: { value: string; value_classification: string }[] })?.data?.[0];
    if (row) {
      fearGreed = { value: Number(row.value), label: row.value_classification };
      items.unshift(
        toItem(
          {
            title: `Fear & Greed ${row.value} · ${row.value_classification}`,
            source: "alternative.me",
            url: "https://alternative.me/crypto/fear-and-greed-index/",
            ts: Date.now(),
          },
          "macro",
          {
            tone: Number(row.value) >= 60 ? "bull" : Number(row.value) <= 35 ? "bear" : "neutral",
            note: "broad tape · risk appetite",
            pairs: ["XBTUSD", "ETHUSD", "SOLUSD"],
            orgs: ["Market"],
          },
        ),
      );
    }
  }

  if (trendRaw.status === "fulfilled") {
    const coins =
      (trendRaw.value as { coins?: { item?: { name: string; symbol: string; slug?: string } }[] })?.coins ?? [];
    for (const c of coins.slice(0, 7)) {
      const name = c.item?.name ?? "";
      const symbol = (c.item?.symbol ?? "").toUpperCase();
      if (!name) continue;
      const tagged = tagHeadline(`${name} ${symbol} trending`);
      const known = Object.values(PAIR_BY_ID).find(
        (p) => p.base.replace(/x$/i, "").toUpperCase() === symbol || p.id.startsWith(symbol),
      );
      const pairs: PairId[] = known ? [known.id] : tagged.pairs;
      items.push(
        toItem(
          {
            title: `Trending ${symbol} · ${name}`,
            source: "CoinGecko",
            url: `https://www.coingecko.com/en/coins/${c.item?.slug ?? ""}`,
            ts: Date.now(),
          },
          "trend",
          {
            tone: "bull",
            pairs,
            orgs: pairs.length ? tagged.orgs : ["Off-book heat"],
            note: pairs.length
              ? `on the desk · ${PAIR_BY_ID[pairs[0]!]?.label}`
              : `${symbol} is hot — not on this Kraken book yet`,
          },
        ),
      );
    }
  }

  const seen = new Set<string>();
  const unique = items.filter((it) => {
    const k = it.title.toLowerCase().slice(0, 80);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => b.ts - a.ts);

  return {
    items: unique.slice(0, 28),
    fearGreed,
    fetchedAt: Date.now(),
  };
});
