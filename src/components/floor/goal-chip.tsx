import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/overlay";
import {
  DAY_PRESETS,
  GOAL_PRESETS,
  fmtGoalUsd,
  goalChipLine,
  goalProgressPct,
  normalizeGoalDays,
  normalizeGoalProfit,
} from "@/lib/goal";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

function useGoalMade(): number {
  const desk = useDesk();
  const mode = useFloor((s) => s.mode);
  const startingCash = useFloor((s) => s.startingCash);
  const liveBudget = useFloor((s) => s.liveBudget);
  const base = mode === "live" ? liveBudget : startingCash;
  return desk.equity - base;
}

export function GoalChip() {
  const [open, setOpen] = useState(false);
  const goalProfit = useFloor((s) => s.goalProfit);
  const goalDays = useFloor((s) => s.goalDays);
  const made = useGoalMade();
  const pctThere = goalProgressPct(made, goalProfit);
  const line = goalChipLine({ goalProfit, goalDays, dayPnl: made });
  const tone = goalProfit <= 0 ? undefined : made >= 0 ? "good" : "bad";

  return (
    <>
      <button type="button" className="min-h-11 text-left" onClick={() => setOpen(true)}>
        <div className="min-w-[4.5rem]">
          <div className="font-display text-micro tracking-[0.16em] text-subtle uppercase">Goal</div>
          <div
            className={cn(
              "stat-num max-w-[11rem] truncate text-sm",
              tone === "good" && "text-good",
              tone === "bad" && "text-danger",
            )}
            title={`${line} — tap to edit`}
          >
            {goalProfit > 0
              ? `${fmtGoalUsd(goalProfit)} · ${goalDays > 0 ? `${goalDays}d` : "open"} · ${Math.round(pctThere)}%`
              : "tap to set"}
          </div>
        </div>
      </button>
      <GoalDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function GoalDeskRow({ onEdit }: { onEdit: () => void }) {
  const goalProfit = useFloor((s) => s.goalProfit);
  const goalDays = useFloor((s) => s.goalDays);
  const made = useGoalMade();
  const line = goalChipLine({ goalProfit, goalDays, dayPnl: made });
  const tone = goalProfit <= 0 ? undefined : made >= 0 ? "good" : "bad";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="min-w-0">
        <p className="font-display text-micro tracking-[0.16em] text-subtle uppercase">Goal</p>
        <p
          className={cn(
            "stat-num text-sm",
            tone === "good" && "text-good",
            tone === "bad" && "text-danger",
          )}
        >
          {line}
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onEdit}>
        Edit goal
      </Button>
    </div>
  );
}

export function GoalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const goalProfit = useFloor((s) => s.goalProfit);
  const goalDays = useFloor((s) => s.goalDays);
  const setGoal = useFloor((s) => s.setGoal);
  const [profit, setProfit] = useState(String(goalProfit || 1000));
  const [days, setDays] = useState(String(goalDays));

  function syncFromStore() {
    setProfit(String(useFloor.getState().goalProfit || 1000));
    setDays(String(useFloor.getState().goalDays));
  }

  function save(nextProfit: number, nextDays: number) {
    const goalProfitN = normalizeGoalProfit(nextProfit);
    const goalDaysN = normalizeGoalDays(nextDays);
    setGoal({ goalProfit: goalProfitN, goalDays: goalDaysN });
    toast.message(
      goalProfitN <= 0
        ? "Goal cleared"
        : goalDaysN > 0
          ? `Goal ${fmtGoalUsd(goalProfitN)} in ${goalDaysN} days`
          : `Goal ${fmtGoalUsd(goalProfitN)} · no day limit`,
    );
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) syncFromStore();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogTitle>Target</DialogTitle>
        <DialogDescription>
          How much you want the book to make. Days are optional — pick No limit to run until you
          stop. Same number on the header and the desk. Not a promise.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          <Label>Make</Label>
          <div className="flex flex-wrap gap-1.5">
            {GOAL_PRESETS.map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={Number(profit) === n ? "default" : "outline"}
                onClick={() => setProfit(String(n))}
              >
                {fmtGoalUsd(n)}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            min={0}
            step={100}
            inputMode="decimal"
            value={profit}
            onChange={(e) => setProfit(e.target.value)}
            aria-label="Goal amount in USD"
          />
        </div>

        <div className="mt-4 space-y-3">
          <Label>Window</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_PRESETS.map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={Number(days) === n ? "default" : "outline"}
                onClick={() => setDays(String(n))}
              >
                {n === 0 ? "No limit" : `${n}d`}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            min={0}
            max={365}
            step={1}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="Goal days — 0 means no limit"
          />
          <p className="text-2xs text-subtle">0 days = no deadline. Desk stays 24/7 until you stop.</p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => save(0, 0)}
          >
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => save(Number(profit), Number(days))}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
