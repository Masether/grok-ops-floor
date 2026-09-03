import { createFileRoute } from "@tanstack/react-router";
import { OpsShell } from "@/components/floor/ops-shell";
import { AppErrorComponent } from "@/lib/error-component";

export const Route = createFileRoute("/")({
  component: Home,
  errorComponent: AppErrorComponent,
});

function Home() {
  return <OpsShell />;
}
