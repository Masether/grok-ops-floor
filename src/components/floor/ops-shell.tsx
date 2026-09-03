import { useEffect, useLayoutEffect } from "react";
import { Toaster, toast } from "sonner";
import { CandlestickChart, Power, Settings2, Wallet } from "lucide-react";
import { haltLive, startEngine, stopEngine, refreshTreasury, scanLiveTape } from "@/lib/engine";
import { applyRemoteBook, loadProfile, parseBook, persistDeskBook } from "@/lib/profile";
import { bootFloorFromDisk, ensureLiveDesk, flushFloorPersist, hydrateFloor, useFloor } from "@/lib/store";
import { dropWakeLock, holdWakeLock } from "@/lib/wake-lock";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { TooltipProvider } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { ChartsBubble } from "./charts-bubble.tsx";
import { BrainBubble } from "./brain-bubble.tsx";
import { DeskBubble } from "./desk-bubble.tsx";
import { FundingRail } from "./funding-rail.tsx";
import { LiveStatusBar } from "./live-status.tsx";
import { SessionBoard } from "./session-board.tsx";
import { HeaderBar } from "./header-bar.tsx";
import { OrbitStage } from "./orbit-stage.tsx";
import { SettingsPanel } from "./settings-panel.tsx";
import { PairStrip, ReworkQueue, RunnerDeck, TheDesk, TokenFlow } from "./side-panels.tsx";
import { TheTape } from "./the-tape.tsx";
import { TheWire } from "./the-wire.tsx";
import { InstallAppButton } from "./install-app.tsx";

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
    bootFloorFromDisk();
    openLiveNow();
    startEngine();
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
        if (s.liveArmed || (s.keys.apiKey && s.keys.apiSecret)) return;
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
        <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 pb-16 lg:p-3">
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
        <FloorDock />
        <SettingsPanel />
        <ChartsBubble />
        <DeskBubble />
        <BrainBubble />
        <Toaster
          theme="dark"
          position="bottom-right"
          visibleToasts={3}
          gap={8}
          offset={72}
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

function FloorDock() {
  const deskOpen = useFloor((s) => s.deskOpen);
  const chartsOpen = useFloor((s) => s.chartsOpen);
  const setDeskOpen = useFloor((s) => s.setDeskOpen);
  const setDeskTab = useFloor((s) => s.setDeskTab);
  const setChartsOpen = useFloor((s) => s.setChartsOpen);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  return (
    <nav
      className="relative z-[300] flex shrink-0 gap-1.5 border-t border-border bg-bg p-2 pointer-events-auto"
      aria-label="ShellOut Bot controls"
    >
      <Button
        type="button"
        className="min-h-11 flex-1"
        onClick={() => {
          void scanLiveTape()
            .then((r) => toast.message(r.note))
            .catch((err) => toast.message(err instanceof Error ? err.message : "scan failed"));
        }}
      >
        Scan
      </Button>
      <Button
        type="button"
        variant={deskOpen ? "default" : "outline"}
        className="min-h-11 flex-1"
        onClick={() => {
          setDeskTab("blotter");
          setDeskOpen(true);
        }}
      >
        <Wallet className="size-3.5" />
        Desk
      </Button>
      <Button
        type="button"
        variant={chartsOpen ? "default" : "outline"}
        className="min-h-11 flex-1"
        onClick={() => setChartsOpen(true)}
      >
        <CandlestickChart className="size-3.5" />
        Charts
      </Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setSettingsOpen(true)}>
        <Settings2 className="size-3.5" />
      </Button>
      <InstallAppButton compact />
      <Button type="button" variant="live" className="min-h-11" aria-label="Kill switch" onClick={() => void haltLive()}>
        <Power className="size-3.5" />
      </Button>
    </nav>
  );
}

