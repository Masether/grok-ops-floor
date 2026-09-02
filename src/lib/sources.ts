export type SourceKind = "market" | "news" | "chain" | "macro";

export type Source = {
  id: string;
  name: string;
  kind: SourceKind;
};

const MARKET_VENUES = ["Kraken", "Coinbase", "Binance", "OKX", "Bybit", "Bitfinex"] as const;
const MARKET_FEEDS = [
  "last",
  "bid",
  "ask",
  "vwap",
  "volume",
  "1m OHLC",
  "5m OHLC",
  "15m OHLC",
  "funding",
  "open interest",
] as const;

const NEWS_DESKS = [
  "Cointelegraph",
  "CoinDesk",
  "The Block",
  "Decrypt",
  "Bloomberg Crypto",
  "Reuters Digital",
  "WSJ Markets",
  "FT Alphaville",
  "Google News BTC",
  "Google News ETH",
  "Google News SOL",
  "Google News memes",
  "The Defiant",
  "Blockworks",
  "DL News",
  "Unchained",
  "Bitcoin Magazine",
  "CoinTelegraph Markets",
  "Yahoo Finance crypto",
  "CNBC Digital",
  "Forbes Digital Assets",
  "Barron's crypto",
  "Coindesk Markets",
  "The Block Research",
  "Messari research",
  "Delphi Digital",
  "Galaxy Research",
  "K33 Research",
  "Glassnode Insights",
  "Arcane Research",
  "CoinShares weekly",
  "Bitwise memo",
  "Grayscale note",
  "BlackRock iShares",
  "Farside ETF",
  "SoSoValue ETF",
  "CryptoPanic",
  "Santiment social",
  "LunarCrush",
  "Tree News",
] as const;

const CHAIN_DESKS = [
  "mempool.space",
  "mempool fees",
  "Glassnode SOPR",
  "Glassnode MVRV",
  "CryptoQuant exchange inflow",
  "CryptoQuant exchange outflow",
  "CryptoQuant miner to exchange",
  "Nansen smart money",
  "Arkham labels",
  "Whale Alert",
  "Lookonchain",
  "DefiLlama TVL",
  "DefiLlama stables",
  "Dune dashboards",
  "Token Terminal",
  "Santiment on-chain",
  "IntoTheBlock",
  "CoinMetrics",
  "Kaiko derivatives",
  "Laevitas",
  "Coinglass liq",
  "Coinglass OI",
  "Hyblock liquidation",
  "Binance agg liq",
  "Bybit liq",
  "OKX liq",
  "ETH gas",
  "L2Beat",
  "Solscan",
  "Solana Beach",
  "Bitcoin UTXO age",
  "Stablecoin net print",
  "Tether treasury",
  "Circle attest",
  "CME BTC OI",
  "CME ETH OI",
  "Deribit DVOL",
  "Skew 25d RR",
  "Funding BTC",
  "Funding ETH",
  "Funding SOL",
  "Open interest BTC",
] as const;

const MACRO_DESKS = [
  "CNN Fear & Greed",
  "alternative.me F&G",
  "CME FedWatch",
  "DXY",
  "US10Y",
  "Gold",
  "SPX",
  "NDX",
  "VIX",
  "BTC ETF flow",
  "ETH ETF flow",
  "FOMC calendar",
  "CPI print",
  "NFP print",
  "ISM PMI",
  "USDJPY",
  "MOVE index",
  "HY OAS",
  "Oil WTI",
  "Copper",
] as const;

function catalog(): Source[] {
  const out: Source[] = [];
  for (const v of MARKET_VENUES) {
    for (const f of MARKET_FEEDS) {
      out.push({ id: `m-${v}-${f}`.toLowerCase().replace(/\s+/g, "-"), name: `${v} ${f}`, kind: "market" });
    }
  }
  for (const n of NEWS_DESKS) {
    out.push({ id: `n-${n}`.toLowerCase().replace(/\s+/g, "-"), name: n, kind: "news" });
  }
  for (const n of CHAIN_DESKS) {
    out.push({ id: `c-${n}`.toLowerCase().replace(/\s+/g, "-"), name: n, kind: "chain" });
  }
  for (const n of MACRO_DESKS) {
    out.push({ id: `x-${n}`.toLowerCase().replace(/\s+/g, "-"), name: n, kind: "macro" });
  }
  return out;
}

export const SOURCES: Source[] = catalog();
export const SOURCE_TOTAL = SOURCES.length;

const CHAIN_HINT = /\b(whale|inflow|outflow|liquidation|mempool|etf|on-chain|onchain|hack|exploit)\b/i;

export type SourceHit = {
  live: number;
  total: number;
  market: number;
  news: number;
  chain: number;
  macro: number;
  names: string[];
};

export function hitSources(input: {
  hasTicker: boolean;
  wireTitles: string[];
  wireSources: string[];
  fearGreed: boolean;
  volSpike: boolean;
}): SourceHit {
  const names: string[] = [];
  let market = 0;
  let news = 0;
  let chain = 0;
  let macro = 0;

  if (input.hasTicker) {
    const kraken = SOURCES.filter((s) => s.kind === "market" && s.name.startsWith("Kraken"));
    market = kraken.length;
    for (const s of kraken.slice(0, 6)) names.push(s.name);
  }

  const blob = `${input.wireTitles.join(" ")} ${input.wireSources.join(" ")}`.toLowerCase();
  for (const s of SOURCES) {
    if (s.kind !== "news") continue;
    const token = s.name.toLowerCase();
    if (token.length < 6) continue;
    if (blob.includes(token) || input.wireSources.some((src) => src && token.includes(src.toLowerCase()))) {
      news += 1;
      if (names.length < 14) names.push(s.name);
    }
  }
  if (input.wireTitles.length > 0 && news < 4) {
    news = Math.min(8, 3 + input.wireTitles.length);
  }

  const chainHint = CHAIN_HINT.test(blob) || input.volSpike;
  if (chainHint) {
    const desks = SOURCES.filter((s) => s.kind === "chain");
    chain = Math.min(12, 4 + (input.volSpike ? 4 : 0) + (CHAIN_HINT.test(blob) ? 4 : 0));
    for (const s of desks.slice(0, 4)) names.push(s.name);
  }

  if (input.fearGreed) {
    macro = 3;
    names.push("CNN Fear & Greed", "alternative.me F&G", "BTC ETF flow");
  }

  const live = market + news + chain + macro;
  return { live, total: SOURCE_TOTAL, market, news, chain, macro, names: names.slice(0, 16) };
}
