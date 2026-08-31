import { X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  dayLossAlert,
  equityMultiple,
  fillWinRatePct,
  lotMetrics,
  pctOfCapital,
} from "@/lib/desk-pnl";
import { money, moneyFull, pct, px, qty } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function DeskBubble() {
  const open = useFloor((s) => s.deskOpen);
  const setOpen = useFloor((s) => s.setDeskOpen);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const desk = useDesk();
  const startingCash = useFloor((s) => s.startingCash);
  const dayStartEquity = useFloor((s) => s.dayStartEquity);
  const risk = useFloor((s) => s.risk);
  const positions = useFloor((s) => s.positions);
  const tickers = useFloor((s) => s.tickers);
  const cash = useFloor((s) => s.cash);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const capital = startingCash > 0 ? startingCash : desk.equity;
  const haltBase = dayStartEquity > 0 ? dayStartEquity : capital;
  const alert = dayLossAlert({
    dayPnl: desk.dayPnl,
    haltBase,
    maxDailyLossPct: risk.maxDailyLossPct,
  });
  const unrlPct = pctOfCapital(desk.unrealized, capital);
  const realPct = pctOfCapital(desk.realized, capital);
  const dayPct = pctOfCapital(desk.dayPnl, capital);
  const eqPct = pctOfCapital(desk.equity - capital, capital);
  const multiple = equityMultiple(desk.equity, capital);
  const wr = fillWinRatePct(desk.wins, desk.losses);

  const openSettings = () => {
    setOpen(false);
    setSettingsOpen(true);
  };

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
              Desk
            </p>
            <p className="panel-sub">book, lots, and the halt cap — same numbers as the floor</p>
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

        <DayBanner
          level={alert.level}
          dayPnlPct={alert.dayPnlPct}
          usedOfHaltPct={alert.usedOfHaltPct}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border px-3 py-2.5 sm:grid-cols-3">
            <Stat
              label="Equity"
              value={moneyFull(desk.equity)}
              extra={pct(eqPct, 2)}
              tone={signedTone(eqPct)}
            />
            <Stat
              label="Mult"
              value={`${multiple.toFixed(2)}x`}
              tone={multiple > 1 ? "good" : multiple < 1 ? "bad" : "flat"}
            />
            <Stat label="Cash" value={money(cash)} />
            <Stat
              label="Unrealized"
              value={money(desk.unrealized)}
              extra={pct(unrlPct, 2)}
              tone={signedTone(desk.unrealized)}
            />
            <Stat
              label="Realized"
              value={money(desk.realized)}
              extra={pct(realPct, 2)}
              tone={signedTone(desk.realized)}
            />
            <Stat
              label="Day PnL"
              value={money(desk.dayPnl)}
              extra={`${pct(dayPct, 2)} · ${alert.usedOfHaltPct.toFixed(0)}% of halt`}
              tone={signedTone(desk.dayPnl)}
            />
          </div>

          <div className="border-b border-border px-3 py-2.5">
            <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
              Fills today
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="stat-num text-sm text-good">{desk.wins} TP</span>
              <span className="stat-num text-sm text-danger">{desk.losses} SL</span>
              <span className="stat-num text-2xs text-muted">{desk.fills} fills</span>
              <span
                className={cn(
                  "stat-num ml-auto text-sm",
                  wr == null ? "text-muted" : wr >= 50 ? "text-good" : "text-danger",
                )}
              >
                {wr == null ? "—" : `${wr.toFixed(0)}% win`}
              </span>
            </div>
          </div>

          <div className="border-b border-border px-3 py-2.5">
            <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
              Open lots
            </p>
            {positions.length === 0 ? (
              <p className="mt-1.5 text-2xs text-subtle">Flat. Runner has no inventory.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
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
                        "rounded-sm px-2 py-1.5",
                        m.nearStop
                          ? "desk-row-near-stop shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_55%,transparent)]"
                          : "shadow-[0_0_0_1px_var(--color-border)]",
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                        <span className="font-display text-2xs tracking-[0.12em] uppercase">
                          {PAIR_BY_ID[p.pair].label}
                          {m.nearStop ? (
                            <span className="ml-1.5 text-danger">near stop</span>
                          ) : null}
                        </span>
                        <span className="stat-num text-micro text-muted">
                          {qty(p.qty, 4)} · {p.mode}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-2xs">
                        <span className="stat-num text-muted">in {px(p.entry)}</span>
                        <span className="stat-num">mk {px(mark)}</span>
                        <span className={cn("stat-num", signedClass(m.pnl))}>
                          {money(m.pnl)} {pct(m.fromEntryPct, 2)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-2xs">
                        <span
                          className={cn(
                            "stat-num",
                            m.nearStop || m.underwater ? "text-danger" : "text-muted",
                          )}
                        >
                          SL {m.distStopPct.toFixed(2)}%
                        </span>
                        <span
                          className={cn(
                            "stat-num",
                            m.nearTake || !m.underwater ? "text-good" : "text-muted",
                          )}
                        >
                          TP {m.distTakePct.toFixed(2)}%
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
                Settings snapshot
              </p>
              <Button type="button" size="micro" variant="outline" onClick={openSettings}>
                Desk settings
              </Button>
            </div>
            <p className="mt-1 text-2xs text-subtle">read-only — why a banner fired</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              <Snap label="Size" value={fracPct(risk.sizePct)} />
              <Snap label="Stop" value={fracPct(risk.stopPct)} />
              <Snap label="Take" value={fracPct(risk.takePct)} />
              <Snap
                label="Daily loss"
                value={fracPct(risk.maxDailyLossPct)}
                warn={alert.level !== "ok"}
              />
            </div>
          </div>
        </div>
      </div>
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
  const used = usedOfHaltPct.toFixed(0);
  const line = `day loss ${loss}% · ${used}% of halt`;
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
      {extra ? (
        <div
          className={cn(
            "stat-num text-micro",
            tone === "good" && "text-good",
            tone === "bad" && "text-danger",
            (tone === "flat" || !tone) && "text-subtle",
          )}
        >
          {extra}
        </div>
      ) : null}
    </div>
  );
}

function Snap({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">{label}</div>
      <div className={cn("stat-num text-2xs", warn ? "text-danger" : "text-fg")}>{value}</div>
    </div>
  );
}

function fracPct(frac: number): string {
  return `${(frac * 100).toFixed(1)}%`;
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
