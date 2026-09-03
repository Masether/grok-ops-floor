import { useEffect, useLayoutEffect } from "react";
import { Toaster } from "sonner";
import { startEngine, stopEngine, refreshTreasury } from "@/lib/engine";
import { applyRemoteBook, loadProfile, parseBook, persistDeskBook } from "@/lib/profile";
import { ensureLiveDesk, flushFloorPersist, hydrateFloor, useFloor } from "@/lib/store";
import { dropWakeLock, holdWakeLock } from "@/lib/wake-lock";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { TooltipProvider } from "@/components/ui/overlay";
import { ChartsBubble } from "./charts-bubble";
import { BrainBubble } from "./brain-bubble";
import { DeskBubble } from "./desk-bubble";
import { FundingRail } from "./funding-rail";
import { LiveStatusBar } from "./live-status";
import { SessionBoard } from "./session-board";
import { HeaderBar } from "./header-bar";
import { OrbitStage } from "./orbit-stage";
import { SettingsPanel } from "./settings-panel";
import { PairStrip, ReworkQueue, RunnerDeck, TheDesk, TokenFlow } from "./side-panels";
import { TheTape } from "./the-tape";
import { TheWire } from "./the-wire";

function openLiveNow() {
  ensureLiveDesk();
  const s = useFloor.getState();
  if (s.launched && !s.floorOpen) s.setFloorOpen(true);
}

export function OpsShell() {
  const launched = useFloor((s) => s.launched);
  const floorOpen = useFloor((s) => s.floorOpen);
  const liveArmed = useFloor((s) => s.liveArmed);
  const { user } = useCurrentUserState();

  useLayoutEffect(() => {
    return () => stopEngine();
  }, []);

  useEffect(() => {
    if (!floorOpen && !liveArmed) {
      void dropWakeLock();
      return;
    }
    void holdWakeLock();
    const onVis = () => {
      if (document.visibilityState === "visible") void holdWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void dropWakeLock();
    };
  }, [floorOpen, liveArmed]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await hydrateFloor();
      } catch {
        /* first visit */
      }
      if (!alive) return;
      openLiveNow();
      const keyed = Boolean(useFloor.getState().keys.apiKey && useFloor.getState().keys.apiSecret);
      if (!keyed) {
        useFloor.getState().setSettingsOpen(true);
      }
      startEngine();
      try {
        if (keyed) await refreshTreasury();
      } catch {
        /* tape warms on its own */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadProfile()
      .then((p) => {
        if (!p) return;
        const s = useFloor.getState();
        if (p.fundingCash >= 0) {
          useFloor.setState({ fundingCash: p.fundingCash });
        }
        if (p.pairs.length) s.setPairs(p.pairs as typeof s.pairs);
        if (p.risk) s.setRisk(p.risk);
        if (p.bookJson) {
          const book = parseBook(p.bookJson);
          if (book) applyRemoteBook(book);
        }
        openLiveNow();
      })
      .catch(() => {
        /* guest */
      });
  }, [user]);

  useEffect(() => {
    const save = () => {
      persistDeskBook();
      flushFloorPersist();
    };
    const onVis = () => {
      if (document.hidden) save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(save, 20_000);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [user]);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col overflow-x-hidden bg-bg text-fg">
        <HeaderBar />
        <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:p-3">
          <LiveStatusBar />
          <SessionBoard />
          <FundingRail />
          <div className="min-h-[260px] lg:min-h-0 lg:flex-1">
            <OrbitStage />
          </div>
          <PairStrip />
          <div className="grid min-h-[200px] gap-2 lg:grid-cols-3">
            <TheTape />
            <TheWire />
            <ReworkQueue />
          </div>
          <div className="grid min-h-[240px] gap-2 lg:grid-cols-3">
            <RunnerDeck />
            <TokenFlow />
            <TheDesk />
          </div>
        </main>
        <SettingsPanel />
        <ChartsBubble />
        <DeskBubble />
        <BrainBubble />
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
