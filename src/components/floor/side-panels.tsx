import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, YAxis } from "recharts";
import { AGENTS, AGENT_BY_ID } from "@/lib/agents";
import { pctOfCapital, fillLeg, fillWhy } from "@/lib/desk-pnl";
import { px, money, moneyFull, pct, qty, ago, clockHms } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { PAIR_BY_ID, getPair } from "@/lib/kraken";
import { winRate } from "@/lib/learn";
import { deskIsLive } from "@/lib/live-budget";
import { usdOnBook } from "@/lib/specialists";
import { useDesk, useFloor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ReworkQueue() {
  const queue = useFloor((s) => s.queue);
  const orders = useFloor((s) => s.orders);
  const signals = useFloor((s) => s.signals);
  const events = useFloor((s) => s.events);
  const rows: { id: string; title: string; detail: string; tone: "stall" | "reject" | "playbook" | "empty" | "good"; pair?: string; ts: number }[] = [];
  for (const q of queue) {
    rows.push({
      id: q.id,
      title: q.title,
      detail: q.detail,
      tone: q.severity,
      pair: q.pair,
      ts: q.ts,
    });
  }
  for (const o of orders) {
    if (o.status === "queued") continue;
    rows.push({
      id: o.id,
      title: `${o.status === "filled" ? (o.side === "buy" ? "IN" : "OUT") : o.status.toUpperCase()} ${getPair(o.pair)?.label ?? o.pair}`,
      detail: `${fillWhy(o.reason)}${o.pnl != null ? ` · ${money(o.pnl)}` : ""}`,
      tone: o.status === "filled" ? (o.side === "buy" ? "good" : "reject") : o.status === "rejected" ? "stall" : "playbook",
      pair: o.pair,
      ts: o.ts,
    });
  }
  for (const sig of signals.slice(0, 12)) {
    rows.push({
      id: sig.id,
      title: `${sig.kind.toUpperCase()} ${getPair(sig.pair)?.label ?? sig.pair}`,
      detail: `${sig.reason} · ${(sig.confidence * 100).toFixed(0)}%`,
      tone: sig.kind === "buy" ? "good" : sig.kind === "sell" ? "reject" : "playbook",
      pair: sig.pair,
      ts: sig.ts,
    });
  }
  if (rows.length === 0) {
    for (const e of events.slice(0, 8)) {
      rows.push({
        id: e.id,
        title: e.title,
        detail: e.detail,
        tone: e.tone === "bad" ? "stall" : e.tone === "warn" ? "reject" : e.tone === "good" ? "good" : "playbook",
        pair: e.pair,
        ts: e.ts,
      });
    }
  }
  rows.sort((a, b) => b.ts - a.ts);
  const seen = new Set<string>();
  const uniq = rows.filter((r) => {
    const k = `${r.title}|${r.pair ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
  return (
    <section className="panel min-h-[180px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">Rework queue</h2>
          <p className="panel-sub">holds, rejects, and tickets the floor just worked</p>
        </div>
        <span className="stat-num text-xl text-fg">{uniq.length}</span>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {uniq.length === 0 ? (
          <li className="text-2xs text-subtle">Waiting on the first scan. Tap Scan on the dock.</li>
        ) : (
          uniq.map((q) => (
            <li key={q.id}>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "font-display text-2xs tracking-[0.12em] uppercase",
                    q.tone === "stall" && "text-danger",
                    q.tone === "reject" && "text-warn",
                    q.tone === "playbook" && "text-info",
                    q.tone === "good" && "text-good",
                    q.tone === "empty" && "text-muted",
                  )}
                >
                  {q.title}
                </span>
                {q.pair ? (
                  <span className="text-micro text-subtle">{getPair(q.pair)?.label ?? q.pair}</span>
                ) : null}
              </div>
              <p className="truncate text-micro text-muted">{q.detail}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export function RunnerDeck() {
  const agents = useFloor((s) => s.agents);
  const lastEngineAt = useFloor((s) => s.lastEngineAt);
  const shiftStartedAt = useFloor((s) => s.shiftStartedAt);
  const now = useNow();
  const tickAgo = lastEngineAt ? clockHms(Math.max(0, now - lastEngineAt)) : "—";
  const running = clockHms(now - (shiftStartedAt || now));
  return (
    <section className="panel min-h-[160px]">
      <div className="panel-head">
        <div>
          <h2 className="panel-kicker">Runner deck</h2>
          <p className="panel-sub">
            running {running} · last tick {tickAgo} ago
          </p>
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
              <span className="stat-num w-10 text-right text-micro text-subtle">
                {st?.status === "working" ? "on" : st?.status === "halted" ? "off" : "idle"}
              </span>
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
                /*
                 * Heat is a 0..1 intensity, so without a formatter recharts
                 * printed the raw float (0.43749999999999994). Show it as a
                 * whole percent. Not `pct()` from lib/format — that prefixes a
                 * "+" and expects an already-scaled number, both wrong here.
                 */
                formatter={(value, name) => [
                  `${Math.round(Number(value) * 100)}%`,
                  String(name).toUpperCase(),
                ]}
              />
              <Area
                type="monotone"
                dataKey="scanner"
                stackId="1"
                stroke="#ff4d8d"
                fill="#ff4d8d"
                fillOpacity={0.55}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="signal"
                stackId="1"
                stroke="#3dffc8"
                fill="#3dffc8"
                fillOpacity={0.5}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="risk"
                stackId="1"
                stroke="#ffe14d"
                fill="#ffe14d"
                fillOpacity={0.45}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="runner"
                stackId="1"
                stroke="#ff8a3d"
                fill="#ff8a3d"
                fillOpacity={0.5}
                isAnimationActive={false}
              />
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
  const liveArmed = useFloor((s) => s.liveArmed);
  const liveBalance = useFloor((s) => s.liveBalance);
  const startingCash = useFloor((s) => s.startingCash);
  const liveBudget = useFloor((s) => s.liveBudget);
  const history = useFloor((s) => s.equityHistory);
  const orders = useFloor((s) => s.orders);
  const signals = useFloor((s) => s.signals);
  const setDeskOpen = useFloor((s) => s.setDeskOpen);
  const wr = winRate(brain);
  const live = deskIsLive({ mode, liveArmed, liveBalance });
  const krakenUsd = usdOnBook(liveBalance);
  const cap = live ? liveBudget : startingCash > 0 ? startingCash : desk.equity;
  const liveFills = orders.filter((o) => o.status === "filled");
  const liveLessons =
    liveFills.length > 0
      ? brain.lessons.filter((l) => liveFills.some((o) => o.pair === l.pair) || positions.some((p) => p.pair === l.pair))
      : brain.lessons;
  const liveWr =
    liveFills.filter((o) => o.side === "sell").length > 0
      ? liveFills.filter((o) => o.side === "sell" && (o.pnl ?? 0) > 0).length /
        liveFills.filter((o) => o.side === "sell").length
      : wr;
  const lastFill = liveFills[0];
  const lastSig = signals[0];
  const liveNote = lastFill
    ? `${lastFill.side === "sell" ? "OUT" : "IN"} ${getPair(lastFill.pair)?.label ?? lastFill.pair} · ${fillWhy(lastFill.reason)} · ${money(lastFill.pnl ?? (lastFill.fillPrice ?? lastFill.price) * lastFill.qty)}`
    : lastSig
      ? `${lastSig.kind.toUpperCase()} ${getPair(lastSig.pair)?.label ?? lastSig.pair} · ${lastSig.reason}`
      : "";
  const staleBrain = /no inventory|runner is flat/i.test(brain.lastNote);
  const eqPct = pctOfCapital(desk.equity - cap, cap);
  const unrlPct = pctOfCapital(desk.unrealized, cap);
  const realPct = pctOfCapital(desk.realized, cap);
  const dayPct = pctOfCapital(desk.dayPnl, cap);
  const toneOf = (n: number): "good" | "bad" | undefined =>
    n > 0 ? "good" : n < 0 ? "bad" : undefined;
  const spark = history.slice(-24);
  const sparkMin = spark.length ? Math.min(...spark.map((p) => p.equity), cap) : cap;
  const sparkMax = spark.length ? Math.max(...spark.map((p) => p.equity), cap) : cap;
  const sparkSpan = Math.max(sparkMax - sparkMin, 1);
  return (
    <section className="panel flex min-h-[280px] flex-col overflow-hidden">
      <div className="panel-head">
        <button
          type="button"
          className="min-h-11 min-w-0 text-left"
          onClick={() => setDeskOpen(true)}
        >
          <span className="panel-kicker">The desk</span>
          <p className="panel-sub">
            Same dollars as Kraken. In and out on this book.
          </p>
        </button>
        <span
          className={cn(
            "stat-num text-lg",
            eqPct > 0 ? "text-good" : eqPct < 0 ? "text-danger" : "text-muted",
          )}
        >
          {moneyFull(desk.equity)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-2 sm:grid-cols-4">
        <BookStat k="Start" v={moneyFull(cap)} />
        <BookStat k="Free" v={moneyFull(desk.cash)} />
        <BookStat k="In lots" v={moneyFull(desk.exposure)} />
        <BookStat
          k="Day"
          v={`${moneyFull(desk.dayPnl)} ${pct(dayPct, 1)}`}
          tone={toneOf(desk.dayPnl)}
        />
      </div>
      {spark.length >= 2 ? (
        <div className="flex h-8 items-end gap-px border-b border-border px-3 py-1.5" aria-hidden>
          {spark.map((p, i) => (
            <span
              key={`${p.t}-${i}`}
              className="min-w-px flex-1 rounded-xs"
              style={{
                height: `${12 + ((p.equity - sparkMin) / sparkSpan) * 18}px`,
                background:
                  p.equity >= cap ? "var(--color-good)" : "var(--color-danger)",
                opacity: 0.35 + (i / spark.length) * 0.65,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-border px-3 py-2">
        <BookStat
          k="Unrealized"
          v={`${money(desk.unrealized)} ${pct(unrlPct, 1)}`}
          tone={toneOf(desk.unrealized)}
        />
        <BookStat
          k="Realized"
          v={`${money(desk.realized)} ${pct(realPct, 1)}`}
          tone={toneOf(desk.realized)}
        />
        <BookStat k="Fills" v={String(desk.fills)} />
        <BookStat k="TP / SL" v={`${desk.wins} / ${desk.losses}`} />
        {live ? (
          <BookStat
            k="Kraken USD"
            v={liveBalance ? money(krakenUsd) : "unread"}
            tone={krakenUsd >= 15 ? "good" : "bad"}
          />
        ) : null}
      </div>
      <div className="min-h-[132px] flex-1 overflow-y-auto border-b border-border px-3 py-2">
        <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">In and out</p>
        <ul className="mt-1.5 space-y-1">
          {(() => {
            const bookPos = live ? positions.filter((p) => p.mode === "live") : positions;
            const tape = orders
              .filter((o) => o.status === "filled" || o.status === "rejected")
              .slice(0, 12);
            const label = (id: string) => getPair(id)?.label ?? id;
            if (bookPos.length === 0 && tape.length === 0) {
              return (
                <li className="text-micro text-subtle">
                  No open lot and no fill yet. Scan the tape — IN/OUT prints here on the next ticket.
                </li>
              );
            }
            return (
              <>
                {bookPos.map((p) => {
                  const mark = tickers[p.pair]?.last ?? p.mark;
                  const pnl = (mark - p.entry) * p.qty;
                  const pnlPct = p.entry ? ((mark - p.entry) / p.entry) * 100 : 0;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-2xs">
                      <span className="font-display tracking-[0.08em] text-good uppercase">IN</span>
                      <span className="min-w-0 truncate text-fg">{label(p.pair)}</span>
                      <span className="stat-num text-muted">{qty(p.qty, 4)}</span>
                      <span className={cn("stat-num", pnl >= 0 ? "text-good" : "text-danger")}>
                        {money(pnl)} {pct(pnlPct, 2)}
                      </span>
                    </li>
                  );
                })}
                {tape.map((o) => {
                  const out = fillLeg(o) === "out";
                  const notion = (o.fillPrice ?? o.price) * o.qty;
                  const shown = out ? o.pnl : -notion;
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 text-2xs">
                      <span
                        className={cn(
                          "font-display tracking-[0.08em] uppercase",
                          out ? "text-danger" : "text-good",
                        )}
                      >
                        {out ? "OUT" : "IN"}
                      </span>
                      <span className="min-w-0 truncate text-fg">{label(o.pair)}</span>
                      <span className="stat-num text-muted">{fillWhy(o.reason)}</span>
                      <span
                        className={cn(
                          "stat-num",
                          shown == null ? "text-muted" : shown >= 0 ? "text-good" : "text-danger",
                        )}
                      >
                        {shown == null ? "—" : money(shown)}
                      </span>
                      <span className="stat-num text-subtle">{ago(o.ts)}</span>
                    </li>
                  );
                })}
              </>
            );
          })()}
        </ul>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-micro tracking-[0.14em] text-archivist uppercase">
            Brain {selfLearn ? "on" : "off"}
          </span>
          <span className="stat-num text-2xs text-fg">
            {liveFills.length === 0 && brain.samples === 0
              ? "cold"
              : `${(liveWr * 100).toFixed(0)}% · ${liveLessons.length || brain.samples}`}
          </span>
        </div>
        <p className="mt-1 truncate text-micro text-muted">
          {liveNote || (!staleBrain && brain.lastNote) || grokNote || "Brain on — waiting on a fill"}
        </p>
        {liveLessons.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
            {liveLessons.slice(0, 6).map((l) => (
              <li key={`${l.pair}-${l.ts}`} className="flex items-baseline justify-between gap-2 text-2xs">
                <span className="font-display tracking-[0.08em] uppercase">
                  {getPair(l.pair)?.label ?? l.pair}
                </span>
                <span className={cn("stat-num", l.pnl >= 0 ? "text-good" : "text-danger")}>
                  {money(l.pnl)}
                </span>
                <span className="truncate text-subtle">{l.note}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function BookStat({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-micro tracking-wide text-subtle uppercase">{k}</span>
      <span
        className={cn(
          "stat-num text-2xs",
          tone === "good" && "text-good",
          tone === "bad" && "text-danger",
        )}
      >
        {v}
      </span>
    </div>
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
            onClick={() => {
              setInspect(on ? null : id);
            }}
            className={cn(
              "min-h-11 min-w-[7.5rem] rounded-sm px-2.5 py-1.5 text-left shadow-[0_0_0_1px_var(--color-border)] transition-transform duration-150 ease-out active:scale-[0.96]",
              on && "bg-surface-2",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-2xs tracking-[0.12em] uppercase">
                {getPair(id)?.base ?? PAIR_BY_ID[id]?.base ?? id}
              </span>
              <span className="text-micro text-subtle uppercase">
                {(getPair(id) ?? PAIR_BY_ID[id])?.sleeve === "stock"
                  ? "stk"
                  : (getPair(id) ?? PAIR_BY_ID[id])?.sleeve ?? ""}
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
              <div className="text-micro text-subtle">{t ? pct(t.changePct, 1) : "waiting"}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { AGENT_BY_ID };
