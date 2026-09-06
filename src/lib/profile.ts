import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { PairId, Order, Position, TapeEvent, EquityPoint } from "./types.ts";
import { useFloor, type FloorState, type TransferRow } from "./store.ts";
import { mergeRemotePnlFields, shouldApplyRemoteBook } from "./book-sync.ts";
import { lotsMark } from "./live-pnl.ts";
import { sessionProfit } from "./desk-pnl.ts";
import { krakenKeysOn } from "./live-budget.ts";

const riskSchema = z
  .object({
    sizePct: z.number(),
    stopPct: z.number(),
    takePct: z.number(),
    maxDailyLossPct: z.number(),
    maxPositions: z.number(),
  })
  .nullable();

const profileSchema = z.object({
  fundingCash: z.number().finite().min(0).max(50_000_000),
  pairs: z.array(z.string()).max(24),
  risk: riskSchema,
  bookJson: z.string().max(500_000).nullable().optional(),
});

export type ProfileBook = {
  launched: boolean;
  cash: number;
  startingCash: number;
  fundingCash: number;
  vault?: FloorState["vault"];
  autoSweep?: boolean;
  sweptTotal?: number;
  realized: number;
  lifetimePnl?: number;
  dayStartEquity: number;
  lastEngineAt: number;
  shiftStartedAt: number;
  pairs: PairId[];
  risk: {
    sizePct: number;
    stopPct: number;
    takePct: number;
    maxDailyLossPct: number;
    maxPositions: number;
  } | null;
  positions: Position[];
  orders: Order[];
  events: TapeEvent[];
  transfers: TransferRow[];
  equityHistory: EquityPoint[];
  brain?: FloorState["brain"];
  liveBudget?: number;
  /** Closed+open at last armed persist — watch devices mirror this. */
  tradePnl?: number;
};

export type ProfileRow = {
  fundingCash: number;
  pairs: PairId[];
  risk: ProfileBook["risk"];
  bookJson: string | null;
};

export function snapshotBook(s: FloorState): ProfileBook {
  return {
    launched: s.launched,
    cash: s.cash,
    startingCash: s.startingCash,
    fundingCash: s.fundingCash,
    vault: s.vault,
    autoSweep: s.autoSweep,
    sweptTotal: s.sweptTotal,
    realized: s.realized,
    lifetimePnl: s.lifetimePnl,
    dayStartEquity: s.dayStartEquity,
    lastEngineAt: s.lastEngineAt,
    shiftStartedAt: s.shiftStartedAt,
    pairs: s.pairs,
    risk: {
      sizePct: s.risk.sizePct,
      stopPct: s.risk.stopPct,
      takePct: s.risk.takePct,
      maxDailyLossPct: s.risk.maxDailyLossPct,
      maxPositions: s.risk.maxPositions,
    },
    positions: s.positions,
    orders: s.orders.slice(0, 80),
    events: s.events.slice(0, 40),
    transfers: s.transfers.slice(0, 12),
    equityHistory: s.equityHistory.slice(-90),
    brain: s.brain,
    liveBudget: s.liveBudget,
    tradePnl: sessionProfit(
      s.realized,
      lotsMark(
        s.positions.filter((p) => p.mode === "live"),
        s.tickers,
      ).unrealized,
    ),
  };
}

export function parseBook(json: string | null | undefined): ProfileBook | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as ProfileBook;
    if (!v || typeof v.cash !== "number") return null;
    return v;
  } catch {
    return null;
  }
}

/** Only the armed Kraken desk may overwrite the shared profile book. */
export function canPersistDeskBook(s: {
  launched?: boolean;
  liveArmed?: boolean;
  keys?: { apiKey?: string; apiSecret?: string } | null;
}): boolean {
  return Boolean(s.launched && s.liveArmed && krakenKeysOn(s.keys));
}

export function persistDeskBook() {
  const s = useFloor.getState();
  if (!canPersistDeskBook(s)) return;
  const book = snapshotBook(s);
  useFloor.setState({
    syncedTradePnl: book.tradePnl ?? 0,
    syncedTradePnlAt: Date.now(),
  });
  void saveProfile({
    data: {
      fundingCash: s.fundingCash,
      pairs: s.pairs,
      risk: {
        sizePct: s.risk.sizePct,
        stopPct: s.risk.stopPct,
        takePct: s.risk.takePct,
        maxDailyLossPct: s.risk.maxDailyLossPct,
        maxPositions: s.risk.maxPositions,
      },
      bookJson: JSON.stringify(book),
    },
  }).catch(() => {
    /* guest or unsigned */
  });
}

