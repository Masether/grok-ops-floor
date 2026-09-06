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

/** Prefer a real entry; fall back to costUsd/qty so closes never treat sale size as profit. */
export function resolveLotEntry(input: {
  entry?: number;
  qty?: number;
  costUsd?: number;
}): number {
  if (typeof input.entry === "number" && input.entry > 0) return input.entry;
  const qty = input.qty;
  const cost = input.costUsd;
  if (typeof qty === "number" && qty > 0 && typeof cost === "number" && cost > 0) {
    return cost / qty;
  }
  return 0;
}

/** Gross move minus entry fee minus exit fee. Bad/zero entry → 0 (never book sale notional as PnL). */
export function netPnl(input: {
  entry: number;
  exit: number;
  qty: number;
  taker: number;
  entryFee?: number;
  exitFee?: number;
}): number {
  if (!(input.entry > 0) || !(input.exit > 0) || !(input.qty > 0)) return 0;
  if (!(input.taker >= 0) || !Number.isFinite(input.taker)) return 0;
  const notionIn = input.entry * input.qty;
  const notionOut = input.exit * input.qty;
  const gross = (input.exit - input.entry) * input.qty;
  const inFee = input.entryFee ?? feeOn(notionIn, input.taker);
  const outFee = input.exitFee ?? feeOn(notionOut, input.taker);
  const net = gross - inFee - outFee;
  return Number.isFinite(net) ? net : 0;
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


/** Rebuild close PnL from a known entry + Kraken fill facts. */
export function reconcileClosePnl(input: {
  entry: number;
  exit: number;
  qty: number;
  taker: number;
  entryFee?: number;
  exitFee?: number;
}): number {
  return netPnl({
    entry: input.entry,
    exit: input.exit,
    qty: input.qty,
    taker: input.taker,
    entryFee: input.entryFee,
    exitFee: input.exitFee,
  });
}
