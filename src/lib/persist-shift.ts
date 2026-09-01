import type { EquityPoint, TradeSignal } from "./types.ts";

export const EQUITY_PERSIST_CAP = 90;
export const SIGNAL_PERSIST_CAP = 12;

export type ShiftBook = {
  cash: number;
  positions: Array<{ pair: string; qty: number; mark: number }>;
  tickers?: { [pair: string]: { last?: number } | undefined };
};

export type ShiftPersistInput = Partial<ShiftBook> & {
  dayStartEquity?: number;
  shiftStartedAt?: number;
  equityHistory?: EquityPoint[];
  signals?: TradeSignal[];
  liveArmed?: boolean;
};

export type ShiftHydrateCurrent = {
  cash: number;
  positions: Array<{ pair: string; qty: number; mark: number }>;
  dayStartEquity: number;
  shiftStartedAt: number;
  equityHistory: EquityPoint[];
  signals: TradeSignal[];
};

export type HydratedShift = {
  dayStartEquity: number;
  shiftStartedAt: number;
  equityHistory: EquityPoint[];
  signals: TradeSignal[];
  liveArmed: false;
};

export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function markedEquityFromBook(book: ShiftBook): number {
  let posValue = 0;
  for (const p of book.positions) {
    const mark = book.tickers?.[p.pair]?.last ?? p.mark;
    posValue += mark * p.qty;
  }
  return book.cash + posValue;
}

export function sliceShiftForPersist(s: {
  equityHistory: EquityPoint[];
  signals: TradeSignal[];
}): { equityHistory: EquityPoint[]; signals: TradeSignal[]; liveArmed: false } {
  return {
    equityHistory: s.equityHistory.slice(-EQUITY_PERSIST_CAP),
    signals: s.signals.slice(-SIGNAL_PERSIST_CAP),
    liveArmed: false,
  };
}

/** Rehydrate persisted shift fields. Always leaves liveArmed false. Rolls day PnL at UTC midnight. */
export function hydratePersistedShift(
  persisted: ShiftPersistInput | null | undefined,
  current: ShiftHydrateCurrent,
  now = Date.now(),
): HydratedShift {
  const p = persisted ?? {};
  const cash = p.cash ?? current.cash;
  const positions = p.positions ?? current.positions;
  const tickers = p.tickers;
  const sliced = sliceShiftForPersist({
    equityHistory: p.equityHistory ?? current.equityHistory,
    signals: p.signals ?? current.signals,
  });
  let dayStartEquity = p.dayStartEquity ?? current.dayStartEquity;
  let shiftStartedAt = p.shiftStartedAt ?? current.shiftStartedAt;

  if (utcDay(shiftStartedAt) < utcDay(now)) {
    dayStartEquity = markedEquityFromBook({ cash, positions, tickers });
    shiftStartedAt = now;
  }

  return {
    dayStartEquity,
    shiftStartedAt,
    equityHistory: sliced.equityHistory,
    signals: sliced.signals,
    liveArmed: false,
  };
}
