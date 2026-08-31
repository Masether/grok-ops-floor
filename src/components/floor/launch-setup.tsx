import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Slider } from "@/components/ui/field";
import {
  LAUNCH_DEFAULTS,
  clampLaunch,
  launchPreviewLine,
} from "@/lib/launch.mjs";
import { useFloor } from "@/lib/store";

export function LaunchSetup() {
  const launchDesk = useFloor((s) => s.launchDesk);
  const [cash, setCash] = useState(LAUNCH_DEFAULTS.startingCash);
  const [sizePct, setSizePct] = useState(LAUNCH_DEFAULTS.sizePct);
  const [stopPct, setStopPct] = useState(LAUNCH_DEFAULTS.stopPct);
  const [takePct, setTakePct] = useState(LAUNCH_DEFAULTS.takePct);
  const [maxDailyLossPct, setMaxDailyLossPct] = useState(
    LAUNCH_DEFAULTS.maxDailyLossPct,
  );
  const [maxPositions, setMaxPositions] = useState(LAUNCH_DEFAULTS.maxPositions);

  const payload = useMemo(
    () =>
      clampLaunch({
        startingCash: cash,
        sizePct,
        stopPct,
        takePct,
        maxDailyLossPct,
        maxPositions,
      }),
    [cash, sizePct, stopPct, takePct, maxDailyLossPct, maxPositions],
  );
  const preview = launchPreviewLine(payload);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-bg/85 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-title"
    >
      <div className="panel w-full max-w-lg">
        <div className="panel-head">
          <div>
            <p className="panel-kicker" id="launch-title">
              Ops Floor
            </p>
            <p className="panel-sub">Set capital and risk, then the desk runs on its own.</p>
          </div>
        </div>
        <form
          className="space-y-5 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            launchDesk(payload);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="launch-cash">Paper deposit / starting capital (USD)</Label>
            <Input
              id="launch-cash"
              type="number"
              min={100}
              step={100}
              value={cash}
              onChange={(e) => setCash(Number(e.target.value) || 0)}
            />
            <p className="text-2xs text-subtle">Minimum $100. Paper cash — the bot cannot deposit or withdraw.</p>
          </div>

          <PercentRow
            label={`Size per ticket ${(payload.sizePct * 100).toFixed(1)}% of capital`}
            value={sizePct}
            min={0.005}
            max={0.08}
            step={0.005}
            onChange={setSizePct}
          />
          <PercentRow
            label={`Stop loss ${(payload.stopPct * 100).toFixed(1)}% of capital`}
            value={stopPct}
            min={0.005}
            max={0.05}
            step={0.005}
            onChange={setStopPct}
          />
          <PercentRow
            label={`Take profit ${(payload.takePct * 100).toFixed(1)}% of capital`}
            value={takePct}
            min={0.008}
            max={0.08}
            step={0.005}
            onChange={setTakePct}
          />
          <PercentRow
            label={`Max daily loss ${(payload.maxDailyLossPct * 100).toFixed(0)}% of capital`}
            value={maxDailyLossPct}
            min={0.01}
            max={0.15}
            step={0.01}
            onChange={setMaxDailyLossPct}
          />
          <PercentRow
            label={`Max open positions ${payload.maxPositions}`}
            value={maxPositions}
            min={1}
            max={6}
            step={1}
            onChange={(v) => setMaxPositions(Math.round(v))}
          />

          <p className="text-2xs text-muted">{preview}</p>

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

function PercentRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-2xs text-muted">
        <span>{label}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}
