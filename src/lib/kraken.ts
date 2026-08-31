import type { BookSleeve, PairId } from "./types";

export type PairDef = {
  id: PairId;
  kraken: string;
  wsSymbol: string;
  resultKeys: string[];
  base: string;
  quote: string;
  label: string;
  decimals: number;
  ordermin: number;
  sleeve: BookSleeve;
};

function p(
  id: PairId,
  opts: Omit<PairDef, "id" | "quote"> & { quote?: string },
): PairDef {
  return { quote: "USD", ...opts, id };
}

export const PAIRS: PairDef[] = [
  p("XBTUSD", {
    kraken: "XBTUSD",
    wsSymbol: "BTC/USD",
    resultKeys: ["XXBTZUSD", "XBTUSD", "XBTZUSD"],
    base: "BTC",
    label: "BTC/USD",
    decimals: 8,
    ordermin: 0.0001,
    sleeve: "core",
  }),
  p("ETHUSD", {
    kraken: "ETHUSD",
    wsSymbol: "ETH/USD",
    resultKeys: ["XETHZUSD", "ETHUSD", "ETHZUSD"],
    base: "ETH",
    label: "ETH/USD",
    decimals: 8,
    ordermin: 0.002,
    sleeve: "core",
  }),
  p("SOLUSD", {
    kraken: "SOLUSD",
    wsSymbol: "SOL/USD",
    resultKeys: ["SOLUSD"],
    base: "SOL",
    label: "SOL/USD",
    decimals: 6,
    ordermin: 0.1,
    sleeve: "core",
  }),
  p("XRPUSD", {
    kraken: "XRPUSD",
    wsSymbol: "XRP/USD",
    resultKeys: ["XXRPZUSD", "XRPUSD"],
    base: "XRP",
    label: "XRP/USD",
    decimals: 2,
    ordermin: 10,
    sleeve: "core",
  }),
  p("ADAUSD", {
    kraken: "ADAUSD",
    wsSymbol: "ADA/USD",
    resultKeys: ["ADAUSD"],
    base: "ADA",
    label: "ADA/USD",
    decimals: 2,
    ordermin: 15,
    sleeve: "core",
  }),
  p("LINKUSD", {
    kraken: "LINKUSD",
    wsSymbol: "LINK/USD",
    resultKeys: ["LINKUSD"],
    base: "LINK",
    label: "LINK/USD",
    decimals: 4,
    ordermin: 0.5,
    sleeve: "core",
  }),
  p("AVAXUSD", {
    kraken: "AVAXUSD",
    wsSymbol: "AVAX/USD",
    resultKeys: ["AVAXUSD"],
    base: "AVAX",
    label: "AVAX/USD",
    decimals: 4,
    ordermin: 0.5,
    sleeve: "core",
  }),
  p("SUIUSD", {
    kraken: "SUIUSD",
    wsSymbol: "SUI/USD",
    resultKeys: ["SUIUSD"],
    base: "SUI",
    label: "SUI/USD",
    decimals: 4,
    ordermin: 5,
    sleeve: "core",
  }),
  p("TAOUSD", {
    kraken: "TAOUSD",
    wsSymbol: "TAO/USD",
    resultKeys: ["TAOUSD"],
    base: "TAO",
    label: "TAO/USD",
    decimals: 4,
    ordermin: 0.025,
    sleeve: "core",
  }),
  p("NEARUSD", {
    kraken: "NEARUSD",
    wsSymbol: "NEAR/USD",
    resultKeys: ["NEARUSD"],
    base: "NEAR",
    label: "NEAR/USD",
    decimals: 4,
    ordermin: 4,
    sleeve: "core",
  }),
  p("DOGEUSD", {
    kraken: "XDGUSD",
    wsSymbol: "DOGE/USD",
    resultKeys: ["XDGUSD", "XXDGZUSD", "DOGEUSD"],
    base: "DOGE",
    label: "DOGE/USD",
    decimals: 1,
    ordermin: 50,
    sleeve: "heat",
  }),
  p("SHIBUSD", {
    kraken: "SHIBUSD",
    wsSymbol: "SHIB/USD",
    resultKeys: ["SHIBUSD"],
    base: "SHIB",
    label: "SHIB/USD",
    decimals: 0,
    ordermin: 770_000,
    sleeve: "heat",
  }),
  p("PEPEUSD", {
    kraken: "PEPEUSD",
    wsSymbol: "PEPE/USD",
    resultKeys: ["PEPEUSD"],
    base: "PEPE",
    label: "PEPE/USD",
    decimals: 0,
    ordermin: 1_500_000,
    sleeve: "heat",
  }),
  p("WIFUSD", {
    kraken: "WIFUSD",
    wsSymbol: "WIF/USD",
    resultKeys: ["WIFUSD"],
    base: "WIF",
    label: "WIF/USD",
    decimals: 4,
    ordermin: 35,
    sleeve: "heat",
  }),
  p("BONKUSD", {
    kraken: "BONKUSD",
    wsSymbol: "BONK/USD",
    resultKeys: ["BONKUSD"],
    base: "BONK",
    label: "BONK/USD",
    decimals: 0,
    ordermin: 1_200_000,
    sleeve: "heat",
  }),
  p("FLOKIUSD", {
    kraken: "FLOKIUSD",
    wsSymbol: "FLOKI/USD",
    resultKeys: ["FLOKIUSD"],
    base: "FLOKI",
    label: "FLOKI/USD",
    decimals: 0,
    ordermin: 230_000,
    sleeve: "heat",
  }),
  p("PENGUUSD", {
    kraken: "PENGUUSD",
    wsSymbol: "PENGU/USD",
    resultKeys: ["PENGUUSD"],
    base: "PENGU",
    label: "PENGU/USD",
    decimals: 2,
    ordermin: 700,
    sleeve: "heat",
  }),
  p("NVDAxUSD", {
    kraken: "NVDAxUSD",
    wsSymbol: "NVDAx/USD",
    resultKeys: ["NVDAxUSD", "NVDASPVUSD"],
    base: "NVDAx",
    label: "NVDA/USD",
    decimals: 6,
    ordermin: 0.01,
    sleeve: "stock",
  }),
  p("TSLAxUSD", {
    kraken: "TSLAxUSD",
    wsSymbol: "TSLAx/USD",
    resultKeys: ["TSLAxUSD", "TSLASPVUSD"],
    base: "TSLAx",
    label: "TSLA/USD",
    decimals: 6,
    ordermin: 0.01,
    sleeve: "stock",
  }),
  p("AAPLxUSD", {
    kraken: "AAPLxUSD",
    wsSymbol: "AAPLx/USD",
    resultKeys: ["AAPLxUSD", "AAPLSPVUSD"],
    base: "AAPLx",
    label: "AAPL/USD",
    decimals: 6,
    ordermin: 0.01,
    sleeve: "stock",
  }),
  p("MSFTxUSD", {
    kraken: "MSFTxUSD",
    wsSymbol: "MSFTx/USD",
    resultKeys: ["MSFTxUSD", "MSFTSPVUSD"],
    base: "MSFTx",
    label: "MSFT/USD",
    decimals: 6,
    ordermin: 0.01,
    sleeve: "stock",
  }),
  p("PLTRxUSD", {
    kraken: "PLTRxUSD",
    wsSymbol: "PLTRx/USD",
    resultKeys: ["PLTRxUSD", "PLTRSPVUSD"],
    base: "PLTRx",
    label: "PLTR/USD",
    decimals: 6,
    ordermin: 0.01,
    sleeve: "stock",
  }),
  p("SPYxUSD", {
    kraken: "SPYxUSD",
    wsSymbol: "SPYx/USD",
    resultKeys: ["SPYxUSD", "SPYSPVUSD"],
    base: "SPYx",
    label: "SPY/USD",
    decimals: 6,
    ordermin: 0.01,
    sleeve: "stock",
  }),
];

