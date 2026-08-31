import { ago } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function TheWire() {
  const wire = useFloor((s) => s.wire);
  const fearGreed = useFloor((s) => s.fearGreed);
  const inspect = useFloor((s) => s.inspectPair);
  const rows = inspect ? wire.filter((w) => w.pairs.includes(inspect) || w.pairs.length === 0) : wire;

  return (
    <section className="panel min-h-[220px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">The wire</h2>
          <p className="panel-sub">news · names · orgs that move this book</p>
        </div>
        {fearGreed ? (
          <span
            className={cn(
              "stat-num text-lg",
              fearGreed.value >= 60 ? "text-good" : fearGreed.value <= 35 ? "text-danger" : "text-warn",
            )}
          >
            {fearGreed.value}
            <span className="ml-1 font-display text-micro tracking-[0.12em] text-muted uppercase">
              {fearGreed.label}
            </span>
          </span>
        ) : (
          <span className="text-micro text-subtle">F&G —</span>
        )}
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {rows.length === 0 ? (
          <li className="text-2xs text-subtle">Wire is spinning up — headlines land here.</li>
        ) : (
          rows.slice(0, 12).map((w) => (
            <li key={w.id}>
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "font-display text-2xs tracking-[0.12em] uppercase",
                    w.tone === "bull" && "text-good",
                    w.tone === "bear" && "text-danger",
                    w.tone === "neutral" && "text-wire",
                  )}
                >
                  {w.kind}
                </span>
                <span className="text-micro text-subtle">{ago(w.ts)}</span>
              </div>
              {w.url ? (
                <a
                  href={w.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-2xs text-fg hover:underline"
                >
                  {w.title}
                </a>
              ) : (
                <p className="text-2xs text-fg">{w.title}</p>
              )}
              <p className="truncate text-micro text-muted">
                {w.source}
                {w.orgs.length ? ` · ${w.orgs.slice(0, 2).join(", ")}` : ""}
                {w.pairs.length
                  ? ` · ${w.pairs
                      .slice(0, 3)
                      .map((id) => PAIR_BY_ID[id]?.base ?? id)
                      .join(" ")}`
                  : ""}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
