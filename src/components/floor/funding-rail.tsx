import { useState } from "react";
import { toast } from "sonner";
import { scanLiveTape } from "@/lib/engine";
import { usdOnBook } from "@/lib/specialists";
import { ensurePaperDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LIVE_STEPS = [
  { id: "fund", n: "01", title: "Deposit", sub: "USD on the venue" },
  { id: "keys", n: "02", title: "API keys", sub: "Query + orders" },
  { id: "arm", n: "03", title: "Arm live", sub: "USD from the wallet" },
  { id: "run", n: "04", title: "Auto desk", sub: "300 agents · 24/7" },
] as const;

const PAPER_STEPS = [
  { id: "capital", n: "01", title: "Paper cash", sub: "play money · no wallet" },
  { id: "risk", n: "02", title: "Risk %", sub: "ticket / stop / take" },
  { id: "start", n: "03", title: "Desk running", sub: "24/7 paper until you stop" },
  { id: "venue", n: "04", title: "Attach venue", sub: "optional · live later" },
] as const;

export function FundingRail() {
  const mode = useFloor((s) => s.mode);
  const keys = useFloor((s) => s.keys);
  const keysOk = useFloor((s) => s.keysOk);
  const liveArmed = useFloor((s) => s.liveArmed);
  const autoTrade = useFloor((s) => s.autoTrade);
  const floorOpen = useFloor((s) => s.floorOpen);
  const launched = useFloor((s) => s.launched);
  const startingCash = useFloor((s) => s.startingCash);
  const liveBalance = useFloor((s) => s.liveBalance);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const usd = usdOnBook(liveBalance);
  const [demoBusy, setDemoBusy] = useState(false);

  const funded = Boolean(liveBalance) && usd >= 15;
  const keyed = Boolean(keys.apiKey && keys.apiSecret) && keysOk !== false;
  const armed = mode === "live" && liveArmed;
  const running = launched && floorOpen && autoTrade;

  const paperDone = [
    launched && startingCash >= 100,
    launched,
    running,
    keysOk === true,
  ];
  const liveDone = [funded, keyed, armed, running && armed];
  const steps = mode === "live" ? LIVE_STEPS : PAPER_STEPS;
  const done = mode === "live" ? liveDone : paperDone;
  const next = done.findIndex((d) => !d);

  return (
    <section className="panel shrink-0">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
        <div>
          <h2 className="panel-kicker">Funding path</h2>
          <p className="panel-sub">
            {mode === "paper"
              ? launched
                ? "Paper is on, 24/7. Winning closes auto-sweep into the bot wallet (tap Wallet). Attach an exchange only when you go live."
                : "Start paper with play money. Wallet and Kraken keys stay optional until you arm live."
              : armed
                ? `Treasury reading the venue · ${usd >= 15 ? `$${usd.toFixed(0)} USD` : "wallet thin"}`
                : "Live book selected. Verify you're human, attach keys, then arm. The desk runs 24/7."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!launched ? (
            <Button
              size="sm"
              variant="good"
              onClick={() => {
                if (ensurePaperDesk()) {
                  toast.success("Paper desk is on — $10k play money. 24/7.");
                }
              }}
            >
              Start paper desk
            </Button>
          ) : (
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
          )}
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Desk settings
          </Button>
        </div>
      </div>
      <ol className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {steps.map((step, i) => {
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
