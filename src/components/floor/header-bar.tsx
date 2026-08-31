import { Power, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PIPELINE } from "@/lib/agents";
import { haltLive } from "@/lib/engine";
import { clock, money, pct } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { usdOnBook } from "@/lib/specialists";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function HeaderBar() {
  const desk = useDesk();
  const floorOpen = useFloor((s) => s.floorOpen);
  const setFloorOpen = useFloor((s) => s.setFloorOpen);
  const mode = useFloor((s) => s.mode);
  const liveArmed = useFloor((s) => s.liveArmed);
  const autoTrade = useFloor((s) => s.autoTrade);
  const feedOk = useFloor((s) => s.feedOk);
  const feedSource = useFloor((s) => s.feedSource);
  const stage = useFloor((s) => s.stage);
  const ticks = useFloor((s) => s.ticks);
  const briefs = useFloor((s) => s.briefs);
  const startingCash = useFloor((s) => s.startingCash);
  const shiftStartedAt = useFloor((s) => s.shiftStartedAt);
  const events = useFloor((s) => s.events);
  const tickers = useFloor((s) => s.tickers);
  const pairs = useFloor((s) => s.pairs);
  const handoff = useFloor((s) => s.handoff);
  const brain = useFloor((s) => s.brain);
  const selfLearn = useFloor((s) => s.selfLearn);
  const liveBalance = useFloor((s) => s.liveBalance);
  const fearGreed = useFloor((s) => s.fearGreed);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const multiple = startingCash > 0 ? desk.equity / startingCash : 1;
  const latest = events[0];

  return (
    <header className="shrink-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2 lg:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-sm bg-fg text-bg" aria-hidden>
            <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
              <path d="M1.2 1.2h3.2l4.4 6.1 4.4-6.1h3.2L9.6 8.4 16 16h-3.3L8.8 10.6 4.4 16H1.2l6.4-7.6z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="font-display flex items-baseline gap-1.5 text-lg leading-none font-semibold tracking-[0.08em] uppercase">
              <span>Grok</span>
              <span className="text-accent">Ops Floor</span>
            </div>
            <p className="truncate text-micro tracking-wide text-subtle">
              twelve desks · news on the wire
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-4">
          <Stat label="Desk" value={money(desk.equity)} />
          {mode === "live" ? (
            <Stat label="Kraken" value={money(usdOnBook(liveBalance))} />
          ) : null}
          <Stat
            label="Day"
            value={money(desk.dayPnl)}
            tone={desk.dayPnl >= 0 ? "good" : "bad"}
          />
          <Stat label="Mult" value={`${multiple.toFixed(2)}x`} />
          <Stat
            label="Brain"
            value={
              selfLearn
                ? brain.samples
                  ? `${Math.round((brain.wins / brain.samples) * 100)}%`
                  : "learn"
                : "off"
            }
            tone={selfLearn ? "good" : undefined}
          />
          <Stat label="Briefs" value={String(briefs + ticks)} />
          {fearGreed ? (
            <Stat
              label="F&G"
              value={String(fearGreed.value)}
              tone={fearGreed.value >= 60 ? "good" : fearGreed.value <= 35 ? "bad" : undefined}
            />
          ) : null}
          <Stat label="Shift" value={clock(now - shiftStartedAt)} />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={floorOpen ? "good" : "outline"}
              onClick={() => setFloorOpen(!floorOpen)}
            >
              {floorOpen ? "Floor open" : "Floor closed"}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="live"
              aria-label="Kill switch"
              onClick={() => void haltLive()}
            >
              <Power className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 overflow-hidden border-b border-border px-3 py-1.5 text-micro lg:px-4">
        <span
          className={cn(
            "shrink-0 font-display tracking-[0.14em] uppercase",
            feedOk ? "text-good" : "text-danger",
          )}
        >
          {feedSource === "sim" ? "Sim tape" : "Kraken"} {feedOk ? "live" : "down"}
        </span>
        <span className="text-subtle">·</span>
        <span className="font-display shrink-0 tracking-[0.12em] text-warn uppercase">
          {mode === "live" ? (liveArmed ? "Live armed" : "Live idle") : "Paper"}
        </span>
        {autoTrade ? (
          <>
            <span className="text-subtle">·</span>
            <span className="text-good">auto</span>
          </>
        ) : null}
        {selfLearn ? (
          <>
            <span className="text-subtle">·</span>
            <span className="text-archivist">learn</span>
          </>
        ) : null}
        <span className="text-subtle">·</span>
        <div className="flex min-w-0 flex-1 gap-4 overflow-hidden">
          {pairs.map((id) => {
            const t = tickers[id];
            if (!t) return null;
            return (
              <button
                key={id}
                type="button"
                className="flex shrink-0 items-center gap-1.5"
                onClick={() => useFloor.getState().setInspectPair(id)}
              >
                <span className="text-subtle">{PAIR_BY_ID[id].base}</span>
                <span className="stat-num text-fg">
                  {t.last > 100 ? t.last.toFixed(1) : t.last.toFixed(4)}
                </span>
                <span className={cn("stat-num", t.changePct >= 0 ? "text-good" : "text-danger")}>
                  {pct(t.changePct, 2)}
                </span>
              </button>
            );
          })}
        </div>
        <span className="hidden shrink-0 text-muted md:inline">
          {handoff
            ? `on the desk ${handoff.from} → ${handoff.to}`
            : latest
              ? latest.title
              : "waiting on a brief"}
        </span>
      </div>

      <ol className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5 lg:px-3">
        {PIPELINE.map((step) => {
          const on = stage === step.id;
          return (
            <li
              key={step.id}
              className={cn(
                "font-display flex-1 rounded-xs px-2 py-1 text-center text-2xs tracking-[0.14em] uppercase",
                on ? "bg-surface-3 text-fg" : "text-subtle",
              )}
            >
              {step.label}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="hidden min-w-[4.5rem] sm:block">
      <div className="font-display text-micro tracking-[0.16em] text-subtle uppercase">{label}</div>
      <div
        className={cn(
          "stat-num text-sm",
          tone === "good" && "text-good",
          tone === "bad" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}