export const PAIR_BY_ID: Record<PairId, PairDef> = Object.fromEntries(
  PAIRS.map((a) => [a.id, a]),
) as Record<PairId, PairDef>;

export const PAIR_BY_WS: Record<string, PairDef> = Object.fromEntries(
  PAIRS.map((a) => [a.wsSymbol, a]),
);

export const DEFAULT_PAIRS: PairId[] = [
  "XBTUSD",
  "ETHUSD",
  "SOLUSD",
  "PEPEUSD",
  "WIFUSD",
  "NVDAxUSD",
];

export const SLEEVE_META: Record<BookSleeve, { label: string; blurb: string }> = {
  core: { label: "Core", blurb: "BTC, ETH, SOL and names that can compound" },
  heat: { label: "Heat", blurb: "Rising memes — small size, ride the tape, never marry" },
  stock: { label: "xStocks", blurb: "Tokenized NVDA, TSLA, AAPL, SPY on Kraken (not US)" },
};

export const SEED_PRICE: Record<PairId, number> = {
  XBTUSD: 78_000,
  ETHUSD: 2_450,
  SOLUSD: 103,
  XRPUSD: 1.36,
  ADAUSD: 0.82,
  DOGEUSD: 0.16,
  LINKUSD: 22.46,
  AVAXUSD: 36.2,
  SUIUSD: 2.4,
  TAOUSD: 310,
  NEARUSD: 2.5,
  SHIBUSD: 0.000012,
  PEPEUSD: 0.0000072,
  WIFUSD: 0.42,
  BONKUSD: 0.000019,
  FLOKIUSD: 0.000055,
  PENGUUSD: 0.018,
  NVDAxUSD: 178,
  TSLAxUSD: 340,
  AAPLxUSD: 228,
  MSFTxUSD: 415,
  PLTRxUSD: 162,
  SPYxUSD: 638,
};

export function findPairResult<T>(
  result: Record<string, T>,
  pair: PairDef,
): T | undefined {
  for (const key of pair.resultKeys) {
    if (result[key] !== undefined) return result[key];
  }
  const keys = Object.keys(result).filter((k) => k !== "last");
  if (keys.length === 1) return result[keys[0]!];
  return undefined;
}

export const USD_BALANCE_KEYS = ["ZUSD", "USD", "USDT", "USDC", "ZUSDT"];
