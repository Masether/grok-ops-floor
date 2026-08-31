import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { launchPreviewLine } from "@/lib/launch.mjs";
import {
  DAY_PRESETS,
  GOAL_PRESETS,
  fmtGoalUsd,
  isDayPreset,
  isGoalPreset,
  levelById,
  normalizeGoalDays,
  normalizeGoalProfit,
  planGoal,
  sessionMinutesForDays,
  type GoalLevel,
  type GoalLevelId,
} from "@/lib/goal";
import { DEFAULT_SESSION_MINUTES } from "@/lib/session";
import { useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DurationPills } from "./duration-pills";

export function LaunchSetup() {
  const launchDesk = useFloor((s) => s.launchDesk);
  const storedCash = useFloor((s) => s.startingCash);
  const storedGoal = useFloor((s) => s.goalProfit);
  const storedDays = useFloor((s) => s.goalDays);

  const [goalProfit, setGoalProfit] = useState(() =>
    normalizeGoalProfit(storedGoal || 10_000),
  );
  const [days, setDays] = useState(() => normalizeGoalDays(storedDays || 7));
  const [cash, setCash] = useState(storedCash || 10_000);
  const [levelId, setLevelId] = useState<GoalLevelId>(() =>
    planGoal({
      capital: storedCash || 10_000,
      goalProfit: storedGoal || 10_000,
      days: storedDays || 7,
    }).recommended,
  );
  const [levelTouched, setLevelTouched] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(DEFAULT_SESSION_MINUTES);
  const [sessionTouched, setSessionTouched] = useState(false);
  const [goalCustom, setGoalCustom] = useState(() => !isGoalPreset(storedGoal || 10_000));
  const [daysCustom, setDaysCustom] = useState(() => !isDayPreset(storedDays || 7));

  const goalInputRef = useRef<HTMLInputElement>(null);
  const daysInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionTouched) return;
    setSessionMinutes(sessionMinutesForDays(days));
  }, [days, sessionTouched]);

  const plan = useMemo(
    () => planGoal({ capital: cash, goalProfit, days }),
    [cash, goalProfit, days],
  );

  const selected = levelById(plan, levelId);

  useEffect(() => {
    if (levelTouched) return;
    setLevelId(plan.recommended);
  }, [plan.recommended, levelTouched]);

  const preview = launchPreviewLine({
    startingCash: plan.capital,
    sizePct: selected.sizePct,
    stopPct: selected.stopPct,
    takePct: selected.takePct,
    maxDailyLossPct: selected.maxDailyLossPct,
    maxPositions: selected.maxPositions,
  });

  const pickGoal = (n: number) => {
    setGoalProfit(normalizeGoalProfit(n));
    setGoalCustom(false);
  };

  const pickDays = (n: number) => {
    setDays(normalizeGoalDays(n));
    setDaysCustom(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-end bg-bg/85 p-2 backdrop-blur-[2px] sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-title"
    >
      <div className="panel max-h-[94dvh] w-full max-w-lg overflow-y-auto">
        <div className="panel-head">
          <div>
            <p className="panel-kicker" id="launch-title">
              Ops Floor
            </p>
            <p className="panel-sub">
              Name a profit goal and a deadline. Pick how hard the book works. Paper. Not a
              promise.
            </p>
          </div>
        </div>
        <form
          className="space-y-4 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const level = levelById(plan, levelId);
            launchDesk({
              startingCash: plan.capital,
              sizePct: level.sizePct,
              stopPct: level.stopPct,
              takePct: level.takePct,
              maxDailyLossPct: level.maxDailyLossPct,
              maxPositions: level.maxPositions,
              sessionMinutes,
              goalProfit: plan.goalProfit,
              goalDays: plan.days,
              goalLevel: level.id,
            });
          }}
        >
          <fieldset className="space-y-1.5">
            <Label htmlFor="launch-goal">Goal $</Label>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_PRESETS.map((n) => (
                <Chip
                  key={n}
                  active={!goalCustom && goalProfit === n}
                  onClick={() => pickGoal(n)}
                >
                  {fmtGoalUsd(n)}
                </Chip>
              ))}
              <Chip
                active={goalCustom || !isGoalPreset(goalProfit)}
                onClick={() => {
                  setGoalCustom(true);
                  goalInputRef.current?.focus();
                  goalInputRef.current?.select();
                }}
              >
                Custom
              </Chip>
            </div>
            <Input
              ref={goalInputRef}
              id="launch-goal"
              type="number"
              min={1}
              step={100}
              inputMode="decimal"
              value={goalProfit}
              onChange={(e) => {
                setGoalProfit(Number(e.target.value) || 0);
                setGoalCustom(true);
              }}
              onBlur={() => setGoalProfit(normalizeGoalProfit(goalProfit))}
            />
            <p className="text-2xs text-subtle">
              USD you want to make — not ending equity. Any amount. Not a promise you will.
            </p>
          </fieldset>

          <fieldset className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="launch-days">In how many days</Label>
              <span className="text-2xs text-subtle">or sooner</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAY_PRESETS.map((n) => (
                <Chip
                  key={n}
                  active={!daysCustom && days === n}
                  onClick={() => pickDays(n)}
                >
                  {n}d
                </Chip>
              ))}
              <Chip
                active={daysCustom || !isDayPreset(days)}
                onClick={() => {
                  setDaysCustom(true);
                  daysInputRef.current?.focus();
                  daysInputRef.current?.select();
                }}
              >
                Custom
              </Chip>
            </div>
            <Input
              ref={daysInputRef}
              id="launch-days"
              type="number"
              min={1}
              max={365}
              step={1}
              inputMode="numeric"
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value) || 0);
                setDaysCustom(true);
              }}
              onBlur={() => setDays(normalizeGoalDays(days))}
            />
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="launch-cash">Your paper capital $</Label>
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
              Starting paper cash. Minimum $100. The bot cannot deposit or withdraw.
            </p>
          </div>

          <fieldset className="space-y-2">
            <Label>Invest level</Label>
            <p
              className={cn(
                "text-2xs",
                plan.wild || selected.feasibility === "unrealistic"
                  ? "font-semibold text-danger"
                  : "text-muted",
              )}
            >
              {plan.recommendNote}
            </p>
            <div className="grid gap-2">
              {plan.levels.map((level) => (
                <LevelCard
                  key={level.id}
                  level={level}
                  selected={level.id === selected.id}
                  recommended={level.id === plan.recommended}
                  onSelect={() => { setLevelTouched(true); setLevelId(level.id); }}
                />
              ))}
            </div>
          </fieldset>

          <p
            className={cn(
              "text-2xs",
              plan.wild ? "font-semibold text-danger" : "text-muted",
            )}
          >
            {plan.needLine}
          </p>
          <p className="text-2xs text-muted">{preview}</p>

          <div className="space-y-1.5">
            <Label>Session duration</Label>
            <DurationPills
              value={sessionMinutes}
              onChange={(m) => {
                setSessionTouched(true);
                setSessionMinutes(m);
              }}
            />
            <p className="text-2xs text-subtle">
              This sitting, not the {plan.days}d window. Desk stops new entries when it
              ends. Open lots stay on the book; stops still fire. Live stays off.
            </p>
          </div>

          <Button type="submit" className="w-full" variant="good">
            Start paper desk
          </Button>
          <p className="text-2xs text-subtle">
            Not financial advice. Paper can still lose. The bot cannot deposit or withdraw.
            Live stays off until you attach an exchange, test the connection, and arm.
          </p>
        </form>
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

