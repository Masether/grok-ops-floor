import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runLilyRose } from "@/lib/lilyrose-brief";
import { useLily } from "@/lib/lily-store";
import { useFloor } from "@/lib/store";

export function LilyRoseBubble() {
  const open = useLily((s) => s.lilyOpen);
  const setOpen = useLily((s) => s.setLilyOpen);
  const brief = useLily((s) => s.lilyBrief);
  const setBrief = useLily((s) => s.setLilyBrief);
  const busy = useLily((s) => s.lilyBusy);
  const setBusy = useLily((s) => s.setLilyBusy);
  const keys = useFloor((s) => s.keys);
  const mode = useFloor((s) => s.mode);
  const liveBudget = useFloor((s) => s.liveBudget);
  const [extra, setExtra] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await runLilyRose({
        data: {
          fundConnected: Boolean(keys.apiKey && keys.apiSecret),
          paper: mode !== "live",
          budgetUsd: liveBudget || 200,
          extra: extra.trim() || undefined,
        },
      });
      if (res.ok) {
        setBrief(res.brief);
        toast.message(`LilyRose ${res.brief.action} · ${res.brief.products.length} products`);
      }
    } catch (err) {
      toast.message(err instanceof Error ? err.message : "LilyRose cycle failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-end bg-[#05060a]/80 p-2 sm:place-items-center sm:p-4"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lily-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-[#0c0e16] shadow-[0_0_0_1px_var(--color-border-strong),0_24px_80px_rgb(0_0_0/0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div>
            <p className="panel-kicker" id="lily-title">
              LilyRose
            </p>
            <p className="panel-sub">assign → execute → verify</p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Close LilyRose" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex gap-2 border-b border-border px-3 py-2">
          <input
            className="min-h-10 flex-1 rounded-md border border-border bg-transparent px-2 text-sm"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="optional extra query"
            aria-label="Extra LilyRose query"
          />
          <Button type="button" disabled={busy} onClick={() => void run()}>
            {busy ? "…" : "Run cycle"}
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {!brief ? (
            <p className="text-2xs text-subtle">One cycle. One brief. No regenerate.</p>
          ) : (
            <>
              <p className="text-2xs text-muted">
                {brief.id} · {brief.action} · {(brief.confidence * 100).toFixed(0)}% · bait {brief.killedBait}
              </p>
              <p className="text-sm text-fg">{brief.verdict}</p>
              <ul className="space-y-2">
                {brief.products.map((p) => (
                  <li key={p.name}>
                    <p className="font-display text-2xs tracking-[0.12em] uppercase">{p.name}</p>
                    <p className="truncate text-micro text-muted">{p.claims[0]}</p>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1">
                {brief.paths.map((n) => (
                  <li key={n.path} className="text-micro text-subtle">
                    <span className="font-display tracking-[0.12em] uppercase">{n.path}</span> {n.note}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
