/** Kraken spot fees baked into tickets so a "green" fill is green after the venue cut. */

/** Kraken Pro Spot Tier 1 taker (USD pairs) as of 2025/2026 schedule. */
export const USD_TAKER = 0.008;
/** Same schedule for crypto/USD unless live fills override via learnTaker. */
export const XBT_TAKER = 0.008;
export const MIN_NET_PCT = 0.003;
/** Don't bank a "win" that's dust after Kraken + a slip cushion. */
export const MIN_NET_USD = 0.35;
/** Extra pad on top of round-trip taker so a wick doesn't look like a take. */
export const SLIP_PAD_PCT = 0.001;

export function takerPct(quote: string, learned = 0): number {
  if (learned > 0.0005 && learned < 0.05) return learned;
  return quote === "XBT" || quote === "BTC" ? XBT_TAKER : USD_TAKER;
}

export function roundTripPct(taker: number): number {
  return taker * 2;
}

export function feeOn(notional: number, taker: number): number {
  if (!(notional > 0) || !(taker > 0)) return 0;
  return notional * taker;
}

/** Live fills override schedule defaults via learnTaker → blendTaker. */
export function learnTaker(notional: number, fee: number): number {
  if (!(notional > 0) || !(fee > 0)) return 0;
  return fee / notional;
}

export function blendTaker(prev: number, sample: number): number {
  if (!(sample > 0)) return prev;
  if (!(prev > 0)) return sample;
  return prev * 0.6 + sample * 0.4;
}

export function minTakePct(taker: number): number {
  return roundTripPct(taker) + MIN_NET_PCT + SLIP_PAD_PCT;
}

/** True when the expected move clears round-trip fees + net pad. */
export function edgeClearsFees(expectedMovePct: number, taker: number): boolean {
  return expectedMovePct + 1e-12 >= minTakePct(taker);
}

export function netUsdAfterFees(input: {
  entry: number;
  mark: number;
  qty: number;
  taker: number;
}): number {
  if (!(input.qty > 0) || !(input.entry > 0)) return 0;
  return netPnl({
    entry: input.entry,
    exit: input.mark,
    qty: input.qty,
    taker: input.taker,
  });
}

export function coversFees(input: {
  entry: number;
  mark: number;
  qty?: number;
  taker: number;
}): boolean {
  const pnlPct = input.entry > 0 ? (input.mark - input.entry) / input.entry : 0;
  if (pnlPct + 1e-9 < minTakePct(input.taker)) return false;
  if (!(input.qty && input.qty > 0)) return true;
  return netUsdAfterFees({
    entry: input.entry,
    mark: input.mark,
    qty: input.qty,
    taker: input.taker,
  }) >= MIN_NET_USD;
}

/** Gross move minus entry fee minus exit fee. */
export function netPnl(input: {
  entry: number;
  exit: number;
  qty: number;
  taker: number;
  entryFee?: number;
  exitFee?: number;
}): number {
  const notionIn = input.entry * input.qty;
  const notionOut = input.exit * input.qty;
  const gross = (input.exit - input.entry) * input.qty;
  const inFee = input.entryFee ?? feeOn(notionIn, input.taker);
  const outFee = input.exitFee ?? feeOn(notionOut, input.taker);
  return gross - inFee - outFee;
}

export function feeAwareStops(
  entry: number,
  heat: boolean,
  taker: number,
): { stop: number; take: number; takePct: number } {
  const stopPct = heat ? 0.007 : 0.0035;
  const takePct = Math.max(heat ? 0.05 : 0.022, minTakePct(taker));
  return {
    stop: entry * (1 - stopPct),
    take: entry * (1 + takePct),
    takePct,
  };
}
