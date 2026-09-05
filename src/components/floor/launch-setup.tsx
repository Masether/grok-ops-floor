import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SignedOut } from "@/lib/auth/gates";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { pct } from "@/lib/format";
import { launchPreviewLine } from "@/lib/launch.mjs";
import { fmtGoalUsd } from "@/lib/goal";
import { PAIRS, SLEEVE_META } from "@/lib/kraken";
import { saveProfile } from "@/lib/profile";
import { useFloor } from "@/lib/store";
import type { PairId } from "@/lib/types";
import {
  ALL_LANE_IDS,
  inferLanes,
  LANES,
  pairLabels,
  pickHotBook,
  type LaneId,
} from "@/lib/universe";
import { cn } from "@/lib/utils";
import { DurationPills } from "./duration-pills.tsx";

const FUND_PRESETS = [1_000, 5_000, 10_000, 25_000, 50_000];

export function LaunchSetup() {
  const launchDesk = useFloor((s) => s.launchDesk);
  const setPairs = useFloor((s) => s.setPairs);
  const pairs = useFloor((s) => s.pairs);
  const tickers = useFloor((s) => s.tickers);
  const storedCash = useFloor((s) => s.startingCash);

  const [tune, setTune] = useState(false);
  const [cash, setCash] = useState(storedCash || 10_000);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [lanes, setLanes] = useState<LaneId[]>(() => inferLanes(pairs));

  const preview = launchPreviewLine({
    startingCash: cash,
    sizePct: 0.05,
    stopPct: 0.015,
    takePct: 0.025,
    maxDailyLossPct: 0.04,
    maxPositions: 5,
  });

  const hot = useMemo(() => pickHotBook(tickers, lanes), [tickers, lanes]);

  const applyPairs = (next: PairId[], nextLanes?: LaneId[]) => {
    setPairs(next);
    if (nextLanes) setLanes(nextLanes);
    else setLanes(inferLanes(next));
  };

  const toggleLane = (id: LaneId) => {
    const on = lanes.includes(id);
    const next = on
      ? lanes.length === 1
        ? lanes
        : lanes.filter((l) => l !== id)
      : [...lanes, id];
    applyPairs(pickHotBook(tickers, next), next);
  };

  const togglePair = (id: PairId) => {
    const next = pairs.includes(id)
      ? pairs.length === 1
        ? pairs
        : pairs.filter((p) => p !== id)
      : [...pairs, id];
    applyPairs(next);
  };

  const commitLaunch = (e?: FormEvent) => {
    e?.preventDefault();
    if (!tune) {
      useFloor.getState().setPairs(pickHotBook(useFloor.getState().tickers, ALL_LANE_IDS));
    }
    launchDesk({
      startingCash: Math.max(100, cash),
      sessionMinutes,
    });
    const s = useFloor.getState();
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
      },
    }).catch(() => {
      /* guest */
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-end p-2 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-title"
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className={cn("panel relative z-10 w-full max-w-lg bg-surface-3", tune && "max-h-[94dvh]")}
      >
        <div className="panel-head shrink-0">
          <div className="flex items-start gap-2.5">
            <img src="/favicon.svg" alt="" className="size-8 shrink-0 rounded-sm" />
            <div>
              <p className="panel-kicker" id="launch-title">
                Paper or live
              </p>
              <p className="panel-sub">
                Paper first — play money on live prices, 24/7 until you stop. Live is USD from
                your exchange when you attach a wallet. No $10k-in-7-days target.
              </p>
              <SignedOut>
                <p className="mt-2 text-2xs text-muted">
                  <Link to="/login" className="underline-offset-4 hover:text-fg hover:underline">
                    Sign in
                  </Link>{" "}
                  to keep the paper book on your profile. Wallet keys stay optional.
                </p>
              </SignedOut>
            </div>
          </div>
        </div>

        {!tune ? (
          <div className="space-y-3 px-4 py-4">
            <p className="text-sm text-muted">
              300 agents coordinate: one finds a setup, another challenges it, data and risk
              check the tape, Grok merges one signal and keeps the dissent. Hot tape, alts, and
              memes. $10k paper. Live stays off.
            </p>
            <Button type="button" className="min-h-11 w-full" variant="good" onClick={() => commitLaunch()}>
              Start paper desk
            </Button>
            <Button
              type="button"
              className="min-h-11 w-full"
              variant="outline"
              onClick={() => setTune(true)}
            >
              Tune paper cash and book
            </Button>
            <p className="text-2xs text-subtle">
              Not financial advice. Paper can still lose. The bot cannot deposit or withdraw.
              Add USD on the Desk when you want more paper, or arm live from your exchange.
            </p>
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={commitLaunch}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="launch-cash">Paper cash $</Label>
                <div className="flex flex-wrap gap-1.5">
                  {FUND_PRESETS.map((n) => (
                    <Chip key={n} active={cash === n} onClick={() => setCash(n)}>
                      {fmtGoalUsd(n)}
                    </Chip>
                  ))}
                </div>
                <Input
                  id="launch-cash"
                  type="number"
                  min={100}
                  step={100}
                  inputMode="decimal"
                  value={cash}
                  onChange={(e) => setCash(Number(e.target.value) || 0)}
                />
                <p className="text-2xs text-subtle">
                  Play money on the Trading desk. Not a deposit. Not a wallet. Live USD comes
                  later from your exchange.
                </p>
              </div>

              <fieldset className="space-y-1.5">
                <Label>Book the bot trades</Label>
                <p className="text-2xs text-subtle">
                  All three stay on unless you drop one. Bot pick re-ranks the live tape inside
                  the lanes you keep.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LANES.map((lane) => (
                    <Chip
                      key={lane.id}
                      active={lanes.includes(lane.id)}
                      onClick={() => toggleLane(lane.id)}
                    >
                      {lane.label}
                    </Chip>
                  ))}
                  <Chip
                    active={lanes.length === ALL_LANE_IDS.length}
                    onClick={() => applyPairs(hot, ALL_LANE_IDS)}
                  >
                    All three
                  </Chip>
                  <Chip active={false} onClick={() => applyPairs(hot, lanes)}>
                    Bot pick
                  </Chip>
                </div>
                <p className="text-2xs text-muted">
                  {lanes.length === ALL_LANE_IDS.length
                    ? "Hot tape + uprising alts + memes."
                    : LANES.filter((l) => lanes.includes(l.id))
                        .map((l) => l.blurb)
                        .join(" ")}{" "}
                  {pairLabels(pairs)}
                </p>
                {LANES.map((lane) => (
                  <div key={lane.id} className="pt-1">
                    <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
                      {lane.label}
                      <span className="ml-2 font-sans tracking-normal text-subtle normal-case">
                        {lane.blurb}
                      </span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {lane.pairs.map((id) => {
                        const p = PAIRS.find((row) => row.id === id);
                        if (!p) return null;
                        const on = pairs.includes(p.id);
                        const ch = tickers[p.id]?.changePct;
                        return (
                          <Button
                            key={`${lane.id}-${p.id}`}
                            type="button"
                            size="micro"
                            variant={on ? "default" : "outline"}
                            aria-pressed={on}
                            onClick={() => togglePair(p.id)}
                          >
                            {p.base}
                            {ch != null ? (
                              <span className={cn(ch >= 0 ? "text-good" : "text-danger")}>
                                {pct(ch, 1)}
                              </span>
                            ) : null}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="pt-1">
                  <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
                    {SLEEVE_META.stock.label}
                    <span className="ml-2 font-sans tracking-normal text-subtle normal-case">
                      {SLEEVE_META.stock.blurb}
                    </span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {PAIRS.filter((p) => p.sleeve === "stock").map((p) => {
                      const on = pairs.includes(p.id);
                      const ch = tickers[p.id]?.changePct;
                      return (
                        <Button
                          key={p.id}
                          type="button"
                          size="micro"
                          variant={on ? "default" : "outline"}
                          aria-pressed={on}
                          onClick={() => togglePair(p.id)}
                        >
                          {p.base}
                          {ch != null ? (
                            <span className={cn(ch >= 0 ? "text-good" : "text-danger")}>
                              {pct(ch, 1)}
                            </span>
                          ) : null}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <Label>How long it runs</Label>
                <DurationPills value={sessionMinutes} onChange={setSessionMinutes} />
                <p className="text-2xs text-subtle">
                  24/7 is the default — the desk does not clock out. Pick a sitting if you want
                  it to stop new entries on its own. Open lots stay; stops still fire.
                </p>
              </div>
              <p className="text-2xs text-muted">{preview}</p>
            </div>
            <div className="shrink-0 space-y-2 border-t border-border px-4 py-3">
              <Button type="submit" className="min-h-11 w-full" variant="good">
                Start paper desk
              </Button>
              <Button
                type="button"
                className="min-h-11 w-full"
                variant="outline"
                onClick={() => setTune(false)}
              >
                Back
              </Button>
              <p className="text-2xs text-subtle">
                Not financial advice. Paper can still lose. Live stays off until you attach an
                exchange, test the connection, and arm.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="micro"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
