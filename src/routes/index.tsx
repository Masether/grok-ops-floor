import { useEffect, useState, type ComponentType } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [Shell, setShell] = useState<ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    void import("@/components/floor/ops-shell").then((m) => {
      if (alive) setShell(() => m.OpsShell);
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
  return <Shell />;
}
