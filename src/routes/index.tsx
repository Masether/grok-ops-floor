import { createFileRoute } from "@tanstack/react-router";
import { OpsShell } from "@/components/floor/ops-shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <OpsShell />;
}
