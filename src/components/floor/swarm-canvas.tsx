import { useEffect, useRef } from "react";
import { GUILD_BY_ID, GUILDS, seedSwarm, SWARM_SPIN, type GuildId, type SwarmSnap } from "@/lib/swarm";

const BOTS = seedSwarm();

export function SwarmCanvas({
  swarm,
  reduced,
}: {
  swarm: SwarmSnap;
  reduced: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const swarmRef = useRef(swarm);
  swarmRef.current = swarm;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let frame = 0;
    const loop = (t: number) => {
      if (typeof document !== "undefined" && document.hidden) {
        raf = 0;
        return;
      }
      frame += 1;
      if (frame % 2 === 1) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const parent = canvas.parentElement;
      const swarmNow = swarmRef.current;
      if (!parent) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2 + 4;
      const base = Math.min(w * 0.42, h * 0.4, 220);
      const rings: Record<GuildId, number> = {
        price: 0.38,
        liquidity: 0.52,
        arb: 0.66,
        inventory: 0.8,
        risk: 0.94,
      };
      ctx.lineWidth = 1;
      for (const g of GUILDS) {
        const rx = base * rings[g.id];
        const ry = rx * 0.55;
        ctx.strokeStyle = `${g.color}22`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const spin = reduced ? 0 : t * SWARM_SPIN;
      for (const b of BOTS) {
        const g = GUILD_BY_ID[b.guild];
        const snap = swarmNow.guilds[b.guild];
        const reported = snap?.reported ?? g.count;
        const inSwarm = b.slot < reported;
        const heat = inSwarm ? (snap?.heat ?? 0.2) : 0.08;
        const rx = base * rings[b.guild] * b.j;
        const ry = rx * 0.55;
        const theta = b.a + spin * (0.7 + b.w * 400) + (reduced ? 0 : t * b.w);
        const x = cx + Math.cos(theta) * rx;
        const y = cy + Math.sin(theta) * ry;
        ctx.fillStyle = g.color;
        ctx.globalAlpha = inSwarm ? 0.28 + heat * 0.55 : 0.08;
        ctx.beginPath();
        ctx.arc(x, y, inSwarm && heat > 0.7 ? 1.7 : 1.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" aria-hidden />;
}
