import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { launchPreviewLine } from "@/lib/launch.mjs";
import {
  DAY_PRESETS,
  FEASIBILITY_LABEL,
  GOAL_DEFAULTS,
  GOAL_PRESETS,
  fmtGoalUsd,
  isDayPreset,
  isGoalPreset,
  levelById,
  normalizeGoalDays,
  normalizeGoalProfit,
  planGoal,
  sessionMinutesForDays,
  type GoalFix,
  type GoalLevel,
  type GoalLevelId,
} from "@/lib/goal";
import { DEFAULT_SESSION_MINUTES } from "@/lib/session";
import { useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DurationPills } from "./duration-pills.tsx";

export function LaunchSetup() {
  const launchDesk = useFloor((s) => s.launchDesk);
  const storedCash = useFloor((s) => s.startingCash);
  const storedGoal = useFloor((s) => s.goalProfit);
  const storedDays = useFloor((s) => s.goalDays);

  const initialGoal = storedGoal || GOAL_DEFAULTS.goalProfit;
  const initialDays = storedDays || GOAL_DEFAULTS.days;
  const initialCash = storedCash || GOAL_DEFAULTS.capital;

  const [goalProfit, setGoalProfit] = useState(() => normalizeGoalProfit(initialGoal));
  const [days, setDays] = useState(() => normalizeGoalDays(initialDays));
  const [cash, setCash] = useState(initialCash);
  const [levelId, setLevelId] = useState<GoalLevelId>(
    () => planGoal({ capital: initialCash, goalProfit: initialGoal, days: initialDays }).recommended,
  );
  const [levelTouched, setLevelTouched] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(DEFAULT_SESSION_MINUTES);
  const [sessionTouched, setSessionTouched] = useState(false);
  const [goalCustom, setGoalCustom] = useState(() => !isGoalPreset(initialGoal));
  const [daysCustom, setDaysCustom] = useState(() => !isDayPreset(initialDays));

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

  /** One tap turns an out-of-reach ask into a book the desk can describe. */
  const applyFix = (fix: GoalFix) => {
    if (fix.days !== undefined) {
      const next = normalizeGoalDays(fix.days);
      setDays(next);
      setDaysCustom(!isDayPreset(next));
    }
    if (fix.capital !== undefined) setCash(fix.capital);
    if (fix.goalProfit !== undefined) {
      const next = normalizeGoalProfit(fix.goalProfit);
      setGoalProfit(next);
      setGoalCustom(!isGoalPreset(next));
    }
    setLevelTouched(false);
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
              // `step={100}` with `min={1}` made the valid set 1, 101, 201, …,
              // so every preset chip ($1k, $5k, $10k …) failed native
              // validation and the form refused to submit. The copy below
              // promises any amount, so the value must not be stepped.
              step="any"
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
              // Same reason as the goal field: a suggested capital fix must
              // never land on a value the browser then rejects.
              step="any"
              inputMode="decimal"
              value={cash}
              onChange={(e) => setCash(Number(e.target.value) || 0)}
            />
            <p className="text-2xs text-subtle">
              Starting paper cash. Minimum $100. The bot cannot deposit or withdraw.
            </p>
          </div>

          <section
            className={cn(
              "space-y-2 rounded-sm px-3 py-2.5",
              plan.wild
                ? "bg-danger/8 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_35%,transparent)]"
                : "bg-surface-2 shadow-[0_0_0_1px_var(--color-border)]",
            )}
            aria-live="polite"
          >
            <p className="font-display text-micro tracking-[0.12em] text-subtle uppercase">
              What you are asking for
            </p>
            <p className={cn("text-xs", plan.wild ? "font-semibold text-danger" : "text-fg")}>
              {plan.askLine}
            </p>
            <p className="text-2xs text-muted">{plan.needLine}</p>
            <p className="text-2xs text-muted">{plan.aimLine}</p>
            {plan.fixes.length > 0 ? (
              <div className="space-y-1.5 pt-0.5">
                <p className="font-display text-micro tracking-[0.12em] text-subtle uppercase">
                  Bring it in reach
                </p>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {plan.fixes.map((fix) => (
                    <FixCard key={fix.id} fix={fix} onApply={() => applyFix(fix)} />
                  ))}
                </div>
              </div>
            ) : null}
          </section>

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

function FixCard({ fix, onApply }: { fix: GoalFix; onApply: () => void }) {
  return (
    <button
      type="button"
      onClick={onApply}
      className="rounded-xs bg-surface-2 px-2 py-1.5 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[box-shadow,background-color] duration-150 hover:bg-surface-3 hover:shadow-[0_0_0_1px_var(--color-border-strong)]"
    >
      <span className="font-display block text-2xs font-semibold tracking-[0.08em] text-fg uppercase">
        {fix.label}
      </span>
      <span className="mt-0.5 block text-micro leading-snug text-subtle">{fix.detail}</span>
    </button>
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
  const amber = level.feasibility === "stretch";
  const sizePct = (level.sizePct * 100).toFixed(1).replace(/\.0$/, "");
  const stopPct = (level.stopPct * 100).toFixed(1).replace(/\.0$/, "");
  const takePct = (level.takePct * 100).toFixed(1).replace(/\.0$/, "");
  const haltPct = (level.maxDailyLossPct * 100).toFixed(0);
  const aimPct = (level.dailyTargetPct * 100).toFixed(1).replace(/\.0$/, "");

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
            red
              ? "bg-danger/20 text-danger"
              : amber
                ? "bg-warn/15 text-warn"
                : "bg-good/15 text-good",
          )}
        >
          {FEASIBILITY_LABEL[level.feasibility]}
        </span>
      </div>
      <p className="stat-num mt-1 text-sm">
        {fmtGoalUsd(level.ticketUsd)}{" "}
        <span className="text-2xs text-muted">{sizePct}% of capital</span>
      </p>
      <p className="mt-0.5 text-2xs text-muted">
        aims ~{aimPct}%/day · stop {stopPct}% · take {takePct}% · daily halt {haltPct}%
      </p>
      <p className={cn("mt-1 text-2xs", red ? "text-danger" : "text-subtle")}>{level.note}</p>
    </button>
  );
}
