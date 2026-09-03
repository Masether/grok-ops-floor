import { CandlestickChart, Power, Settings2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PIPELINE } from "@/lib/agents";
import { haltLive, studyBook } from "@/lib/engine";
import { clock, clockHms, money, moneyFull, pct } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { sessionRemainingMs } from "@/lib/session";
import { usdOnBook } from "@/lib/specialists";
import { profitBarPct, sessionProfit } from "@/lib/desk-pnl";
import { btcOnBook, deskIsLive } from "@/lib/live-budget";
import { pnlRange } from "@/lib/live-pnl";
import { useDesk, useFloor } from "@/lib/store";
import { vaultMark } from "@/lib/wallet";
import type { PairId } from "@/lib/types";
import { PLAYBOOKS, type PlaybookId } from "@/lib/playbook";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { InstallAppButton } from "./install-app";

export function HeaderBar() {
  const desk = useDesk();
  const floorOpen = useFloor((s) => s.floorOpen);
  const setFloorOpen = useFloor((s) => s.setFloorOpen);
  const launched = useFloor((s) => s.launched);
  const mode = useFloor((s) => s.mode);
  const playbooks = useFloor((s) => s.playbooks);
  const setPlaybook = useFloor((s) => s.setPlaybook);
  const liveArmed = useFloor((s) => s.liveArmed);
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
  const liveBalance = useFloor((s) => s.liveBalance);
  const liveBudget = useFloor((s) => s.liveBudget);
  const fearGreed = useFloor((s) => s.fearGreed);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const sessionEndsAt = useFloor((s) => s.sessionEndsAt);
  const chartsOpen = useFloor((s) => s.chartsOpen);
  const setChartsOpen = useFloor((s) => s.setChartsOpen);
  const deskOpen = useFloor((s) => s.deskOpen);
  const setDeskOpen = useFloor((s) => s.setDeskOpen);
  const setDeskTab = useFloor((s) => s.setDeskTab);
  const fundingCash = useFloor((s) => s.fundingCash);
  const vault = useFloor((s) => s.vault);
  const setBrainOpen = useFloor((s) => s.setBrainOpen);
  const brainOpen = useFloor((s) => s.brainOpen);
  const swarm = useFloor((s) => s.swarm);
  const equityHistory = useFloor((s) => s.equityHistory);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const latest = events[0];
  const last: Partial<Record<PairId, number>> = {};
  for (const p of pairs) last[p] = tickers[p]?.last;
  const walletUsd = fundingCash + vaultMark(vault, last);
  const live = deskIsLive({ mode, liveArmed, liveBalance });
  const profit = sessionProfit(desk.realized, desk.unrealized);
  const krakenUsd = usdOnBook(liveBalance);
  const barBase = live ? liveBudget : startingCash;
  const barPct = profitBarPct(profit, barBase);
  const spark = equityHistory.slice(-40);
  const sparkVals = spark.map((p) => sessionProfit(desk.realized, p.unrealized));
  const range = pnlRange(sparkVals, profit);
  const sparkMin = Math.min(range.low, 0);
  const sparkMax = Math.max(range.high, 0);
  const sparkSpan = Math.max(sparkMax - sparkMin, 0.01);

  return (
    <header className="shrink-0">
      <div className="border-b border-border px-3 py-1.5 lg:px-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-micro tracking-[0.16em] text-subtle uppercase">
            Live PnL
          </span>
          <span
            className={cn(
              "stat-num text-sm",
              profit > 0 ? "text-good" : profit < 0 ? "text-danger" : "text-fg",
            )}
          >
            {profit >= 0 ? "+" : ""}
            {moneyFull(profit)}
            <span className="ml-2 text-micro text-subtle">
              {clockHms(now - (shiftStartedAt || now))} running · closed {money(desk.realized)} · open{" "}
              {money(desk.unrealized)} · H {money(range.high)} · L {money(range.low)}
            </span>
          </span>
        </div>
        {spark.length >= 2 ? (
          <div className="mt-1 flex h-5 items-end gap-px" aria-hidden>
            {spark.map((p, i) => {
              const v = sparkVals[i] ?? 0;
              return (
                <span
                  key={`${p.t}-${i}`}
                  className="min-w-px flex-1 rounded-xs"
                  style={{
                    height: `${8 + ((v - sparkMin) / sparkSpan) * 12}px`,
                    background: v >= 0 ? "var(--color-good)" : "var(--color-danger)",
                    opacity: 0.4 + (i / spark.length) * 0.6,
                  }}
                />
              );
            })}
          </div>
        ) : null}
        <div className="mt-1 h-1.5 overflow-hidden rounded-xs bg-surface-3" aria-hidden>
          <div
            className={cn("h-full", profit >= 0 ? "bg-good" : "bg-danger")}
            style={{ width: `${Math.abs(barPct)}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2 lg:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-sm" aria-hidden>
            <img src="/favicon.svg" alt="" className="size-8" />
          </span>
          <div className="min-w-0">
            <div className="font-display flex items-baseline gap-1.5 text-lg leading-none font-semibold tracking-[0.08em] uppercase">
              <span>Grok</span>
              <span className="text-accent">Ops Floor</span>
            </div>
            <p className="truncate text-micro tracking-wide text-subtle">
              {liveArmed
                ? `Live Kraken · budget ${moneyFull(liveBudget)}`
                : "300 agents · 3 desks: setup · challenge · risk"}
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-4">
          <Stat label="Desk" value={moneyFull(desk.equity)} always />
          <button
            type="button"
            className="min-h-11 text-left"
            onClick={() => {
              setDeskTab("money");
              setDeskOpen(true);
            }}
          >
            <Stat label="Wallet" value={moneyFull(walletUsd)} tone={walletUsd > 0 ? "good" : undefined} always />
          </button>
          {live ? <Stat label="Kraken" value={moneyFull(krakenUsd)} always /> : null}
          {live ? (
            <Stat
              label="BTC"
              value={`${btcOnBook(liveBalance).toFixed(5)}`}
              always
            />
          ) : null}
          {live ? <Stat label="Budget" value={moneyFull(liveBudget)} always /> : null}
          <Stat
            label="Day"
            value={`${desk.dayPnl >= 0 ? "+" : ""}${moneyFull(desk.dayPnl)}`}
            tone={desk.dayPnl > 0 ? "good" : desk.dayPnl < 0 ? "bad" : undefined}
            always
          />
          <Stat label="Running" value={clockHms(now - (shiftStartedAt || now))} always />
          <Stat
            label="P&L"
            value={`${profit >= 0 ? "+" : ""}${moneyFull(profit)}`}
            tone={profit > 0 ? "good" : profit < 0 ? "bad" : undefined}
            always
          />
          <button
            type="button"
            className="min-h-11 text-left"
            onClick={() => setBrainOpen(!brainOpen)}
          >
            <Stat
              label="Brain"
              value={
                brain.samples
                  ? `${Math.round((brain.wins / Math.max(brain.samples, 1)) * 100)}%`
                  : "on"
              }
              tone="good"
              always
            />
          </button>
          <Stat
            label="Swarm"
            value={
              swarm.pending
                ? `${swarm.reported}/${swarm.live}`
                : swarm.debate?.dissent
                  ? `${swarm.debate.dissent.bots} dissent`
                  : swarm.rttMs
                    ? `${swarm.long}/${swarm.live} ${swarm.rttMs}ms`
                    : `${swarm.long}/${swarm.live}`
            }
            always
          />
          <Stat label="Briefs" value={String(briefs + ticks)} />
          {fearGreed ? (
            <Stat
              label="F&G"
              value={String(fearGreed.value)}
              tone={fearGreed.value >= 60 ? "good" : fearGreed.value <= 35 ? "bad" : undefined}
            />
          ) : null}
          <Stat label="Shift" value={sessionEndsAt == null ? "24/7" : clock(now - shiftStartedAt)} />
          {sessionEndsAt != null ? (
            <Stat label="Left" value={clock(sessionRemainingMs(sessionEndsAt, now) ?? 0)} always />
          ) : null}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={liveArmed ? "live" : floorOpen ? "good" : "outline"}
              onClick={() => setFloorOpen(!floorOpen)}
            >
              {liveArmed ? "Live Kraken" : floorOpen ? "Floor open" : "Floor closed"}
            </Button>
            <Button
              size="sm"
              variant={deskOpen ? "default" : "outline"}
              aria-pressed={deskOpen}
              onClick={() => {
                if (deskOpen) setDeskOpen(false);
                else {
                  setDeskTab("blotter");
                  setDeskOpen(true);
                }
              }}
            >
              <Wallet className="size-3.5" />
              Desk
            </Button>
            <Button
              size="sm"
              variant={chartsOpen ? "default" : "outline"}
              aria-pressed={chartsOpen}
              onClick={() => setChartsOpen(!chartsOpen)}
            >
              <CandlestickChart className="size-3.5" />
              Charts
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
            <InstallAppButton compact />
            <AuthSlot />
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
        {mode === "live" ? (
          <span className="font-display shrink-0 tracking-[0.12em] text-danger uppercase">
            {liveArmed ? "Live armed" : "Live idle"}
          </span>
        ) : null}
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center">
          <div className="flex gap-1">
            {PLAYBOOKS.map((b) => (
              <Button
                key={b.id}
                type="button"
                size="sm"
                className="min-h-11"
                variant={playbooks.includes(b.id) ? "default" : "outline"}
                aria-pressed={playbooks.includes(b.id)}
                title={b.hint}
                disabled={!launched}
                onClick={() => {
                  setPlaybook(b.id as PlaybookId);
                  toast.message(
                    playbooks.includes(b.id) && playbooks.length > 1
                      ? `${b.label} off`
                      : `${b.label} on · ${b.hint}`,
                  );
                }}
              >
                {b.label}
              </Button>
            ))}
          </div>
        </div>
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
  always,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  always?: boolean;
}) {
  return (
    <div className={always ? "min-w-[4.5rem]" : "hidden min-w-[4.5rem] sm:block"}>
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

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="size-8 animate-pulse rounded-sm bg-surface-3" aria-hidden />;
  }
  if (!user) {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <div className="max-w-[10rem] truncate text-2xs">
      <UserButton />
    </div>
  );
}

