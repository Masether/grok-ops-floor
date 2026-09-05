import { Component, useEffect, useLayoutEffect, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "sonner";
import { applyRemoteBook, loadProfile, parseBook, persistDeskBook } from "@/lib/profile";
import { bootFloorFromDisk, ensureLiveDesk, flushFloorPersist, hydrateFloor, useFloor } from "@/lib/store";
import { krakenKeysOn } from "@/lib/live-budget";
import { loadDeskMods, modOn } from "@/lib/desk-mods";
import { type PlaybookId } from "@/lib/playbook";
import { dropWakeLock, holdWakeLock } from "@/lib/wake-lock";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppErrorComponent } from "@/lib/error-component";
import { TooltipProvider } from "@/components/ui/overlay";
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

function openLiveNow() {
  useFloor.getState().setHumanVerified(true);
  const mods = loadDeskMods();
  const books = (["scalp", "grid", "dca"] as PlaybookId[]).filter((id) => mods[id]);
  useFloor.setState({
    playbooks: books.length ? books : ["grid", "dca", "scalp"],
    selfLearn: mods.brain,
    autoSweep: mods.compound,
    brain: { ...useFloor.getState().brain, enabled: mods.brain },
  });
  ensureLiveDesk();
  const s = useFloor.getState();
  if (s.launched && !s.floorOpen) s.setFloorOpen(true);
  if (krakenKeysOn(s.keys) && !s.liveArmed) s.setLiveArmed(true);
}

class FloorCatch extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("floor crash", error, info.componentStack);
  }
  render() {
    if (this.state.error) return <AppErrorComponent error={this.state.error} />;
    return this.props.children;
  }
}

export function OpsShell() {
  const floorOpen = useFloor((s) => s.floorOpen);
  const liveArmed = useFloor((s) => s.liveArmed);
  const { user } = useCurrentUserState();

  useLayoutEffect(() => {
    bootFloorFromDisk();
    openLiveNow();
  }, []);

  useEffect(() => {
    let stop = () => {};
    const id = window.setTimeout(() => {
      void import("@/lib/engine").then((m) => {
        stop = m.startEngine();
      });
    }, 0);
    return () => {
      window.clearTimeout(id);
      stop();
    };
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
      if (!krakenKeysOn(useFloor.getState().keys)) return;
      try {
        const m = await import("@/lib/engine");
        await m.refreshTreasury();
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
    const pull = () => {
      const s = useFloor.getState();
      if (s.liveArmed && krakenKeysOn(s.keys)) {
        persistDeskBook();
        return;
      }
      void loadProfile()
        .then((p) => {
          if (!p?.bookJson) return;
          const book = parseBook(p.bookJson);
          if (book) applyRemoteBook(book);
        })
        .catch(() => {});
    };
    pull();
    const id = window.setInterval(pull, 12_000);
    return () => window.clearInterval(id);
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
    const id = window.setInterval(save, 8_000);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [user]);

  return (
    <TooltipProvider>
      <FloorCatch>
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
              {modOn("wire") ? <TheWire /> : null}
              <ReworkQueue />
            </div>
            <div className="grid min-h-[240px] gap-2 lg:grid-cols-3">
              <RunnerDeck />
              <TokenFlow />
              <TheDesk />
            </div>
          </main>
          <SettingsPanel />
          {modOn("charts") ? <ChartsBubble /> : null}
          {modOn("deskui") ? <DeskBubble /> : null}
          {modOn("brain") ? <BrainBubble /> : null}
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
      </FloorCatch>
    </TooltipProvider>
  );
}
