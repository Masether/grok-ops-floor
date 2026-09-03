import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { askBrain } from "@/lib/grok-brief";
import { uid } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { localBrainReply } from "@/lib/learn";
import { studyBook } from "@/lib/engine";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function BrainBubble() {
  const open = useFloor((s) => s.brainOpen);
  const setOpen = useFloor((s) => s.setBrainOpen);
  const brain = useFloor((s) => s.brain);
  const chat = useFloor((s) => s.brainChat);
  const push = useFloor((s) => s.pushBrainChat);
  const pairs = useFloor((s) => s.pairs);
  const mode = useFloor((s) => s.mode);
  const liveArmed = useFloor((s) => s.liveArmed);
  const signals = useFloor((s) => s.signals);
  const desk = useDesk();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const memories = Object.values(brain.assetMemory).filter((m) => {
    if (!m) return false;
    if (mode === "live" || liveArmed) return pairs.includes(m.pair);
    return true;
  });
  const last = signals[0];

  const ask = async (prompt: string) => {
    if (!prompt || busy) return;
    setQ("");
    push({ id: uid("bm"), role: "user", text: prompt, ts: Date.now() });
    setBusy(true);
    const context = JSON.stringify({
      rsi: [brain.rsiBuy, brain.rsiSell],
      wr: brain.samples ? brain.wins / brain.samples : 0,
      samples: brain.samples,
      sizeTilt: brain.sizeTilt,
      memory: memories.map((m) => ({
        pair: m!.pair,
        wr: m!.wr,
        setup: m!.bestSetup,
        since: m!.since,
      })),
      last: last
        ? { pair: last.pair, kind: last.kind, rsi: last.rsi, reason: last.reason }
        : null,
      equity: desk.equity,
      pairs,
    });
    try {
      const res = await askBrain({ data: { prompt, context } });
      const text =
        res.ok && res.text
          ? res.text
          : localBrainReply(prompt, brain, {
              equity: desk.equity,
              pairs: pairs.map((id) => PAIR_BY_ID[id].base).join(" · "),
              lastSignal: last?.reason,
            });
      push({ id: uid("bm"), role: "brain", text, ts: Date.now() });
    } catch {
      push({
        id: uid("bm"),
        role: "brain",
        text: localBrainReply(prompt, brain, {
          equity: desk.equity,
          pairs: pairs.map((id) => PAIR_BY_ID[id].base).join(" · "),
          lastSignal: last?.reason,
        }),
        ts: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    await ask(q.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-end bg-bg/45 p-2 backdrop-blur-[3px] sm:place-items-center sm:p-4"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="brain-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-surface/80 shadow-[0_0_0_1px_var(--color-border-strong),0_24px_80px_rgb(0_0_0/0.45)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div>
            <p className="panel-kicker" id="brain-title">
              Brain
            </p>
            <p className="panel-sub">Always learning. Rapid desk chat.</p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Close brain" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
          <span className="stat-num text-2xs text-muted">
            {brain.samples
              ? `${Math.round((brain.wins / brain.samples) * 100)}% on ${brain.samples}`
              : "cold"}
          </span>
          <span className="stat-num text-2xs text-subtle">
            RSI {brain.rsiBuy.toFixed(0)}/{brain.rsiSell.toFixed(0)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void studyBook().then((r) => toast.message(r.note));
            }}
          >
            Walk history
          </Button>
        </div>
        <ul className="max-h-28 space-y-1 overflow-y-auto border-b border-border px-3 py-2">
          {memories.length === 0 ? (
            <li className="text-2xs text-subtle">Hit Learn to walk daily candles on the book.</li>
          ) : (
            memories.map((m) => (
              <li key={m!.pair} className="flex items-baseline justify-between gap-2 text-2xs">
                <span className="font-display tracking-[0.1em] uppercase">
                  {PAIR_BY_ID[m!.pair]?.base ?? m!.pair}
                </span>
                <span className={cn("stat-num", m!.wr >= 0.5 ? "text-good" : "text-danger")}>
                  {(m!.wr * 100).toFixed(0)}%
                </span>
                <span className="truncate text-subtle">{m!.bestSetup}</span>
              </li>
            ))
          )}
        </ul>
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {["What's hot?", "When to buy?", "RSI bands"].map((chip) => (
            <Button
              key={chip}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void ask(chip)}
            >
              {chip}
            </Button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {chat.length === 0 ? (
            <p className="text-2xs text-subtle">Ask when to buy, what’s hot, or what RSI it wants.</p>
          ) : (
            chat.map((m) => (
              <p
                key={m.id}
                className={cn(
                  "text-2xs",
                  m.role === "user" ? "text-muted" : "text-fg",
                )}
              >
                <span className="font-display tracking-[0.12em] text-subtle uppercase">
                  {m.role === "user" ? "You" : "Brain"}
                </span>{" "}
                {m.text}
              </p>
            ))
          )}
        </div>
        <form className="flex gap-2 border-t border-border px-3 py-2" onSubmit={(e) => void send(e)}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask the brain"
            aria-label="Ask the brain"
          />
          <Button type="submit" disabled={busy || !q.trim()}>
            {busy ? "…" : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
