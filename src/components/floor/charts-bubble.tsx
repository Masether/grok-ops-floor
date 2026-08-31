import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { money, pct, px, qty } from "@/lib/format";
import { ema, macdHistSeries, rsiSeries } from "@/lib/indicators";
import { fetchOhlc } from "@/lib/kraken-api";
import { PAIR_BY_ID } from "@/lib/kraken";
import {
  CHART_INTERVALS,
  asChartInterval,
  chartIntervalLabel,
  type ChartInterval,
} from "@/lib/session";
import { makeSimCandles } from "@/lib/sim-feed";
import { useFloor } from "@/lib/store";
import type { Candle, PairId, Position } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChartsBubble() {
  const open = useFloor((s) => s.chartsOpen);
  const setOpen = useFloor((s) => s.setChartsOpen);
  const pairs = useFloor((s) => s.pairs);
  const inspectPair = useFloor((s) => s.inspectPair);
  const setInspectPair = useFloor((s) => s.setInspectPair);
  const interval = useFloor((s) => s.chartInterval);
  const setChartInterval = useFloor((s) => s.setChartInterval);
  const candlesMap = useFloor((s) => s.candles);
  const tickers = useFloor((s) => s.tickers);
  const positions = useFloor((s) => s.positions);
  const orders = useFloor((s) => s.orders);
  const feedSource = useFloor((s) => s.feedSource);
  const [busy, setBusy] = useState(false);

  const pair: PairId = inspectPair && pairs.includes(inspectPair) ? inspectPair : (pairs[0] ?? "XBTUSD");

  useEffect(() => {
    if (!open) return;
    if (!inspectPair || !pairs.includes(inspectPair)) {
      const next = pairs[0];
      if (next) setInspectPair(next);
    }
  }, [open, inspectPair, pairs, setInspectPair]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const rows =
          feedSource === "sim"
            ? makeSimCandles(pair, 120, interval * 60_000)
            : await fetchOhlc({ data: { pair, interval } });
        if (cancelled || rows.length < 2) return;
        useFloor.setState((s) => ({ candles: { ...s.candles, [pair]: rows } }));
      } catch {
        /* engine / sim fills */
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pair, interval, feedSource]);

  const candles = candlesMap[pair] ?? [];
  const position = positions.find((p) => p.pair === pair) ?? null;
  const mark = tickers[pair]?.last ?? position?.mark ?? candles[candles.length - 1]?.close ?? null;
  const fills = orders.filter((o) => o.pair === pair && o.status === "filled").slice(0, 6);
  const unrealized =
    position && mark != null ? (mark - position.entry) * position.qty : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-end bg-bg/45 p-2 backdrop-blur-[3px] sm:place-items-center sm:p-4"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="charts-title"
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-surface/80 shadow-[0_0_0_1px_var(--color-border-strong),0_24px_80px_rgb(0_0_0/0.45)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <p className="panel-kicker" id="charts-title">
              Charts
            </p>
            <p className="panel-sub">Monitor only — same book as the floor</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Close charts"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          {pairs.map((id) => (
            <Button
              key={id}
              type="button"
              size="micro"
              variant={id === pair ? "default" : "outline"}
              onClick={() => setInspectPair(id)}
            >
              {PAIR_BY_ID[id].base}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          {CHART_INTERVALS.map((n) => (
            <Button
              key={n}
              type="button"
              size="micro"
              variant={n === interval ? "default" : "outline"}
              onClick={() => setChartInterval(asChartInterval(n))}
            >
              {chartIntervalLabel(n as ChartInterval)}
            </Button>
          ))}
          <span className="ml-auto text-micro text-subtle">
            {busy ? "loading…" : `${chartIntervalLabel(interval)} bars`}
          </span>
        </div>

        {position && mark != null && unrealized != null ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-3 py-2 text-2xs">
            <span className="font-display tracking-[0.12em] text-muted uppercase">Open</span>
            <span className="stat-num">in {px(position.entry)}</span>
            <span className="stat-num text-danger">SL {px(position.stop)}</span>
            <span className="stat-num text-good">TP {px(position.take)}</span>
            <span className="stat-num">mk {px(mark)}</span>
            <span className={cn("stat-num ml-auto", unrealized >= 0 ? "text-good" : "text-danger")}>
              {money(unrealized)} {pct(((mark - position.entry) / position.entry) * 100, 2)}
            </span>
          </div>
        ) : (
          <div className="border-b border-border px-3 py-2 text-2xs text-subtle">
            No open lot on {PAIR_BY_ID[pair].label}. Tape still prints.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          <MonitorChart candles={candles} position={position} mark={mark} />
        </div>

        <div className="grid gap-2 border-t border-border px-3 py-2 sm:grid-cols-2">
          <div>
            <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">Position</p>
            {position ? (
              <p className="mt-1 text-2xs text-muted">
                {qty(position.qty, 4)} {PAIR_BY_ID[pair].label} · {position.mode}
              </p>
            ) : (
              <p className="mt-1 text-2xs text-subtle">Flat</p>
            )}
          </div>
          <div>
            <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">Fills</p>
            {fills.length === 0 ? (
              <p className="mt-1 text-2xs text-subtle">None yet</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {fills.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2 text-2xs">
                    <span className={o.side === "buy" ? "text-good" : "text-danger"}>
                      {o.side.toUpperCase()}
                    </span>
                    <span className="stat-num text-muted">
                      {qty(o.qty, 4)} @ {px(o.fillPrice ?? o.price)}
                    </span>
                    <span className="truncate text-subtle">{o.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonitorChart({
  candles,
  position,
  mark,
}: {
  candles: Candle[];
  position: Position | null;
  mark: number | null;
}) {
  const slice = candles.slice(-120);
  const chart = useMemo(() => buildChart(slice, position, mark), [slice, position, mark]);

  if (slice.length < 2 || !chart) {
    return (
      <div className="grid min-h-[220px] place-items-center text-2xs text-subtle">
        Waiting on candles
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${chart.w} ${chart.priceH}`} className="block w-full" role="img" aria-label="Candles">
        {chart.volBars}
        {chart.candles}
        {chart.emaFast}
        {chart.emaSlow}
        {chart.guides}
        {chart.labels}
      </svg>
      <svg viewBox={`0 0 ${chart.w} ${chart.paneH}`} className="block w-full" aria-label="RSI">
        {chart.rsi}
      </svg>
      <svg viewBox={`0 0 ${chart.w} ${chart.paneH}`} className="block w-full" aria-label="MACD">
        {chart.macd}
      </svg>
      <div className="flex flex-wrap gap-3 px-1 text-micro text-subtle">
        <span className="text-info">EMA 9</span>
        <span className="text-warn">EMA 21</span>
        <span>RSI 14</span>
        <span>MACD hist</span>
      </div>
    </div>
  );
}

function buildChart(candles: Candle[], position: Position | null, mark: number | null) {
  const n = candles.length;
  if (n < 2) return null;
  const w = 720;
  const priceH = 240;
  const paneH = 72;
  const padL = 8;
  const padR = 56;
  const padT = 10;
  const volH = 36;
  const innerW = w - padL - padR;
  const innerH = priceH - padT - volH - 8;
  const gap = innerW / n;
  const bodyW = Math.max(1.2, Math.min(7, gap * 0.62));

  const closes = candles.map((c) => c.close);
  const emaFastArr = ema(closes, 9);
  const emaSlowArr = ema(closes, 21);
  const rsiArr = rsiSeries(closes, 14);
  const macdArr = macdHistSeries(closes);
  const vols = candles.map((c) => c.volume);
  const maxVol = Math.max(...vols, 1);

  let lo = Math.min(...candles.map((c) => c.low), ...emaFastArr, ...emaSlowArr);
  let hi = Math.max(...candles.map((c) => c.high), ...emaFastArr, ...emaSlowArr);
  if (position) {
    lo = Math.min(lo, position.stop, position.entry, position.take);
    hi = Math.max(hi, position.stop, position.entry, position.take);
  }
  if (mark != null) {
    lo = Math.min(lo, mark);
    hi = Math.max(hi, mark);
  }
  const span = hi - lo || 1;
  lo -= span * 0.04;
  hi += span * 0.04;
  const y = (price: number) => padT + ((hi - price) / (hi - lo)) * innerH;
  const x = (i: number) => padL + (i + 0.5) * gap;

  const candleEls = candles.map((c, i) => {
    const up = c.close >= c.open;
    const color = up ? "var(--color-good)" : "var(--color-danger)";
    const cx = x(i);
    const yH = y(c.high);
    const yL = y(c.low);
    const yO = y(c.open);
    const yC = y(c.close);
    const top = Math.min(yO, yC);
    const h = Math.max(1, Math.abs(yC - yO));
    return (
      <g key={c.time}>
        <line x1={cx} x2={cx} y1={yH} y2={yL} stroke={color} strokeWidth={1} />
        <rect x={cx - bodyW / 2} y={top} width={bodyW} height={h} fill={color} opacity={0.92} />
      </g>
    );
  });

  const volY0 = priceH - 4;
  const volBars = candles.map((c, i) => {
    const h = (c.volume / maxVol) * volH;
    const up = c.close >= c.open;
    return (
      <rect
        key={`v${c.time}`}
        x={x(i) - bodyW / 2}
        y={volY0 - h}
        width={bodyW}
        height={h}
        fill={up ? "var(--color-good)" : "var(--color-danger)"}
        opacity={0.28}
      />
    );
  });

  const linePath = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const emaFast = (
    <path d={linePath(emaFastArr)} fill="none" stroke="var(--color-info)" strokeWidth={1.2} />
  );
  const emaSlow = (
    <path d={linePath(emaSlowArr)} fill="none" stroke="var(--color-warn)" strokeWidth={1.2} />
  );

  const guideRows: { price: number; color: string; dash?: boolean; label: string }[] = [];
  if (position) {
    guideRows.push({ price: position.entry, color: "var(--color-fg)", label: "IN" });
    guideRows.push({ price: position.stop, color: "var(--color-danger)", label: "SL" });
    guideRows.push({ price: position.take, color: "var(--color-good)", label: "TP" });
  }
  if (mark != null) {
    guideRows.push({ price: mark, color: "var(--color-accent)", dash: true, label: "MK" });
  }
  const guides = guideRows.map((g) => (
    <g key={g.label}>
      <line
        x1={padL}
        x2={w - padR}
        y1={y(g.price)}
        y2={y(g.price)}
        stroke={g.color}
        strokeWidth={1}
        strokeDasharray={g.dash ? "4 3" : undefined}
        opacity={0.7}
      />
    </g>
  ));

  const ticks = [hi, (hi + lo) / 2, lo];
  const labels = (
    <g>
      {ticks.map((p) => (
        <text
          key={p}
          x={w - 6}
          y={y(p) + 3}
          textAnchor="end"
          fill="var(--color-subtle)"
          fontSize={10}
          fontFamily="IBM Plex Mono, monospace"
        >
          {px(p)}
        </text>
      ))}
      {guideRows.map((g) => (
        <text
          key={`gl${g.label}`}
          x={w - 6}
          y={y(g.price) - 4}
          textAnchor="end"
          fill={g.color}
          fontSize={9}
          fontFamily="Rajdhani, sans-serif"
        >
          {g.label}
        </text>
      ))}
    </g>
  );

  const rsiY = (v: number) => 8 + ((100 - v) / 100) * (paneH - 20);
  const rsiPath = rsiArr
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${rsiY(v).toFixed(1)}`)
    .join(" ");
  const rsi = (
    <g>
      <text x={padL} y={11} fill="var(--color-subtle)" fontSize={9} fontFamily="Rajdhani, sans-serif">
        RSI
      </text>
      <line x1={padL} x2={w - padR} y1={rsiY(70)} y2={rsiY(70)} stroke="var(--color-border-strong)" />
      <line x1={padL} x2={w - padR} y1={rsiY(30)} y2={rsiY(30)} stroke="var(--color-border-strong)" />
      <path d={rsiPath} fill="none" stroke="var(--color-regime)" strokeWidth={1.3} />
      <text
        x={w - 6}
        y={rsiY(rsiArr[rsiArr.length - 1] ?? 50) + 3}
        textAnchor="end"
        fill="var(--color-muted)"
        fontSize={10}
        fontFamily="IBM Plex Mono, monospace"
      >
        {(rsiArr[rsiArr.length - 1] ?? 50).toFixed(0)}
      </text>
    </g>
  );

  const macdAbs = Math.max(...macdArr.map((v) => Math.abs(v)), 1e-9);
  const macdY = (v: number) => paneH / 2 - (v / macdAbs) * ((paneH - 18) / 2);
  const macd = (
    <g>
      <text x={padL} y={11} fill="var(--color-subtle)" fontSize={9} fontFamily="Rajdhani, sans-serif">
        MACD
      </text>
      <line
        x1={padL}
        x2={w - padR}
        y1={paneH / 2}
        y2={paneH / 2}
        stroke="var(--color-border)"
      />
      {macdArr.map((v, i) => {
        const zero = paneH / 2;
        const y1 = macdY(v);
        return (
          <rect
            key={`m${i}`}
            x={x(i) - bodyW / 2}
            y={Math.min(zero, y1)}
            width={bodyW}
            height={Math.max(1, Math.abs(y1 - zero))}
            fill={v >= 0 ? "var(--color-good)" : "var(--color-danger)"}
            opacity={0.85}
          />
        );
      })}
    </g>
  );

  return {
    w,
    priceH,
    paneH,
    candles: candleEls,
    volBars,
    emaFast,
    emaSlow,
    guides,
    labels,
    rsi,
    macd,
  };
}