export function applyRemoteBook(book: ProfileBook) {
  const local = useFloor.getState();
  // Armed trading desk never pulls over itself — it is the writer.
  if (canPersistDeskBook(local)) return;
  if (
    !shouldApplyRemoteBook(
      {
        lastEngineAt: local.lastEngineAt,
        positions: local.positions,
        orders: local.orders,
        realized: local.realized,
      },
      {
        lastEngineAt: book.lastEngineAt,
        positions: book.positions,
        orders: book.orders,
        realized: book.realized,
      },
    )
  ) {
    return;
  }
  const pnl = mergeRemotePnlFields(
    {
      realized: local.realized,
      lifetimePnl: local.lifetimePnl,
      dayStartEquity: local.dayStartEquity,
      lastEngineAt: local.lastEngineAt,
      shiftStartedAt: local.shiftStartedAt,
      orders: local.orders,
    },
    {
      realized: book.realized,
      lifetimePnl: book.lifetimePnl,
      dayStartEquity: book.dayStartEquity,
      lastEngineAt: book.lastEngineAt,
      shiftStartedAt: book.shiftStartedAt,
      orders: book.orders,
    },
  );
  useFloor.setState({
    launched: book.launched || local.launched,
    cash: book.cash,
    startingCash: book.startingCash,
    fundingCash: book.fundingCash,
    vault: Array.isArray(book.vault) ? book.vault : local.vault,
    autoSweep: book.autoSweep !== false,
    sweptTotal: typeof book.sweptTotal === "number" ? book.sweptTotal : local.sweptTotal,
    realized: pnl.realized,
    dayStartEquity: pnl.dayStartEquity,
    lastEngineAt: book.lastEngineAt,
    shiftStartedAt: pnl.shiftStartedAt,
    pairs: book.pairs?.length ? book.pairs : local.pairs,
    risk: book.risk ? { ...local.risk, ...book.risk } : local.risk,
    positions: Array.isArray(book.positions) ? book.positions : local.positions,
    orders: Array.isArray(pnl.orders) ? pnl.orders : local.orders,
    events: Array.isArray(book.events) ? book.events : local.events,
    transfers: Array.isArray(book.transfers) ? book.transfers : local.transfers,
    equityHistory: Array.isArray(book.equityHistory) ? book.equityHistory : local.equityHistory,
    lifetimePnl: pnl.lifetimePnl,
    brain: book.brain ?? local.brain,
    liveBudget: typeof book.liveBudget === "number" ? book.liveBudget : local.liveBudget,
    floorOpen: book.launched || local.floorOpen,
    autoTrade: true,
    opsMode: "auto",
    syncedTradePnl:
      typeof book.tradePnl === "number" && Number.isFinite(book.tradePnl)
        ? book.tradePnl
        : sessionProfit(
            pnl.realized,
            lotsMark(
              (Array.isArray(book.positions) ? book.positions : local.positions).filter(
                (p) => p.mode === "live",
              ),
            ).unrealized,
          ),
    syncedTradePnlAt: book.lastEngineAt || Date.now(),
  });
}

export const loadProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ProfileRow | null> => {
    const sql = await getSql();
    const rows = await sql<{
      funding_cash: number;
      pairs: unknown;
      risk: unknown;
      book: unknown;
    }>`select funding_cash, pairs, risk, book from profiles where user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) return null;
    const pairs = Array.isArray(row.pairs) ? (row.pairs as PairId[]) : [];
    const risk =
      row.risk && typeof row.risk === "object" ? (row.risk as ProfileRow["risk"]) : null;
    let bookJson: string | null = null;
    if (typeof row.book === "string") bookJson = row.book;
    else if (row.book && typeof row.book === "object") bookJson = JSON.stringify(row.book);
    return {
      fundingCash: Number(row.funding_cash) || 0,
      pairs,
      risk,
      bookJson,
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const pairsJson = JSON.stringify(data.pairs);
    const riskJson = data.risk ? JSON.stringify(data.risk) : null;
    const bookJson = data.bookJson ?? null;
    await sql`
      insert into profiles (user_id, funding_cash, pairs, risk, book, updated_at)
      values (${context.userId}, ${data.fundingCash}, ${pairsJson}::jsonb, ${riskJson}::jsonb, ${bookJson}::jsonb, now())
      on conflict (user_id) do update set
        funding_cash = excluded.funding_cash,
        pairs = excluded.pairs,
        risk = excluded.risk,
        book = coalesce(${bookJson}::jsonb, profiles.book),
        updated_at = now()
    `;
  });
