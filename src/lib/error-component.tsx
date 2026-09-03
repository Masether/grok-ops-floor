import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { reloadOnce } from "./crash-reload.ts";

export function AppErrorComponent({ error }: Partial<ErrorComponentProps> & { error?: Error }) {
  useEffect(() => {
    const t = window.setTimeout(() => reloadOnce(), 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div>
        <span className="text-danger" aria-hidden="true">
          <TriangleAlert className="mx-auto size-10" strokeWidth={2} />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Floor hitch — reloading</h1>
        <p className="mt-2 max-w-md text-sm break-words text-muted">
          {error?.message || "Something broke. Auto-refresh in a second."}
        </p>
        <button
          type="button"
          className="mt-4 min-h-11 rounded-sm bg-surface px-4 text-sm shadow-[0_0_0_1px_var(--color-border-strong)]"
          onClick={() => window.location.reload()}
        >
          Reload now
        </button>
      </div>
    </main>
  );
}
