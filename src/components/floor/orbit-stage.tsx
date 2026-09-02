import { useEffect, useRef, useState } from "react";
import { AGENT_BY_ID } from "@/lib/agents";
import { onPulse, type FloorPulse } from "@/lib/bus";
import { moneyFull } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { GUILDS, SWARM_SIZE } from "@/lib/swarm";
import { IDLE_DEBATE } from "@/lib/coordinate";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AgentGlyph, GrokCore } from "./glyphs";
import { SwarmCanvas } from "./swarm-canvas";

type PulseDraw = FloorPulse & { id: number; born: number };

export function OrbitStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const orbRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const pulses = useRef<PulseDraw[]>([]);
  const [nowTick, setNowTick] = useState(0);
  const agents = useFloor((s) => s.agents);
  const selected = useFloor((s) => s.selectedAgent);
  const selectAgent = useFloor((s) => s.selectAgent);
  const floorOpen = useFloor((s) => s.floorOpen);
  const inspectPair = useFloor((s) => s.inspectPair);
  const pairs = useFloor((s) => s.pairs);
  const tickers = useFloor((s) => s.tickers);
  const stage = useFloor((s) => s.stage);
  const desk = useDesk();
  const swarm = useFloor((s) => s.swarm);
  const debate = swarm.debate ?? IDLE_DEBATE;
  const grokNote = useFloor((s) => s.grokNote);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    return onPulse((p) => {
      pulses.current.push({ ...p, id: Math.random(), born: performance.now() });
    });
  }, []);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const loop = (t: number) => {
      if (typeof document !== "undefined" && document.hidden) {
        raf = 0;
        return;
      }
      const el = wrapRef.current;
      const svg = svgRef.current;
      if (!el || !svg) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const w = el.clientWidth;
      const h = el.clientHeight;
      const cx = w / 2;
      const cy = h / 2 + 4;
      const base = Math.min(w * 0.42, h * 0.4, 220);
      const spin = reduced ? 0 : t / 11000;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      posRef.current.dispatcher = { x: cx, y: cy };

      const ringOf: Record<string, number> = {
        price: 0.38,
        liquidity: 0.52,
        arb: 0.66,
        inventory: 0.8,
        risk: 0.94,
      };
      const pts: { id: string; x: number; y: number }[] = [];
      const lines: string[] = [];
      GUILDS.forEach((g, i) => {
        const theta = spin + (i / GUILDS.length) * Math.PI * 2 - Math.PI / 2;
        const rx = base * ringOf[g.id]!;
        const ry = rx * 0.55;
        const x = cx + Math.cos(theta) * rx;
        const y = cy + Math.sin(theta) * ry;
        posRef.current[g.lead] = { x, y };
        pts.push({ id: g.lead, x, y });
        const node = orbRefs.current[g.lead];
        if (node) {
          node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        }
        lines.push(
          `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${g.color}33" stroke-width="1"/>`,
        );
      });

      const now = performance.now();
      pulses.current = pulses.current.filter((p) => now - p.born < 900);
      for (const p of pulses.current) {
        const from = posRef.current[p.from] ?? posRef.current.dispatcher;
        const to = posRef.current[p.to] ?? posRef.current.dispatcher;
        if (!from || !to) continue;
        const u = (now - p.born) / 900;
        const x = from.x + (to.x - from.x) * u;
        const y = from.y + (to.y - from.y) * u;
        const col = p.color ?? AGENT_BY_ID[p.from]?.color ?? "#8b93a7";
        lines.push(
          `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${col}" stroke-width="1.4" opacity="${1 - u}"/>`,
        );
        lines.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="${col}" opacity="${1 - u * 0.2}"/>`);
      }
      svg.innerHTML = lines.join("");
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setNowTick((n) => n + 1);
    }, 800);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const pair = inspectPair ?? pairs[0];
  const ticker = pair ? tickers[pair] : undefined;
  void nowTick;

  return (
    <section className="panel relative h-full min-h-[280px] overflow-hidden lg:min-h-[340px]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 48%, rgb(77 184 255 / 0.07), transparent 42%), radial-gradient(rgb(232 237 245 / 0.09) 0.6px, transparent 0.7px)",
          backgroundSize: "auto, 22px 22px",
        }}
      />
      <div className="relative z-10 flex items-start justify-between px-3 pt-2">
        <div>
          <div className="panel-kicker">The swarm</div>
          <p className="stat-num mt-1 text-2xs text-muted">
            {swarm.pending
              ? `${swarm.reported}/${SWARM_SIZE} in · ping`
              : `${SWARM_SIZE} agents · ${debate.sourcesLive}/${debate.sourcesTotal} sources${swarm.rttMs ? ` · ${swarm.rttMs}ms` : ""}`}
          </p>
          <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-5">
            {debate.rounds.map((r) => (
              <li key={r.role} className="min-w-0">
                <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
                  {r.role}
                </div>
                <div
                  className={cn(
                    "stat-num truncate text-2xs",
                    r.role === "challenge" || r.kind === "sell"
                      ? "text-danger"
                      : r.kind === "buy"
                        ? "text-good"
                        : "text-muted",
                  )}
                  title={r.note}
                >
                  {r.kind.toUpperCase()}
                  {r.role === "challenge" && debate.dissent ? ` · ${debate.dissent.bots}` : ""}
                </div>
              </li>
            ))}
          </ol>
          <ul className="mt-2 flex flex-wrap gap-1">
            {GUILDS.map((g) => {
              const st = swarm.guilds[g.id];
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    className="font-display flex min-h-11 items-center gap-1.5 px-1.5 text-micro font-semibold tracking-[0.12em] uppercase"
                    style={{ color: g.color }}
                    title={st?.note ?? g.role}
                    onClick={() => selectAgent(selected === g.lead ? null : g.lead)}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: g.color, opacity: 0.45 + (st?.heat ?? 0.2) * 0.55 }}
                    />
                    {g.name} {st?.reported ?? 0}/{g.count}
                    {st?.rttMs ? ` · ${st.rttMs}ms` : swarm.pending ? " · …" : ""}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="text-right">
          <div className="panel-kicker text-subtle">
            {floorOpen ? "Grok live" : "Halted"} · {stage}
          </div>
          {pair && ticker ? (
            <button
              type="button"
              className="mt-2 min-h-11 text-right"
              onClick={() => useFloor.getState().setInspectPair(pair)}
            >
              <div className="font-display text-2xs tracking-[0.14em] text-muted uppercase">
                {PAIR_BY_ID[pair].label}
              </div>
              <div className="stat-num text-lg text-fg">{ticker.last.toLocaleString()}</div>
              <div
                className={cn(
                  "stat-num text-2xs",
                  ticker.changePct >= 0 ? "text-good" : "text-danger",
                )}
              >
                {ticker.changePct >= 0 ? "+" : ""}
                {ticker.changePct.toFixed(2)}%
              </div>
            </button>
          ) : (
            <div className="mt-2 text-2xs text-subtle">waiting on tape</div>
          )}
          <button
            type="button"
            className="mt-3 min-h-11 text-right"
            onClick={() => useFloor.getState().setDeskOpen(true)}
          >
            <div className="font-display text-2xs tracking-[0.14em] text-muted uppercase">
              Paper book
            </div>
            <div
              className={cn(
                "stat-num text-lg",
                desk.dayPnl > 0 ? "text-good" : desk.dayPnl < 0 ? "text-danger" : "text-fg",
              )}
            >
              {moneyFull(desk.equity)}
            </div>
            <div className="stat-num text-2xs text-subtle">
              Day {desk.dayPnl >= 0 ? "+" : ""}
              {moneyFull(desk.dayPnl)} · Free {moneyFull(desk.cash)}
            </div>
            <div className="stat-num mt-1 text-micro text-subtle">
              {desk.openPositions} open · {desk.fills} fills
            </div>
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="absolute inset-0">
        <SwarmCanvas swarm={swarm} reduced={reduced} />
        <svg ref={svgRef} className="absolute inset-0 size-full" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <GrokCore size={96} />
        </div>
        {GUILDS.map((g) => {
          const st = agents[g.lead];
          const heat = Math.max(st?.heat ?? 0.15, swarm.guilds[g.id]?.heat ?? 0.2);
          const on = selected === g.lead || heat > 0.55;
          const shape = AGENT_BY_ID[g.lead]?.shape ?? "pulse";
          return (
            <button
              key={g.id}
              ref={(n) => {
                orbRefs.current[g.lead] = n;
              }}
              type="button"
              onClick={() => selectAgent(selected === g.lead ? null : g.lead)}
              className="absolute top-0 left-0 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ willChange: "transform" }}
              aria-label={`${g.name} ${g.role}`}
            >
              <span
                className="grid size-11 place-items-center rounded-full"
                style={{
                  background: `radial-gradient(circle, ${g.color}33, transparent 70%)`,
                  boxShadow: on ? `0 0 18px ${g.color}` : `0 0 8px ${g.color}55`,
                  transform: `scale(${0.92 + heat * 0.18})`,
                }}
              >
                <AgentGlyph shape={shape} color={g.color} size={22} />
              </span>
              <span
                className="font-display mt-0.5 hidden text-micro font-semibold tracking-[0.14em] uppercase sm:block"
                style={{ color: g.color }}
              >
                {g.name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="absolute right-3 bottom-2 left-3 flex items-end justify-between">
        <div className="max-w-[60%]">
          {selected ? (
            <p className="text-2xs text-muted">
              <span style={{ color: AGENT_BY_ID[selected]?.color ?? "#8b93a7" }}>
                {AGENT_BY_ID[selected]?.name ?? selected}
              </span>
              {" · "}
              {AGENT_BY_ID[selected]?.role ?? ""}
              {" · "}
              {agents[selected]?.lastAction ?? "on desk"}
            </p>
          ) : (
            <p className="text-2xs text-subtle">
              {grokNote ?? swarm.grok}
            </p>
          )}
        </div>
        <div className="font-display text-micro tracking-[0.16em] text-subtle uppercase">
          GROK
        </div>
      </div>
    </section>
  );
}
