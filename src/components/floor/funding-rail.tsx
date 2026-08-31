import { useState } from "react";
import { toast } from "sonner";
import { scanLiveTape } from "@/lib/engine";
import { usdOnBook } from "@/lib/specialists";
import { useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STEPS = [
  { id: "fund", n: "01", title: "Deposit", sub: "USD on Kraken" },
  { id: "keys", n: "02", title: "API keys", sub: "Query + orders" },
  { id: "arm", n: "03", title: "Arm live", sub: "spend the wallet" },
  { id: "run", n: "04", title: "Auto desk", sub: "eleven agents work" },
] as const;

export function FundingRail() {
  const mode = useFloor((s) => s.mode);
  const keys = useFloor((s) => s.keys);
  const keysOk = useFloor((s) => s.keysOk);
  const liveArmed = useFloor((s) => s.liveArmed);
  const autoTrade = useFloor((s) => s.autoTrade);
  const floorOpen = useFloor((s) => s.floorOpen);
  const liveBalance = useFloor((s) => s.liveBalance);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const usd = usdOnBook(liveBalance);
  const [demoBusy, setDemoBusy] = useState(false);

  const funded = Boolean(liveBalance) && usd >= 15;
  const keyed = Boolean(keys.apiKey && keys.apiSecret) && keysOk !== false;
  const armed = mode === "live" && liveArmed;
  const running = floorOpen && autoTrade;
  const done = [funded, keyed, armed, running && armed];
  const next = done.findIndex((d) => !d);

  return (
    <section className="panel shrink-0">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
        <div>
          <h2 className="panel-kicker">Funding path</h2>
          <p className="panel-sub">
            {mode === "paper"
              ? "Paper aims to grow the fake book on live Kraken: core compounds, heat only if it's rising, xStocks if listed. Can still lose."
              : armed
                ? `Treasury reading Kraken · ${usd >= 15 ? `$${usd.toFixed(0)} USD` : "wallet thin"}`
                : "Live book selected. Arm the runner to spend Kraken cash."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="good"
            disabled={demoBusy}
            onClick={() => {
              void (async () => {
                setDemoBusy(true);
                try {
                  const res = await scanLiveTape();
                  if (res.acted) toast.success(res.note);
                  else toast.message(res.note);
                } finally {
                  setDemoBusy(false);
                }
              })();
            }}
          >
            {demoBusy ? "Scanning tape…" : "Scan live tape"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Desk settings
          </Button>
        </div>
      </div>
      <ol className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {STEPS.map((step, i) => {
          const on = done[i];
          const current = next === i;
          return (
            <li
              key={step.id}
              className={cn(
                "bg-surface px-3 py-2.5",
                current && "bg-surface-2",
              )}
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
