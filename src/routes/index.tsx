import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OpsShell } from "@/components/floor/ops-shell";
import { AppErrorComponent } from "@/lib/error-component";

export const Route = createFileRoute("/")({
  component: Home,
  errorComponent: AppErrorComponent,
});

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-fg">
        <p className="font-display tracking-[0.16em] text-micro uppercase">ShellOut Bot</p>
      </div>
    );
  }
  return <OpsShell />;
}
