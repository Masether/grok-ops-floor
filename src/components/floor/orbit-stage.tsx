import { useEffect, useRef, useState } from "react";
import { AGENTS, AGENT_BY_ID } from "@/lib/agents";
import { onPulse, type FloorPulse } from "@/lib/bus";
import { PAIR_BY_ID } from "@/lib/kraken";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AgentGlyph, GrokCore } from "./glyphs";

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
  const handoff = useFloor((s) => s.handoff);
  const floorOpen = useFloor((s) => s.floorOpen);
  const inspectPair = useFloor((s) => s.inspectPair);
  const pairs = useFloor((s) => s.pairs);
  const tickers = useFloor((s) => s.tickers);
  const stage = useFloor((s) => s.stage);
  const desk = useDesk();

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
      const rx = Math.min(w * 0.38, 280);
      const ry = Math.min(h * 0.32, 150);
      const spin = reduced ? 0 : t / 9000;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

      const pts: { id: string; x: number; y: number }[] = [];
      for (const a of AGENTS) {
        const theta = spin + (a.orbit / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(theta) * rx;
        const y = cy + Math.sin(theta) * ry;
        posRef.current[a.id] = { x, y };
        pts.push({ id: a.id, x, y });
        const node = orbRefs.current[a.id];
        if (node) {
          node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        }
      }

      const lines: string[] = [];
      lines.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(232,237,245,0.12)" stroke-width="1"/>`,
      );
      lines.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.62}" ry="${ry * 0.62}" fill="none" stroke="rgba(232,237,245,0.05)" stroke-width="1"/>`,
      );
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const c = pts[(i + 2) % pts.length]!;
        lines.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(232,237,245,0.08)" stroke-width="1"/>`,
        );
        lines.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="rgba(232,237,245,0.04)" stroke-width="1"/>`,
        );
      }
      const now = performance.now();
      pulses.current = pulses.current.filter((p) => now - p.born < 900);
      for (const p of pulses.current) {
        const from = posRef.current[p.from];
        const to = posRef.current[p.to];
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
    const id = window.setInterval(() => setNowTick((n) => n + 1), 800);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, []);

  const pair = inspectPair ?? pairs[0];
  const ticker = pair ? tickers[pair] : undefined;
  const active = (handoff ? AGENT_BY_ID[handoff.to] : AGENT_BY_ID.scanner) ?? AGENT_BY_ID.scanner;
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
          <div className="panel-kicker">The floor</div>
          <ul className="mt-2 hidden flex-col gap-0.5 xl:flex">
            {AGENTS.map((a) => {
              const st = agents[a.id];
              return (
                <li key={a.id} className="flex items-center gap-2">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: a.color, opacity: 0.4 + (st?.heat ?? 0.15) * 0.6 }}
                  />
                  <span
                    className="font-display w-20 text-micro font-semibold tracking-[0.12em] uppercase"
                    style={{ color: a.color }}
                  >
                    {a.name}
                  </span>
                  <span className="stat-num text-micro text-subtle">{st?.handled ?? 0}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="text-right">
          <div className="panel-kicker text-subtle">
            {floorOpen ? "Loop live" : "Halted"} · {stage}
          </div>
          {pair && ticker ? (
            <button
              type="button"
              className="mt-2 text-right"
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
          <div className="stat-num mt-3 text-micro text-subtle">
            {desk.openPositions} open · {desk.fills} fills
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="absolute inset-0">
        <svg ref={svgRef} className="absolute inset-0 size-full" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <GrokCore size={88} />
        </div>
        {AGENTS.map((a) => {
          const st = agents[a.id];
          const heat = st?.heat ?? 0.15;
          const on = selected === a.id || heat > 0.55;
          return (
            <button
              key={a.id}
              ref={(n) => {
                orbRefs.current[a.id] = n;
              }}
              type="button"
              onClick={() => selectAgent(selected === a.id ? null : a.id)}
              className="absolute top-0 left-0 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ willChange: "transform" }}
              aria-label={a.name}
            >
              <span
                className="grid size-9 place-items-center rounded-full sm:size-11"
                style={{
                  background: `radial-gradient(circle, ${a.color}33, transparent 70%)`,
                  boxShadow: on ? `0 0 18px ${a.color}` : `0 0 8px ${a.color}55`,
                  transform: `scale(${0.92 + heat * 0.18})`,
                }}
              >
                <AgentGlyph shape={a.shape} color={a.color} size={22} />
              </span>
              <span
                className="font-display mt-0.5 hidden text-micro font-semibold tracking-[0.14em] uppercase sm:block"
                style={{ color: a.color }}
              >
                {a.name}
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
              {active.name} on the desk
              {handoff ? ` · ${AGENT_BY_ID[handoff.from]?.name ?? handoff.from} → ${active.name}` : ""}
            </p>
          )}
        </div>
        <div className="font-display text-micro tracking-[0.16em] text-subtle uppercase">
          {active.name}
        </div>
      </div>
    </section>
  );
}
