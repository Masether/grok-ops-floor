import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OpsShell } from "@/components/floor/ops-shell";
import { AppErrorComponent } from "@/lib/error-component";

export const Route = createFileRoute("/")({
  component: Home,
  errorComponent: AppErrorComponent,
});

function Home() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(true);
  }, []);
  return <OpsShell key={live ? "live" : "paint"} />;
}
