import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { clockHms, money, moneyFull } from "@/lib/format";
import { sessionProfit } from "@/lib/desk-pnl";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SessionBoard() {
  const desk = useDesk();
  const history = useFloor((s) => s.equityHistory);
  const shiftStartedAt = useFloor((s) => s.shiftStartedAt);
  const lastEngineAt = useFloor((s) => s.lastEngineAt);
  const orders = useFloor((s) => s.orders);
  const liveArmed = useFloor((s) => s.liveArmed);
  const mode = useFloor((s) => s.mode);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const live = mode === "live" || liveArmed;
  const profit = sessionProfit(desk.realized, desk.unrealized);
  const startEq = history[0]?.equity ?? desk.equity - profit;
  const running = clockHms(now - (shiftStartedAt || now));
  const stale = lastEngineAt > 0 && now - lastEngineAt > 120_000;
  const fills = orders.filter((o) => o.status === "filled" && (live ? o.mode === "live" : o.mode !== "live"));
  const takes = fills.filter((o) => o.side === "sell" && (o.pnl ?? 0) > 0).length;
  const stops = fills.filter((o) => o.side === "sell" && (o.pnl ?? 0) < 0).length;
  const data = history.map((p) => ({
    t: p.t,
    equity: p.equity,
    pnl: p.equity - startEq,
    open: p.unrealized,
  }));

  return (
    <section className="panel overflow-hidden">
      {stale ? (
        <p className="bg-danger/15 px-3 py-2 text-2xs text-danger">
          Desk was asleep — last heartbeat {clockHms(now - lastEngineAt)} ago. The bot only
          trades while this tab is awake. Lid closed = no tickets.
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-3 py-2.5">
        <div>
          <p className="font-display text-micro tracking-[0.16em] text-subtle uppercase">Running</p>
          <p className="stat-num text-2xl tabular-nums">{running}</p>
          <p className="text-micro text-muted">
            last tick {lastEngineAt ? clockHms(Math.max(0, now - lastEngineAt)) : "—"} ago
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-micro tracking-[0.16em] text-subtle uppercase">
            P&L this run
          </p>
          <p
            className={cn(
              "stat-num text-2xl",
              profit > 0 ? "text-good" : profit < 0 ? "text-danger" : "text-fg",
            )}
          >
            {profit >= 0 ? "+" : ""}
            {moneyFull(profit)}
          </p>
          <p className="stat-num text-micro text-subtle">
            closed {money(desk.realized)} · open {money(desk.unrealized)} · {takes} take · {stops}{" "}
            stop
          </p>
        </div>
      </div>
      <div className="h-[160px] px-1 pb-1">
        {data.length < 2 ? (
          <div className="grid h-full place-items-center text-2xs text-subtle">
            Chart fills as the desk works. Check here when you wake.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <XAxis
                dataKey="t"
                tickFormatter={(t) => clockHms(Number(t) - (shiftStartedAt || Number(t)))}
                tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => money(Number(v))}
                tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
                width={56}
                domain={["auto", "auto"]}
              />
              <RTooltip
                contentStyle={{
                  background: "#12141e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 11,
                }}
                labelFormatter={(t) => clockHms(Number(t) - (shiftStartedAt || Number(t)))}
                formatter={(value, name) => [money(Number(value)), String(name)]}
              />
              <Area
                type="monotone"
                dataKey="pnl"
                name="P&L"
                stroke="var(--color-accent)"
                fill="color-mix(in oklab, var(--color-accent) 22%, transparent)"
                strokeWidth={1.6}
              />
              <Area
                type="monotone"
                dataKey="open"
                name="Open"
                stroke="var(--color-good)"
                fill="transparent"
                strokeWidth={1}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
