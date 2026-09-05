import type { PairId, WireTone } from "./types.ts";

type Rule = {
  test: RegExp;
  orgs?: string[];
  pairs?: PairId[];
  lean?: WireTone;
};

export const WIRE_RULES: Rule[] = [
  { test: /\bmicrostrategy\b|\bmstr\b|strategy inc|saylor\b/i, orgs: ["MicroStrategy"], pairs: ["XBTUSD"], lean: "bull" },
  { test: /\bblackrock\b|\bibit\b|\bibit\b/i, orgs: ["BlackRock"], pairs: ["XBTUSD"], lean: "bull" },
  { test: /\bfidelity\b|\bfbtc\b/i, orgs: ["Fidelity"], pairs: ["XBTUSD"] },
  { test: /\bgrayscale\b|\bgbtc\b/i, orgs: ["Grayscale"], pairs: ["XBTUSD"] },
  { test: /\bbitcoin etf\b|\bspot etf\b|\betf (inflow|outflow|approved)/i, orgs: ["BTC ETF"], pairs: ["XBTUSD"] },
  { test: /\btesla\b|\bmusk\b|\belon\b/i, orgs: ["Tesla / Elon"], pairs: ["TSLAxUSD", "XBTUSD", "DOGEUSD"] },
  { test: /\bdoge\b|dogecoin/i, pairs: ["DOGEUSD"] },
  { test: /\bpepe\b/i, pairs: ["PEPEUSD"] },
  { test: /\bwif\b|dogwifhat/i, pairs: ["WIFUSD"] },
  { test: /\bbonk\b/i, pairs: ["BONKUSD"] },
  { test: /\bfloki\b/i, pairs: ["FLOKIUSD"] },
  { test: /\bpengu\b|pudgy/i, pairs: ["PENGUUSD"] },
  { test: /\bshiba\b|\bshib\b/i, pairs: ["SHIBUSD"] },
  { test: /\bmemecoin\b|\bmeme coin\b|\bpump\.fun\b/i, orgs: ["Meme tape"], pairs: ["PEPEUSD", "WIFUSD", "BONKUSD", "DOGEUSD"] },
  { test: /\bethereum\b|\beth\b|\bvitalik\b|consensys/i, orgs: ["Ethereum"], pairs: ["ETHUSD"] },
  { test: /\bsolana\b|\bsol\b|firedancer|jump crypto/i, orgs: ["Solana"], pairs: ["SOLUSD"] },
  { test: /\bripple\b|\bxrp\b/i, orgs: ["Ripple"], pairs: ["XRPUSD"] },
  { test: /\bcardano\b|\bada\b|\bhoskinson\b/i, pairs: ["ADAUSD"] },
  { test: /\bchainlink\b|\blink\b/i, pairs: ["LINKUSD"] },
  { test: /\bavalanche\b|\bavax\b/i, pairs: ["AVAXUSD"] },
  { test: /\bsui\b/i, pairs: ["SUIUSD"] },
  { test: /\bbittensor\b|\btao\b/i, pairs: ["TAOUSD"] },
  { test: /\bnear protocol\b|\bnear\b/i, pairs: ["NEARUSD"] },
  { test: /\bnvidia\b|\bnvda\b|\bjensen\b/i, orgs: ["NVIDIA"], pairs: ["NVDAxUSD", "TAOUSD"] },
  { test: /\bapple\b|\baapl\b/i, orgs: ["Apple"], pairs: ["AAPLxUSD"] },
  { test: /\bmicrosoft\b|\bmsft\b/i, orgs: ["Microsoft"], pairs: ["MSFTxUSD"] },
  { test: /\bpalantir\b|\bpltr\b/i, orgs: ["Palantir"], pairs: ["PLTRxUSD"] },
  { test: /\bspy\b|s&p 500|s&p500/i, orgs: ["S&P 500"], pairs: ["SPYxUSD"] },
  { test: /\bcoinbase\b|\bcoin\b/i, orgs: ["Coinbase"], pairs: ["XBTUSD", "ETHUSD"] },
  { test: /\bbinance\b|\bcz\b|changpeng/i, orgs: ["Binance"] },
  { test: /\btether\b|\busdt\b|circle\b|\busdc\b/i, orgs: ["Stablecoins"] },
  { test: /\bkraken\b/i, orgs: ["Kraken"] },
  { test: /\bsec\b|\bgensler\b|securities and exchange/i, orgs: ["SEC"], lean: "bear" },
  { test: /\bfed\b|\bpowell\b|\bfomc\b|\brate cut\b|\brate hike\b|\bcpi\b/i, orgs: ["Fed"], pairs: ["XBTUSD", "SPYxUSD"] },
  { test: /\bhack\b|\bexploit\b|\bdepeg\b|\bbanned\b|\blawsuit\b/i, lean: "bear" },
  { test: /\bcrypto twitter\b|\bon x\b|\bsite:x\.com\b/i, orgs: ["X / CT"] },
  { test: /\betf approved\b|\binflows\b|\bstrategic reserve\b|\btreasury buy\b/i, lean: "bull" },
];

const BULL = /\b(surge|rally|soar|ath|all-time high|inflow|adopt|approve|bullish|record high|beats|mooning|send it|based)\b/i;
const BEAR = /\b(crash|plunge|hack|exploit|lawsuit|ban|outflow|bearish|sec charges|collapse|depeg|dump|rugged|rekt|ngmi)\b/i;

export function tagHeadline(title: string): {
  pairs: PairId[];
  orgs: string[];
  tone: WireTone;
  note: string;
} {
  const pairs: PairId[] = [];
  const orgs: string[] = [];
  let lean: WireTone | undefined;
  for (const rule of WIRE_RULES) {
    if (!rule.test.test(title)) continue;
    for (const p of rule.pairs ?? []) if (!pairs.includes(p)) pairs.push(p);
    for (const o of rule.orgs ?? []) if (!orgs.includes(o)) orgs.push(o);
    if (rule.lean) lean = rule.lean;
  }
  let tone: WireTone = lean ?? "neutral";
  if (BULL.test(title)) tone = "bull";
  if (BEAR.test(title)) tone = "bear";
  const note = [
    orgs.slice(0, 2).join(" · "),
    pairs.length ? pairs.slice(0, 3).join(" ") : "broad tape",
  ]
    .filter(Boolean)
    .join(" · ");
  return { pairs, orgs, tone, note };
}
