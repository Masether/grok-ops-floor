import { useMemo } from "react";
import { AGENTS, AGENT_BY_ID } from "@/lib/agents";
import { ago } from "@/lib/format";
import { useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function TheTape() {
  const events = useFloor((s) => s.events);
  const recent = events.slice(0, 18);
  const now = Date.now();
  const span = 90_000;
  const t0 = now - span;

  const nodes = useMemo(() => {
    return recent
      .filter((e) => e.ts >= t0)
      .map((e) => {
        const row = AGENTS.findIndex((a) => a.id === e.agent);
        const x = Math.min(0.96, Math.max(0.04, (e.ts - t0) / span));
        return { e, row: row < 0 ? 0 : row, x };
      });
  }, [recent, t0]);

  return (
    /*
     * 320px is the smallest height this panel can honestly draw itself in:
     * 48px head + 12 lanes at 15px + 12px padding + the 64px footer list.
     * At 220px the label column overflowed its 108px slot and ran 84px down
     * into the footer. Adding an agent means adding 15px here.
     */
    <section className="panel min-h-[320px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">The tape</h2>
          <p className="panel-sub">who opened the brief, and who took it next</p>
        </div>
        <span className="stat-num text-micro text-subtle">{events.length}</span>
      </div>
      <div className="relative min-h-0 flex-1 px-2 pt-1 pb-2">
        <div className="grid h-full grid-cols-[56px_1fr] gap-1">
          <ul className="flex flex-col justify-around py-1">
            {AGENTS.map((a) => (
              <li
                key={a.id}
                className="font-display truncate text-micro tracking-[0.1em] uppercase"
                style={{ color: a.color }}
              >
                {a.name}
              </li>
            ))}
          </ul>
          <div className="relative min-h-[140px]">
            {AGENTS.map((a, i) => (
              <div
                key={a.id}
                className="absolute right-0 left-0 border-t border-border/60"
                style={{ top: `${((i + 0.5) / AGENTS.length) * 100}%` }}
              />
            ))}
            <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {nodes.map((n, i) => {
                const next = nodes[i - 1];
                if (!next || !n.e.next) return null;
                const y1 = ((n.row + 0.5) / AGENTS.length) * 100;
                const y2 = ((next.row + 0.5) / AGENTS.length) * 100;
                return (
                  <path
                    key={n.e.id + "p"}
                    d={`M ${n.x * 100} ${y1} C ${n.x * 100 + 8} ${y1}, ${next.x * 100 - 8} ${y2}, ${next.x * 100} ${y2}`}
                    fill="none"
                    stroke={AGENT_BY_ID[n.e.agent]?.color ?? "#8b93a7"}
                    strokeWidth="0.4"
                    opacity="0.45"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            {nodes.map((n) => {
              const y = ((n.row + 0.5) / AGENTS.length) * 100;
              const col = AGENT_BY_ID[n.e.agent]?.color ?? "#8b93a7";
              return (
                <div
                  key={n.e.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${n.x * 100}%`, top: `${y}%` }}
                  title={n.e.title}
                >
                  <span
                    className="block size-2 rounded-full"
                    style={{ background: col, boxShadow: `0 0 8px ${col}` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ul className="max-h-16 space-y-0.5 overflow-y-auto border-t border-border px-3 py-1.5">
        {recent.slice(0, 4).map((e) => (
          <li key={e.id} className="flex items-baseline gap-2 text-2xs">
            <span className="stat-num w-8 shrink-0 text-subtle">{ago(e.ts, now)}</span>
            <span style={{ color: AGENT_BY_ID[e.agent]?.color ?? "#8b93a7" }}>
              {AGENT_BY_ID[e.agent]?.name ?? e.agent}
            </span>
            {e.pair ? (
              <button
                type="button"
                className={cn(
                  "min-h-11 truncate text-left",
                  e.tone === "good" && "text-good",
                  e.tone === "warn" && "text-warn",
                  e.tone === "bad" && "text-danger",
                  e.tone === "info" && "text-muted",
                )}
                onClick={() => {
                  useFloor.getState().setInspectPair(e.pair!);
                }}
              >
                {e.title}
              </button>
            ) : (
              <span
                className={cn(
                  "truncate",
                  e.tone === "good" && "text-good",
                  e.tone === "warn" && "text-warn",
                  e.tone === "bad" && "text-danger",
                  e.tone === "info" && "text-muted",
                )}
              >
                {e.title}
              </span>
            )}
          </li>
        ))}
        {recent.length === 0 ? (
          <li className="text-2xs text-subtle">Tape is quiet — scanner is watching the book.</li>
        ) : null}
      </ul>
    </section>
  );
}
