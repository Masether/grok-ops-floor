import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { startEngine, stopEngine } from "@/lib/engine";
import { useFloor } from "@/lib/store";
import { TooltipProvider } from "@/components/ui/overlay";
import { ChartsBubble } from "./charts-bubble.tsx";
import { DeskBubble } from "./desk-bubble.tsx";
import { FundingRail } from "./funding-rail.tsx";
import { HeaderBar } from "./header-bar.tsx";
import { LaunchSetup } from "./launch-setup.tsx";
import { OrbitStage } from "./orbit-stage.tsx";
import { SettingsPanel } from "./settings-panel.tsx";
import { PairStrip, ReworkQueue, RunnerDeck, TheDesk, TokenFlow } from "./side-panels.tsx";
import { TheTape } from "./the-tape.tsx";
import { TheWire } from "./the-wire.tsx";

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
        {/*
         * The floor wants to be one fixed, non-scrolling screen, but the panels
         * below add up to ~1200px of intrinsic minimum height. On anything
         * shorter (a 900px-tall laptop) `overflow-hidden` here did not shrink
         * them — it just let them collide, and the orbit panel drew straight
         * over the tape. Scroll instead of overlap; on a tall display
         * everything still fits and no scrollbar appears.
         */}
        <main
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:p-3"
          aria-hidden={boot && !launched}
        >
          <FundingRail />
          {/*
           * This wrapper must carry the same floor as the panel it holds.
           * With only `lg:min-h-0` it collapsed to ~39px while OrbitStage kept
           * its own `lg:min-h-[340px]`, so the panel overflowed its parent and
           * the following rows were laid out underneath it.
           */}
          <div className="min-h-[260px] lg:min-h-[340px] lg:flex-1">
            <OrbitStage />
          </div>
          <PairStrip />
          {/*
           * An explicit `min-h` replaces a flex item's automatic min-content
           * floor, so a row that claims less than the panels inside it gets
           * shrunk under them and the next row is drawn into it. Keep this at
           * the tallest panel in the row — TheTape, at 320px.
           */}
          <div className="grid min-h-[320px] gap-2 lg:grid-cols-3 lg:overflow-hidden">
            <TheTape />
            <TheWire />
            <ReworkQueue />
          </div>
          {/* Tallest panel in this row is 160px, so 180px has room to spare. */}
          <div className="grid min-h-[180px] gap-2 lg:grid-cols-3 lg:overflow-hidden">
            <RunnerDeck />
            <TokenFlow />
            <TheDesk />
          </div>
        </main>
        <SettingsPanel />
        <ChartsBubble />
        <DeskBubble />
        {boot && !launched ? <LaunchSetup /> : null}
        <Toaster
          theme="dark"
          position="bottom-right"
          visibleToasts={3}
          gap={8}
          offset={16}
          mobileOffset={{ bottom: 16, right: 12, left: 12 }}
          style={{ zIndex: 90 }}
          toastOptions={{
            style: {
              background: "#12141e",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e8edf5",
              fontSize: "0.875rem",
            },
            classNames: {
              toast: "trade-toast",
              title: "font-display tracking-wide text-sm",
              description: "text-xs text-muted",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