function LevelCard({
  level,
  selected,
  recommended,
  onSelect,
}: {
  level: GoalLevel;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const red = level.feasibility === "unrealistic";
  const sizePct = (level.sizePct * 100).toFixed(1).replace(/\.0$/, "");
  const stopPct = (level.stopPct * 100).toFixed(1).replace(/\.0$/, "");
  const takePct = (level.takePct * 100).toFixed(1).replace(/\.0$/, "");
  const haltPct = (level.maxDailyLossPct * 100).toFixed(0);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-sm px-3 py-2.5 text-left transition-[box-shadow,background-color] duration-150",
        selected
          ? red
            ? "bg-danger/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_55%,transparent)]"
            : "bg-good/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-good)_50%,transparent)]"
          : "bg-surface-2 shadow-[0_0_0_1px_var(--color-border)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-display text-xs font-semibold tracking-[0.14em] uppercase">
          {level.label}
        </span>
        {recommended ? (
          <span className="font-display text-micro tracking-[0.12em] text-good uppercase">
            Recommended
          </span>
        ) : null}
        <span
          className={cn(
            "font-display ml-auto rounded-xs px-1.5 py-0.5 text-micro tracking-[0.12em] uppercase",
            red ? "bg-danger/20 text-danger" : "bg-good/15 text-good",
          )}
        >
          {level.feasibility}
        </span>
      </div>
      <p className="stat-num mt-1 text-sm">
        {fmtGoalUsd(level.ticketUsd)}{" "}
        <span className="text-2xs text-muted">{sizePct}% of capital</span>
      </p>
      <p className="mt-0.5 text-2xs text-muted">
        stop {stopPct}% · take {takePct}% · daily halt {haltPct}%
      </p>
      <p className={cn("mt-1 text-2xs", red ? "text-danger" : "text-subtle")}>{level.note}</p>
    </button>
  );
}
