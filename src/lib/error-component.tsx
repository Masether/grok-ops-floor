import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const CRASH_KEY = "ops-floor-crash-at";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem(CRASH_KEY) || 0);
      if (Date.now() - last < 20_000) return;
      sessionStorage.setItem(CRASH_KEY, String(Date.now()));
      const t = window.setTimeout(() => window.location.reload(), 900);
      return () => window.clearTimeout(t);
    } catch {
      /* private mode */
    }
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div>
        <span className="text-danger" aria-hidden="true">
          <TriangleAlert className="mx-auto size-10" strokeWidth={2} />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Floor hitch — reloading</h1>
        <p className="mt-2 max-w-md text-sm break-words text-muted">
          {error.message || "Import failed. Auto-refresh in a second."}
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