import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, YAxis } from "recharts";
import { AGENTS, AGENT_BY_ID } from "@/lib/agents";
import { px, money, moneyFull, pct, qty } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { winRate } from "@/lib/learn";
import { usdOnBook } from "@/lib/specialists";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ReworkQueue() {
  const queue = useFloor((s) => s.queue);
  const count = queue.length;
  return (
    <section className="panel min-h-[180px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">Rework queue</h2>
          <p className="panel-sub">last tickets the floor passed back</p>
        </div>
        <span className="stat-num text-xl text-fg">{count}</span>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {queue.length === 0 ? (
          <li className="text-2xs text-subtle">Queue empty. Playbook is clean.</li>
        ) : (
          queue.slice(0, 8).map((q) => (
            <li key={q.id}>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "font-display text-2xs tracking-[0.12em] uppercase",
                    q.severity === "stall" && "text-danger",
                    q.severity === "reject" && "text-warn",
                    q.severity === "playbook" && "text-info",
                    q.severity === "empty" && "text-muted",
                  )}
                >
                  {q.title}
                </span>
                {q.pair ? (
                  <span className="text-micro text-subtle">{PAIR_BY_ID[q.pair].label}</span>
                ) : null}
              </div>
              <p className="truncate text-micro text-muted">{q.detail}</p>
              <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full"
                  style={{
                    width: `${40 + (q.id.length % 50)}%`,
                    background:
                      q.severity === "stall"
                        ? "var(--color-danger)"
                        : q.severity === "reject"
                          ? "var(--color-warn)"
                          : "var(--color-info)",
                  }}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export function RunnerDeck() {
  const agents = useFloor((s) => s.agents);
  return (
    <section className="panel min-h-[160px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">Runner deck</h2>
          <p className="panel-sub">heat on each desk</p>
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {AGENTS.map((a) => {
          const st = agents[a.id];
          const spark = st?.spark ?? [];
          return (
            <li key={a.id} className="flex items-center gap-2">
              <span
                className="font-display w-16 shrink-0 text-micro tracking-[0.1em] uppercase"
                style={{ color: a.color }}
              >
                {a.name}
              </span>
              <div className="flex flex-1 gap-px">
                {spark.map((v, i) => (
                  <span
                    key={i}
                    className="h-3 flex-1 rounded-xs"
                    style={{ background: a.color, opacity: 0.15 + v * 0.85 }}
                  />
                ))}
              </div>
              <span className="stat-num w-8 text-right text-micro text-subtle">
                {(st?.delayMs ?? 0) | 0}ms
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TokenFlow() {
  const history = useFloor((s) => s.equityHistory);
  const data = history.map((p) => ({
    t: p.t,
    scanner: p.scanner,
    signal: p.signal,
    risk: p.risk,
    runner: p.runner,
  }));
  return (
    <section className="panel min-h-[160px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">Token flow</h2>
          <p className="panel-sub">agent heat on the shift</p>
        </div>
      </div>
      <div className="h-[118px] px-1 pb-1">
        {data.length < 2 ? (
          <div className="grid h-full place-items-center text-2xs text-subtle">
            Flow builds as the desk works
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <YAxis hide domain={[0, 4]} />
              <RTooltip
                contentStyle={{
                  background: "#12141e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 11,
                }}
                labelFormatter={() => "heat"}
              />
              <Area type="monotone" dataKey="scanner" stackId="1" stroke="#ff4d8d" fill="#ff4d8d" fillOpacity={0.55} isAnimationActive={false} />
              <Area type="monotone" dataKey="signal" stackId="1" stroke="#3dffc8" fill="#3dffc8" fillOpacity={0.5} isAnimationActive={false} />
              <Area type="monotone" dataKey="risk" stackId="1" stroke="#ffe14d" fill="#ffe14d" fillOpacity={0.45} isAnimationActive={false} />
              <Area type="monotone" dataKey="runner" stackId="1" stroke="#ff8a3d" fill="#ff8a3d" fillOpacity={0.5} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export function TheDesk() {
  const desk = useDesk();
  const positions = useFloor((s) => s.positions);
  const tickers = useFloor((s) => s.tickers);
  const grokNote = useFloor((s) => s.grokNote);
  const brain = useFloor((s) => s.brain);
  const selfLearn = useFloor((s) => s.selfLearn);
  const mode = useFloor((s) => s.mode);
  const liveBalance = useFloor((s) => s.liveBalance);
  const liveArmed = useFloor((s) => s.liveArmed);
  const wr = winRate(brain);
  const krakenUsd = usdOnBook(liveBalance);
  const rows: { k: string; v: string; tone?: "good" | "bad" }[] = [
    { k: "Equity", v: moneyFull(desk.equity) },
    { k: "Cash", v: money(desk.cash) },
    { k: "Exposure", v: money(desk.exposure) },
    { k: "Unrealized", v: money(desk.unrealized), tone: desk.unrealized >= 0 ? "good" : "bad" },
    { k: "Realized", v: money(desk.realized), tone: desk.realized >= 0 ? "good" : "bad" },
    { k: "Day PnL", v: money(desk.dayPnl), tone: desk.dayPnl >= 0 ? "good" : "bad" },
    { k: "Fills", v: String(desk.fills) },
    { k: "TP / SL", v: `${desk.wins} / ${desk.losses}` },
  ];
  if (mode === "live") {
    rows.splice(2, 0, {
      k: "Kraken USD",
      v: liveBalance ? money(krakenUsd) : "unread",
      tone: krakenUsd >= 15 ? "good" : "bad",
    });
  }
  return (
    <section className="panel min-h-[160px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">The desk</h2>
          <p className="panel-sub">
            {mode === "live"
              ? liveArmed
                ? "live — treasury sizes from Kraken"
                : "live idle — arm to spend the wallet"
              : "paper rehearsal · fund Kraken, then arm live"}
          </p>
        </div>
        <span className="stat-num text-sm text-good">{money(desk.equity)}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-2">
            <span className="text-micro tracking-wide text-subtle uppercase">{r.k}</span>
            <span
              className={cn(
                "stat-num text-2xs",
                r.tone === "good" && "text-good",
                r.tone === "bad" && "text-danger",
              )}
            >
              {r.v}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-micro tracking-[0.14em] text-archivist uppercase">
            Brain {selfLearn ? "on" : "off"}
          </span>
          <span className="stat-num text-2xs text-fg">
            {brain.samples === 0 ? "cold" : `${(wr * 100).toFixed(0)}% · ${brain.samples}`}
          </span>
        </div>
        <p className="mt-1 truncate text-micro text-muted">{brain.lastNote}</p>
        <div className="mt-1.5 flex gap-px">
          {brain.lessons.length === 0
            ? Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="h-2 flex-1 rounded-xs bg-surface-3" />
              ))
            : brain.lessons
                .slice(0, 16)
                .reverse()
                .map((l, i) => (
                  <span
                    key={`${l.ts}-${i}`}
                    className="h-2 flex-1 rounded-xs"
                    title={l.note}
                    style={{ background: l.win ? "var(--color-good)" : "var(--color-danger)" }}
                  />
                ))}
        </div>
        {brain.lessons.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
            {brain.lessons.slice(0, 8).map((l, i) => (
              <li key={`${l.ts}-${i}`} className="flex items-baseline gap-2">
                <span className="font-display shrink-0 text-micro tracking-[0.1em] uppercase">
                  {PAIR_BY_ID[l.pair]?.label ?? l.pair}
                </span>
                <span
                  className={cn(
                    "stat-num w-12 shrink-0 text-right text-micro",
                    l.win ? "text-good" : "text-danger",
                  )}
                >
                  {money(l.pnl)}
                </span>
                <span className="min-w-0 truncate text-micro text-muted">{l.note}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-1.5 flex justify-between text-micro text-subtle">
          <span>RSI {brain.rsiBuy.toFixed(0)}/{brain.rsiSell.toFixed(0)}</span>
          <span>conf {(brain.minConf * 100).toFixed(0)}%</span>
          <span>size {brain.sizeTilt.toFixed(2)}x</span>
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto border-t border-border px-3 py-2">
        {positions.length === 0 ? (
          <li className="text-micro text-subtle">No inventory. Runner is flat.</li>
        ) : (
          positions.map((p) => {
            const mark = tickers[p.pair]?.last ?? p.mark;
            const pnl = (mark - p.entry) * p.qty;
            const pnlPct = ((mark - p.entry) / p.entry) * 100;
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 text-2xs">
                <span className="text-fg">{PAIR_BY_ID[p.pair].label}</span>
                <span className="stat-num text-muted">{qty(p.qty, 4)}</span>
                <span className={cn("stat-num", pnl >= 0 ? "text-good" : "text-danger")}>
                  {money(pnl)} {pct(pnlPct, 2)}
                </span>
              </li>
            );
          })
        )}
      </ul>
      {grokNote ? (
        <p className="border-t border-border px-3 py-2 text-micro whitespace-pre-wrap text-muted">
          {grokNote}
        </p>
      ) : null}
    </section>
  );
}

export function PairStrip() {
  const pairs = useFloor((s) => s.pairs);
  const tickers = useFloor((s) => s.tickers);
  const signals = useFloor((s) => s.signals);
  const inspect = useFloor((s) => s.inspectPair);
  const setInspect = useFloor((s) => s.setInspectPair);
  return (
    <div className="flex gap-2 overflow-x-auto px-1">
      {pairs.map((id) => {
        const t = tickers[id];
        const sig = signals.find((s) => s.pair === id);
        const on = inspect === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setInspect(on ? null : id)}
            className={cn(
              "min-w-[7.5rem] rounded-sm px-2.5 py-1.5 text-left shadow-[0_0_0_1px_var(--color-border)]",
              on && "bg-surface-2",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-2xs tracking-[0.12em] uppercase">
                {PAIR_BY_ID[id].base}
              </span>
              <span className="text-micro text-subtle uppercase">
                {PAIR_BY_ID[id].sleeve === "stock"
                  ? "stk"
                  : PAIR_BY_ID[id].sleeve}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="stat-num text-sm">{t ? px(t.last) : "—"}</span>
              {sig ? (
                <span
                  className={cn(
                    "text-micro uppercase",
                    sig.kind === "buy" && "text-good",
                    sig.kind === "sell" && "text-danger",
                    sig.kind === "hold" && "text-subtle",
                  )}
                >
                  {sig.kind}
                </span>
              ) : null}
            </div>
            {sig ? (
              <div className="flex items-center justify-between gap-2 text-micro text-muted">
                <span>RSI {sig.rsi.toFixed(0)}</span>
                <span className="stat-num">{(sig.confidence * 100).toFixed(0)}%</span>
              </div>
            ) : (
              <div className="text-micro text-subtle">
                {t ? pct(t.changePct, 1) : "waiting"}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { AGENT_BY_ID };
