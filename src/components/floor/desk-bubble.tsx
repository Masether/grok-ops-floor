import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import {
  dayLossAlert,
  fillLeg,
  fillWhy,
  fillWinRatePct,
  lotMetrics,
} from "@/lib/desk-pnl";
import { ago, money, moneyFull, pct, px, qty } from "@/lib/format";
import { placeManualTicket, executeOrder, closeLot, cancelPendingTicket } from "@/lib/engine";
import { PAIR_BY_ID } from "@/lib/kraken";
import { useDesk, useFloor, type DeskTab } from "@/lib/store";
import type { Order, PairId, Side } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WalletTab } from "./wallet-tab";

type Tab = DeskTab;

export function DeskBubble() {
  const open = useFloor((s) => s.deskOpen);
  const setOpen = useFloor((s) => s.setDeskOpen);
  const tab = useFloor((s) => s.deskTab);
  const setTab = useFloor((s) => s.setDeskTab);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-end bg-bg/45 p-2 backdrop-blur-[3px] sm:place-items-center sm:p-4"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-surface/80 shadow-[0_0_0_1px_var(--color-border-strong),0_24px_80px_rgb(0_0_0/0.45)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <p className="panel-kicker" id="desk-title">
              The desk
            </p>
            <p className="panel-sub">
              {tab === "money"
                ? "Bot wallet — profits auto-land here. Convert, then send to Kraken or Coinbase."
                : "The trading book — same money the floor is showing. Open lots, then every in and out."}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Close desk"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex gap-1 border-b border-border px-3 py-2">
          {(
            [
              ["blotter", "Blotter"],
              ["money", "Move money"],
              ["ticket", "Manual ticket"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              className="min-h-11"
              variant={tab === id ? "default" : "outline"}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "blotter" ? <BlotterTab onTicket={() => setTab("ticket")} /> : null}
          {tab === "money" ? <WalletTab /> : null}
          {tab === "ticket" ? <TicketTab /> : null}
        </div>
      </div>
    </div>
  );
}

function BlotterTab({ onTicket }: { onTicket: () => void }) {
  const desk = useDesk();
  const positions = useFloor((s) => s.positions);
  const tickers = useFloor((s) => s.tickers);
  const orders = useFloor((s) => s.orders);
  const grokNote = useFloor((s) => s.grokNote);
  const pending = useFloor((s) => s.pendingLive);
  const opsMode = useFloor((s) => s.opsMode);
  const startingCash = useFloor((s) => s.startingCash);
  const dayStartEquity = useFloor((s) => s.dayStartEquity);
  const risk = useFloor((s) => s.risk);

  const fills = orders.filter((o) => o.status === "filled");
  const wr = fillWinRatePct(desk.wins, desk.losses);
  const haltBase = dayStartEquity > 0 ? dayStartEquity : startingCash;
  const alert = dayLossAlert({
    dayPnl: desk.dayPnl,
    haltBase,
    maxDailyLossPct: risk.maxDailyLossPct,
  });

  return (
    <>
      <DayBanner
        level={alert.level}
        dayPnlPct={alert.dayPnlPct}
        usedOfHaltPct={alert.usedOfHaltPct}
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border px-3 py-2.5 sm:grid-cols-4">
        <Stat label="Book" value={moneyFull(desk.equity)} extra="live on the floor" />
        <Stat label="Day" value={money(desk.dayPnl)} tone={signedTone(desk.dayPnl)} />
        <Stat label="Free cash" value={moneyFull(desk.cash)} />
        <Stat label="In lots" value={moneyFull(desk.exposure)} extra={`${desk.openPositions} open`} />
      </div>

      {grokNote ? (
        <p className="border-b border-border px-3 py-2 text-2xs text-muted">{grokNote}</p>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
          <p className="text-2xs text-muted">
            Waiting: {pending.side === "buy" ? "IN" : "OUT"} {PAIR_BY_ID[pending.pair].base}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="good" onClick={() => void executeOrder(pending)}>
              Fill it
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => cancelPendingTicket()}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <section className="border-b border-border px-3 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
            Open now
          </h3>
          <span className="text-micro text-subtle">
            {opsMode === "auto" ? "bot is trading" : opsMode === "learn" ? "study only" : "you size tickets"}
          </span>
        </div>
        {positions.length === 0 ? (
          <p className="mt-2 text-2xs text-subtle">
            Flat. Nothing in the book. When the bot buys, the lot lands here until it sells.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {positions.map((p) => {
              const mark = tickers[p.pair]?.last ?? p.mark;
              const m = lotMetrics({
                entry: p.entry,
                mark,
                stop: p.stop,
                take: p.take,
                qty: p.qty,
              });
              return (
                <li
                  key={p.id}
                  className={cn(
                    "rounded-sm px-2 py-2",
                    m.nearStop
                      ? "desk-row-near-stop shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_55%,transparent)]"
                      : "shadow-[0_0_0_1px_var(--color-border)]",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-display text-2xs tracking-[0.12em] uppercase">
                      IN {PAIR_BY_ID[p.pair].label}
                      {m.nearStop ? <span className="ml-1.5 text-danger">near stop</span> : null}
                    </span>
                    <span className={cn("stat-num text-sm", signedClass(m.pnl))}>{money(m.pnl)}</span>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted">
                    {qty(p.qty, 4)} @ {px(p.entry)} → {px(mark)} · stop {px(p.stop)} · take {px(p.take)} ·{" "}
                    {pct(m.fromEntryPct, 2)}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    className="mt-2 min-h-11 w-full"
                    onClick={() => {
                      void closeLot(p.id).then((res) => {
                        if (!res.ok) toast.message(res.reason);
                        else toast.success(`Closed ${PAIR_BY_ID[p.pair].base}`);
                      });
                    }}
                  >
                    Close ticket
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="px-3 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
            In and out
          </h3>
          <p className="text-micro text-subtle">
            {desk.fills} fills · {desk.wins} take · {desk.losses} stop
            {wr != null ? ` · ${wr.toFixed(0)}% win` : ""}
          </p>
        </div>
        {fills.length === 0 ? (
          <p className="mt-2 text-2xs text-subtle">
            No fills yet. IN is a buy. OUT is a sell (take, stop, or you). Same tape as the floor.
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-border">
            {fills.map((o) => (
              <FillRow key={o.id} order={o} />
            ))}
          </ol>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onTicket}>
            Place a ticket
          </Button>
        </div>
      </section>
    </>
  );
}

function FillRow({ order }: { order: Order }) {
  const leg = fillLeg(order);
  const why = fillWhy(order.reason);
  const pxn = order.fillPrice ?? order.price;
  const out = leg === "out";
  return (
    <li className="flex items-baseline gap-2 py-2">
      <span
        className={cn(
          "font-display w-8 shrink-0 text-micro tracking-[0.12em] uppercase",
          out ? "text-danger" : "text-good",
        )}
      >
        {out ? "OUT" : "IN"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display text-2xs tracking-[0.08em] uppercase">
          {PAIR_BY_ID[order.pair]?.label ?? order.pair}
        </span>
        <span className="ml-1.5 text-2xs text-muted">
          {qty(order.qty, 4)} @ {px(pxn)} · {why}
        </span>
      </span>
      <span
        className={cn(
          "stat-num shrink-0 text-2xs",
          order.pnl == null ? "text-muted" : signedClass(order.pnl),
        )}
      >
        {order.pnl == null ? (out ? "—" : money(pxn * order.qty)) : money(order.pnl)}
      </span>
      <span className="stat-num w-8 shrink-0 text-right text-micro text-subtle">{ago(order.ts)}</span>
    </li>
  );
}

function TicketTab() {
  const pairs = useFloor((s) => s.pairs);
  const tickers = useFloor((s) => s.tickers);
  const cash = useFloor((s) => s.cash);
  const pending = useFloor((s) => s.pendingLive);
  const opsMode = useFloor((s) => s.opsMode);
  const inspect = useFloor((s) => s.inspectPair);
  const positions = useFloor((s) => s.positions);
  const [pair, setPair] = useState<PairId>(
    inspect && pairs.includes(inspect) ? inspect : (pairs[0] ?? "XBTUSD"),
  );
  const [side, setSide] = useState<Side>("buy");
  const [dollars, setDollars] = useState("500");
  const [busy, setBusy] = useState(false);
  const mark = tickers[pair]?.last;
  const held = positions.find((p) => p.pair === pair);

  useEffect(() => {
    if (inspect && pairs.includes(inspect)) setPair(inspect);
  }, [inspect, pairs]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await placeManualTicket({
        pair,
        side,
        dollars: Number(dollars),
      });
      if (!res.ok) toast.message(res.reason);
      else toast.success(`${side === "buy" ? "IN" : "OUT"} ${PAIR_BY_ID[pair].base} filled`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 px-3 py-3">
      <p className="text-2xs text-subtle">
        Optional. Auto already trades the book. Use this only if you want to buy or sell yourself.
      </p>
      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-surface-2 px-3 py-2">
          <p className="text-2xs text-muted">
            Bot ticket {pending.side.toUpperCase()} {PAIR_BY_ID[pending.pair].base}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="good" onClick={() => void executeOrder(pending)}>
              Fill it
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => cancelPendingTicket()}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <div className="flex flex-wrap gap-1.5">
          {pairs.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={id === pair ? "default" : "outline"}
              aria-pressed={id === pair}
              onClick={() => setPair(id)}
            >
              {PAIR_BY_ID[id].base}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={side === "buy" ? "good" : "outline"}
            aria-pressed={side === "buy"}
            onClick={() => setSide("buy")}
          >
            IN · buy
          </Button>
          <Button
            type="button"
            variant={side === "sell" ? "danger" : "outline"}
            aria-pressed={side === "sell"}
            onClick={() => setSide("sell")}
          >
            OUT · sell
          </Button>
          {held ? (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void closeLot(held.id).then((res) => {
                  if (!res.ok) toast.message(res.reason);
                  else toast.success(`Closed ${PAIR_BY_ID[held.pair].base}`);
                }).finally(() => setBusy(false));
              }}
            >
              Close {PAIR_BY_ID[held.pair].base}
            </Button>
          ) : null}
        </div>
        <div>
          <Label htmlFor="ticket-usd">Size $</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[100, 250, 500, 1000, 2500].map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={Number(dollars) === n ? "default" : "outline"}
                onClick={() => setDollars(String(n))}
              >
                {money(n)}
              </Button>
            ))}
          </div>
          <Input
            id="ticket-usd"
            className="mt-2"
            type="number"
            min={10}
            step={10}
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
          />
          <p className="mt-1 text-2xs text-subtle">
            Free {moneyFull(cash)}
            {mark != null ? ` · mark ${px(mark)}` : ""}
            {opsMode === "paper" ? " · paper" : ""}
          </p>
        </div>
        <Button type="submit" className="w-full" variant="good" disabled={busy}>
          Place ticket
        </Button>
      </form>
    </div>
  );
}


function DayBanner({
  level,
  dayPnlPct,
  usedOfHaltPct,
}: {
  level: ReturnType<typeof dayLossAlert>["level"];
  dayPnlPct: number;
  usedOfHaltPct: number;
}) {
  if (level === "ok") return null;
  const loss = Math.abs(dayPnlPct).toFixed(1);
  const line = `day loss ${loss}% · ${usedOfHaltPct.toFixed(0)}% of halt`;
  if (level === "halt") {
    return (
      <div className="border-b border-danger bg-danger/25 px-3 py-2 text-2xs font-semibold tracking-wide text-danger uppercase">
        daily halt · {line}
      </div>
    );
  }
  if (level === "alert") {
    return (
      <div className="border-b border-danger/50 bg-danger/20 px-3 py-2 text-2xs font-semibold text-danger">
        ALERT · {line}
      </div>
    );
  }
  return (
    <div className="border-b border-warn/40 bg-warn/10 px-3 py-2 text-2xs text-warn">{line}</div>
  );
}

function Stat({
  label,
  value,
  extra,
  tone,
}: {
  label: string;
  value: string;
  extra?: string;
  tone?: "good" | "bad" | "flat";
}) {
  return (
    <div className="min-w-0">
      <div className="font-display text-micro tracking-[0.16em] text-subtle uppercase">{label}</div>
      <div
        className={cn(
          "stat-num text-sm",
          tone === "good" && "text-good",
          tone === "bad" && "text-danger",
          tone === "flat" && "text-muted",
        )}
      >
        {value}
      </div>
      {extra ? <div className="stat-num text-micro text-subtle">{extra}</div> : null}
    </div>
  );
}

function signedTone(n: number): "good" | "bad" | "flat" {
  if (n > 0) return "good";
  if (n < 0) return "bad";
  return "flat";
}

function signedClass(n: number): string {
  if (n > 0) return "text-good";
  if (n < 0) return "text-danger";
  return "text-muted";
}
