import { Component, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { armCrashReload, reloadOnce } from "@/lib/crash-reload";

export const Route = createFileRoute("/")({
  component: Home,
  errorComponent: AppErrorComponent,
});

class FloorBound extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, _info: ErrorInfo) {
    void err;
    window.setTimeout(() => reloadOnce(), 600);
  }
  render() {
    if (this.state.err) return <AppErrorComponent error={this.state.err} />;
    return this.props.children;
  }
}

function Home() {
  const [Shell, setShell] = useState<ComponentType | null>(null);
  useEffect(() => armCrashReload(), []);
  useEffect(() => {
    let alive = true;
    void import("@/components/floor/ops-shell")
      .then((m) => {
        if (alive) setShell(() => m.OpsShell);
      })
      .catch(() => {
        window.setTimeout(() => reloadOnce(), 400);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!Shell) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        <p className="font-display tracking-[0.16em] text-micro uppercase">Opening the floor…</p>
      </div>
    );
  }
  return (
    <FloorBound>
      <Shell />
    </FloorBound>
  );
}