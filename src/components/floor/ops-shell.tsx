import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { startEngine, stopEngine } from "@/lib/engine";
import { useFloor } from "@/lib/store";
import { TooltipProvider } from "@/components/ui/overlay";
import { FundingRail } from "./funding-rail";
import { HeaderBar } from "./header-bar";
import { LaunchSetup } from "./launch-setup";
import { OrbitStage } from "./orbit-stage";
import { SettingsPanel } from "./settings-panel";
import { PairStrip, ReworkQueue, RunnerDeck, TheDesk, TokenFlow } from "./side-panels";
import { TheTape } from "./the-tape";
import { TheWire } from "./the-wire";

export function OpsShell() {
  const [boot, setBoot] = useState(false);
  const launched = useFloor((s) => s.launched);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await useFloor.persist.rehydrate();
      } catch {
        /* first visit */
      }
      if (cancelled) return;
      setBoot(true);
      startEngine();
    })();
    return () => {
      cancelled = true;
      stopEngine();
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-bg text-fg lg:h-dvh lg:overflow-hidden">
        <HeaderBar />
        <main
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:overflow-hidden lg:p-3"
          aria-hidden={boot && !launched}
        >
          <FundingRail />
          <div className="min-h-[260px] lg:min-h-0 lg:flex-1">
            <OrbitStage />
          </div>
          <PairStrip />
          <div className="grid min-h-[200px] gap-2 lg:grid-cols-3 lg:overflow-hidden">
            <TheTape />
            <TheWire />
            <ReworkQueue />
          </div>
          <div className="grid min-h-[180px] gap-2 lg:grid-cols-3 lg:overflow-hidden">
            <RunnerDeck />
            <TokenFlow />
            <TheDesk />
          </div>
        </main>
        <SettingsPanel />
        {boot && !launched ? <LaunchSetup /> : null}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#12141e",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e8edf5",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
