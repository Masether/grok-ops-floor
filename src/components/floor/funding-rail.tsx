import { useFloor } from "@/lib/store";
import { liveSleeve } from "@/lib/live-budget";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LIVE_STEPS = [
  { id: "fund", n: "01", title: "Deposit $200", sub: "USD on Kraken" },
  { id: "keys", n: "02", title: "API keys", sub: "Query + orders" },
  { id: "arm", n: "03", title: "Arm live", sub: "budget cap on" },
  { id: "run", n: "04", title: "Auto desk", sub: "scans every 8s" },
] as const;

export function FundingRail() {
  const keys = useFloor((s) => s.keys);
  const keysOk = useFloor((s) => s.keysOk);
  const liveArmed = useFloor((s) => s.liveArmed);
  const autoTrade = useFloor((s) => s.autoTrade);
  const floorOpen = useFloor((s) => s.floorOpen);
  const launched = useFloor((s) => s.launched);
  const liveBalance = useFloor((s) => s.liveBalance);
  const liveBudget = useFloor((s) => s.liveBudget);
  const positions = useFloor((s) => s.positions);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const sleeve = liveSleeve({ liveBudget, liveBalance, positions });

  const funded = sleeve.usd >= 15;
  const keyed = Boolean(keys.apiKey && keys.apiSecret) && keysOk !== false;
  const armed = liveArmed;
  const running = launched && floorOpen && autoTrade;
  const done = [funded, keyed, armed, running && armed];
  const next = done.findIndex((d) => !d);

  return (
    <section className="panel shrink-0">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
        <div>
          <h2 className="panel-kicker">Funding path</h2>
          <p className="panel-sub">
            {armed
              ? `Live · budget $${sleeve.budget.toFixed(0)} · auto every 8s`
              : "Deposit $200 USD on Kraken, attach Query + Orders keys. Auto-trade is on."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
          Desk settings
        </Button>
      </div>
      <ol className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {LIVE_STEPS.map((step, i) => {
          const on = done[i];
          const current = next === i;
          return (
            <li
              key={step.id}
              className={cn("bg-surface px-3 py-2.5", current && "bg-surface-2")}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "font-display text-micro tracking-[0.16em] uppercase",
                    on ? "text-good" : current ? "text-treasury" : "text-subtle",
                  )}
                >
                  {step.n} {step.title}
                </span>
                <span
                  className={cn(
                    "stat-num text-micro",
                    on ? "text-good" : current ? "text-treasury" : "text-subtle",
                  )}
                >
                  {on ? "done" : current ? "now" : "wait"}
                </span>
              </div>
              <p className="mt-0.5 text-micro text-muted">{step.sub}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
