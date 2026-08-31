import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OpsShell } from "@/components/floor/ops-shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <div className="text-center">
          <div className="font-display text-lg tracking-[0.16em] text-fg uppercase">
            Grok Ops Floor
          </div>
          <p className="mt-1 text-2xs tracking-[0.14em] text-subtle uppercase">Opening the desk</p>
        </div>
      </div>
    );
  }
  return <OpsShell />;
}
