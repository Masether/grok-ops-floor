import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  CHART_TOOLS,
  CHART_TYPES,
  INDICATOR_META,
  barClock,
  cycleIndicatorParams,
  indexOfTime,
  indicatorParamLabel,
  type ChartDrawing,
  type ChartIndicatorState,
  type ChartType,
} from "@/lib/charts";
import { money, pct, px, qty, uid } from "@/lib/format";
import {
  bollingerBands,
  ema,
  macdSeries,
  rsiSeries,
  smaSeries,
  stochasticSeries,
} from "@/lib/indicators";
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

const NO_DRAWINGS: ChartDrawing[] = [];

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
      className="fixed inset-0 z-[80] grid place-items-end bg-[#05060a] p-2 sm:place-items-center sm:p-4"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="charts-title"
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-[#0c0e16] shadow-[0_0_0_1px_var(--color-border-strong),0_24px_80px_rgb(0_0_0/0.45)]"
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
              size="sm"
              variant={id === pair ? "default" : "outline"}
              aria-pressed={id === pair}
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
              size="sm"
              variant={n === interval ? "default" : "outline"}
              aria-pressed={n === interval}
              onClick={() => setChartInterval(asChartInterval(n))}
            >
              {chartIntervalLabel(n as ChartInterval)}
            </Button>
          ))}
          <span className="ml-auto text-micro text-subtle">
            {busy ? "loading…" : `${chartIntervalLabel(interval)} bars`}
          </span>
        </div>

        <ChartToolbox pair={pair} />

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
          <MonitorChart candles={candles} position={position} mark={mark} pair={pair} />
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

function ChartToolbox({ pair }: { pair: PairId }) {
  const chartType = useFloor((s) => s.chartType);
  const setChartType = useFloor((s) => s.setChartType);
  const indicators = useFloor((s) => s.chartIndicators);
  const toggle = useFloor((s) => s.toggleChartIndicator);
  const setParams = useFloor((s) => s.setChartIndicatorParams);
  const tool = useFloor((s) => s.chartTool);
  const setTool = useFloor((s) => s.setChartTool);
  const drawings = useFloor((s) => s.chartDrawings[pair]);
  const clear = useFloor((s) => s.clearChartDrawings);
  const count = drawings?.length ?? 0;
  const hint = CHART_TOOLS.find((t) => t.id === tool)?.hint;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        {CHART_TYPES.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={t.id === chartType ? "default" : "outline"}
            aria-pressed={t.id === chartType}
            onClick={() => setChartType(t.id)}
          >
            {t.label}
          </Button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        {CHART_TOOLS.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={t.id === tool ? "default" : "outline"}
            aria-pressed={t.id === tool}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={count === 0}
          onClick={() => clear(pair)}
        >
          Clear{count ? ` ${count}` : ""}
        </Button>
        {tool !== "crosshair" ? (
          <span className="w-full text-micro text-subtle sm:ml-auto sm:w-auto">{hint}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="font-display w-full text-micro tracking-[0.14em] text-subtle uppercase sm:w-auto">
          Indicators
        </span>
        {indicators.map((ind) => (
          <IndicatorChip
            key={ind.id}
            ind={ind}
            onToggle={() => toggle(ind.id)}
            onCycle={() => setParams(ind.id, cycleIndicatorParams(ind))}
          />
        ))}
      </div>
    </>
  );
}

function IndicatorChip({
  ind,
  onToggle,
  onCycle,
}: {
  ind: ChartIndicatorState;
  onToggle: () => void;
  onCycle: () => void;
}) {
  const meta = INDICATOR_META[ind.id];
  const param = indicatorParamLabel(ind);
  return (
    <div className="flex overflow-hidden rounded-sm">
      <Button
        type="button"
        size="sm"
        variant={ind.on ? "default" : "outline"}
        aria-pressed={ind.on}
        className="rounded-none"
        onClick={onToggle}
      >
        {meta.label}
      </Button>
      {ind.on && meta.params !== "none" && param ? (
        <Button
          type="button"
          size="sm"
          variant={ind.on ? "default" : "outline"}
          className="rounded-none border-l border-black/20 px-2"
          onClick={onCycle}
          aria-label={`Cycle ${meta.label} period`}
        >
          <span className="stat-num normal-case tracking-normal">{param}</span>
        </Button>
      ) : null}
    </div>
  );
}

function MonitorChart({
  candles,
  position,
  mark,
  pair,
}: {
  candles: Candle[];
  position: Position | null;
  mark: number | null;
  pair: PairId;
}) {
  const chartType = useFloor((s) => s.chartType);
  const indicators = useFloor((s) => s.chartIndicators);
  const tool = useFloor((s) => s.chartTool);
  const drawings = useFloor((s) => s.chartDrawings[pair]) ?? NO_DRAWINGS;
  const addDrawing = useFloor((s) => s.addChartDrawing);
  const slice = useMemo(() => candles.slice(-120), [candles]);
  const model = useMemo(
    () => buildModel(slice, position, mark, chartType, indicators, drawings),
    [slice, position, mark, chartType, indicators, drawings],
  );
  const [hover, setHover] = useState<{ i: number; price: number } | null>(null);
  const [pending, setPending] = useState<{ t: number; p: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ t: number; p: number } | null>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    t: number;
    p: number;
    moved: boolean;
  } | null>(null);
  const [ghost, setGhost] = useState<{ t: number; p: number } | null>(null);

  useEffect(() => {
    setPending(null);
    setGhost(null);
    setDragStart(null);
    setHover(null);
    drag.current = null;
  }, [pair, tool]);

  if (slice.length < 2 || !model) {
    return (
      <div className="grid min-h-[220px] place-items-center text-2xs text-subtle">
        Waiting on candles
      </div>
    );
  }

  const last = slice[slice.length - 1]!;
  const hoverBar = hover ? slice[hover.i] : last;
  const hoverPrice = hover?.price ?? last.close;
  const rsiNow = model.rsi ? model.rsi[hover?.i ?? model.n - 1] : null;

  const hit = (e: ReactPointerEvent<SVGSVGElement>) => {
    const { x, y } = svgPoint(e, model.w, model.priceH);
    const i = model.indexAt(x);
    const price = model.priceAt(y);
    return { i, price, t: slice[i]!.time, x, y };
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const h = hit(e);
    setHover({ i: h.i, price: h.price });
    if (tool === "crosshair") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      x: h.x,
      y: h.y,
      t: h.t,
      p: h.price,
      moved: false,
    };
    if (tool === "trend") {
      setDragStart({ t: h.t, p: h.price });
      setGhost({ t: h.t, p: h.price });
    }
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const h = hit(e);
    setHover({ i: h.i, price: h.price });
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dist = Math.hypot(h.x - d.x, h.y - d.y);
    if (dist > 12) d.moved = true;
    if (tool === "trend") setGhost({ t: h.t, p: h.price });
  };

  const finishTrend = (a: { t: number; p: number }, b: { t: number; p: number }) => {
    if (a.t === b.t && Math.abs(a.p - b.p) < 1e-12) return;
    addDrawing(pair, { id: uid("draw"), kind: "trend", t1: a.t, p1: a.p, t2: b.t, p2: b.p });
    setPending(null);
    setGhost(null);
    setDragStart(null);
  };

  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const h = hit(e);
    const d = drag.current;
    drag.current = null;
    if (tool === "hline") {
      addDrawing(pair, { id: uid("draw"), kind: "hline", price: h.price });
      return;
    }
    if (tool !== "trend") return;
    if (d?.moved) {
      finishTrend({ t: d.t, p: d.p }, { t: h.t, p: h.price });
      return;
    }
    if (pending) {
      finishTrend(pending, { t: h.t, p: h.price });
      return;
    }
    setPending({ t: h.t, p: h.price });
    setGhost(null);
  };

  const onCancel = () => {
    drag.current = null;
    setGhost(null);
    setDragStart(null);
  };

  const cursor =
    tool === "crosshair" ? "crosshair" : tool === "hline" ? "cell" : "crosshair";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 text-micro text-subtle">
        <span className="stat-num text-muted">
          {barClock(hoverBar?.time ?? last.time)} {px(hoverPrice)}
        </span>
        {rsiNow != null ? <span>RSI {rsiNow.toFixed(0)}</span> : null}
        {pending ? <span className="text-accent">Second tap to finish trend</span> : null}
      </div>
      <svg
        viewBox={`0 0 ${model.w} ${model.priceH}`}
        className="block w-full touch-none select-none"
        role="img"
        aria-label="Price"
        style={{ cursor, touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onPointerLeave={() => {
          if (!drag.current) setHover(null);
        }}
      >
        <PriceSeries model={model} candles={slice} chartType={chartType} />
        <Overlays model={model} />
        <Guides model={model} position={position} mark={mark} />
        <UserDrawings
          model={model}
          drawings={drawings}
          from={pending ?? dragStart}
          ghost={ghost}
        />
        <Crosshair model={model} hover={hover} />
        <PriceAxis model={model} position={position} mark={mark} />
      </svg>
      {model.vols ? <VolumePane model={model} candles={slice} /> : null}
      {model.rsi ? <RsiPane model={model} /> : null}
      {model.macd ? <MacdPane model={model} /> : null}
      {model.stoch ? <StochPane model={model} /> : null}
      <div className="flex flex-wrap gap-3 px-1 text-micro text-subtle">
        {model.sma ? <span className="text-flow">SMA {model.smaN}</span> : null}
        {model.emaFast ? <span className="text-info">EMA {model.emaFastN}</span> : null}
        {model.emaSlow ? <span className="text-warn">EMA {model.emaSlowN}</span> : null}
        {model.bb ? <span className="text-regime">BB {model.bbN}</span> : null}
        {model.vols ? <span>Vol</span> : null}
        {model.rsi ? <span>RSI {model.rsiN}</span> : null}
        {model.macd ? <span>MACD</span> : null}
        {model.stoch ? <span>Stoch {model.stochN}</span> : null}
      </div>
    </div>
  );
}

type ChartModel = {
  w: number;
  priceH: number;
  paneH: number;
  volH: number;
  padL: number;
  padR: number;
  padT: number;
  innerH: number;
  gap: number;
  bodyW: number;
  lo: number;
  hi: number;
  n: number;
  times: number[];
  x: (i: number) => number;
  y: (p: number) => number;
  priceAt: (svgY: number) => number;
  indexAt: (svgX: number) => number;
  sma?: number[];
  emaFast?: number[];
  emaSlow?: number[];
  bb?: { mid: number[]; upper: number[]; lower: number[] };
  rsi?: number[];
  macd?: { line: number[]; signal: number[]; hist: number[] };
  stoch?: { k: number[]; d: number[] };
  vols?: number[];
  maxVol: number;
  emaFastN?: number;
  emaSlowN?: number;
  smaN?: number;
  rsiN?: number;
  stochN?: number;
  bbN?: number;
};

function buildModel(
  candles: Candle[],
  position: Position | null,
  mark: number | null,
  chartType: ChartType,
  indicators: ChartIndicatorState[],
  drawings: ChartDrawing[],
): ChartModel | null {
  const n = candles.length;
  if (n < 2) return null;
  const w = 720;
  const priceH = 240;
  const paneH = 64;
  const volH = 56;
  const padL = 8;
  const padR = 56;
  const padT = 10;
  const innerH = priceH - padT - 8;
  const innerW = w - padL - padR;
  const gap = innerW / n;
  const bodyW = Math.max(1.2, Math.min(7, gap * 0.62));
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const times = candles.map((c) => c.time);
  const on = (id: ChartIndicatorState["id"]) => indicators.find((x) => x.id === id)?.on ?? false;
  const get = (id: ChartIndicatorState["id"]) => indicators.find((x) => x.id === id);

  const emaInd = get("ema");
  const smaInd = get("sma");
  const bbInd = get("bb");
  const rsiInd = get("rsi");
  const stochInd = get("stoch");

  const emaFast = on("ema") && emaInd ? ema(closes, emaInd.fast) : undefined;
  const emaSlow = on("ema") && emaInd ? ema(closes, emaInd.slow) : undefined;
  const smaArr = on("sma") && smaInd ? smaSeries(closes, smaInd.period) : undefined;
  const bb = on("bb") && bbInd ? bollingerBands(closes, bbInd.period, bbInd.k) : undefined;
  const rsi = on("rsi") && rsiInd ? rsiSeries(closes, rsiInd.period) : undefined;
  const macd = on("macd") ? macdSeries(closes) : undefined;
  const stoch =
    on("stoch") && stochInd ? stochasticSeries(highs, lows, closes, stochInd.period, 3) : undefined;
  const vols = on("volume") ? candles.map((c) => c.volume) : undefined;
  const maxVol = vols ? Math.max(...vols, 1) : 1;

  let lo = Math.min(...lows);
  let hi = Math.max(...highs);
  const bump = (arr?: number[]) => {
    if (!arr?.length) return;
    lo = Math.min(lo, ...arr);
    hi = Math.max(hi, ...arr);
  };
  bump(emaFast);
  bump(emaSlow);
  bump(smaArr);
  bump(bb?.upper);
  bump(bb?.lower);
  if (position) {
    lo = Math.min(lo, position.stop, position.entry, position.take);
    hi = Math.max(hi, position.stop, position.entry, position.take);
  }
  if (mark != null) {
    lo = Math.min(lo, mark);
    hi = Math.max(hi, mark);
  }
  for (const d of drawings) {
    if (d.kind === "hline") {
      lo = Math.min(lo, d.price);
      hi = Math.max(hi, d.price);
    } else {
      lo = Math.min(lo, d.p1, d.p2);
      hi = Math.max(hi, d.p1, d.p2);
    }
  }
  if (chartType === "line") {
    lo = Math.min(lo, ...closes);
    hi = Math.max(hi, ...closes);
  }
  const span = hi - lo || 1;
  lo -= span * 0.04;
  hi += span * 0.04;
  const span2 = hi - lo || 1;
  const x = (i: number) => padL + (i + 0.5) * gap;
  const y = (price: number) => padT + ((hi - price) / span2) * innerH;
  const priceAt = (svgY: number) => hi - ((svgY - padT) / innerH) * span2;
  const indexAt = (svgX: number) => {
    const i = Math.floor((svgX - padL) / gap);
    return Math.max(0, Math.min(n - 1, i));
  };

  return {
    w,
    priceH,
    paneH,
    volH,
    padL,
    padR,
    padT,
    innerH,
    gap,
    bodyW,
    lo,
    hi,
    n,
    times,
    x,
    y,
    priceAt,
    indexAt,
    sma: smaArr,
    emaFast,
    emaSlow,
    bb,
    rsi,
    macd,
    stoch,
    vols,
    maxVol,
    emaFastN: emaInd?.fast,
    emaSlowN: emaInd?.slow,
    smaN: smaInd?.period,
    rsiN: rsiInd?.period,
    stochN: stochInd?.period,
    bbN: bbInd?.period,
  };
}

function svgPoint(e: ReactPointerEvent<SVGSVGElement>, w: number, h: number) {
  const rect = e.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((e.clientX - rect.left) / rect.width) * w,
    y: ((e.clientY - rect.top) / rect.height) * h,
  };
}

function pathOf(x: (i: number) => number, y: (v: number) => number, arr: number[]) {
  return arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
}

function bandPath(
  x: (i: number) => number,
  y: (v: number) => number,
  upper: number[],
  lower: number[],
) {
  const up = pathOf(x, y, upper);
  const down = lower
    .map((_, i) => {
      const idx = lower.length - 1 - i;
      return `L${x(idx).toFixed(1)} ${y(lower[idx]!).toFixed(1)}`;
    })
    .join(" ");
  return `${up} ${down} Z`;
}

function PriceSeries({
  model,
  candles,
  chartType,
}: {
  model: ChartModel;
  candles: Candle[];
  chartType: ChartType;
}) {
  const { x, y, bodyW } = model;
  if (chartType === "line") {
    const closes = candles.map((c) => c.close);
    const d = pathOf(x, y, closes);
    const lastX = x(candles.length - 1);
    const firstX = x(0);
    const base = model.padT + model.innerH;
    return (
      <g>
        <path
          d={`${d} L${lastX.toFixed(1)} ${base} L${firstX.toFixed(1)} ${base} Z`}
          fill="var(--color-info)"
          opacity={0.08}
        />
        <path d={d} fill="none" stroke="var(--color-info)" strokeWidth={1.4} />
      </g>
    );
  }
  return (
    <g>
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? "var(--color-good)" : "var(--color-danger)";
        const cx = x(i);
        const yH = y(c.high);
        const yL = y(c.low);
        const yO = y(c.open);
        const yC = y(c.close);
        if (chartType === "bars") {
          return (
            <g key={c.time}>
              <line x1={cx} x2={cx} y1={yH} y2={yL} stroke={color} strokeWidth={1.2} />
              <line x1={cx - bodyW / 2} x2={cx} y1={yO} y2={yO} stroke={color} strokeWidth={1.4} />
              <line x1={cx} x2={cx + bodyW / 2} y1={yC} y2={yC} stroke={color} strokeWidth={1.4} />
            </g>
          );
        }
        const top = Math.min(yO, yC);
        const h = Math.max(1, Math.abs(yC - yO));
        return (
          <g key={c.time}>
            <line x1={cx} x2={cx} y1={yH} y2={yL} stroke={color} strokeWidth={1} />
            <rect x={cx - bodyW / 2} y={top} width={bodyW} height={h} fill={color} opacity={0.92} />
          </g>
        );
      })}
    </g>
  );
}

function Overlays({ model }: { model: ChartModel }) {
  const { x, y } = model;
  return (
    <g>
      {model.bb ? (
        <>
          <path
            d={bandPath(x, y, model.bb.upper, model.bb.lower)}
            fill="var(--color-regime)"
            opacity={0.12}
          />
          <path d={pathOf(x, y, model.bb.upper)} fill="none" stroke="var(--color-regime)" strokeWidth={0.9} opacity={0.7} />
          <path d={pathOf(x, y, model.bb.lower)} fill="none" stroke="var(--color-regime)" strokeWidth={0.9} opacity={0.7} />
          <path d={pathOf(x, y, model.bb.mid)} fill="none" stroke="var(--color-regime)" strokeWidth={1} />
        </>
      ) : null}
      {model.sma ? (
        <path d={pathOf(x, y, model.sma)} fill="none" stroke="var(--color-flow)" strokeWidth={1.2} />
      ) : null}
      {model.emaFast ? (
        <path d={pathOf(x, y, model.emaFast)} fill="none" stroke="var(--color-info)" strokeWidth={1.2} />
      ) : null}
      {model.emaSlow ? (
        <path d={pathOf(x, y, model.emaSlow)} fill="none" stroke="var(--color-warn)" strokeWidth={1.2} />
      ) : null}
    </g>
  );
}

function Guides({
  model,
  position,
  mark,
}: {
  model: ChartModel;
  position: Position | null;
  mark: number | null;
}) {
  const rows: { price: number; color: string; dash?: boolean; label: string }[] = [];
  if (position) {
    rows.push({ price: position.entry, color: "var(--color-fg)", label: "IN" });
    rows.push({ price: position.stop, color: "var(--color-danger)", label: "SL" });
    rows.push({ price: position.take, color: "var(--color-good)", label: "TP" });
  }
  if (mark != null) {
    rows.push({ price: mark, color: "var(--color-accent)", dash: true, label: "MK" });
  }
  return (
    <g>
      {rows.map((g) => (
        <line
          key={g.label}
          x1={model.padL}
          x2={model.w - model.padR}
          y1={model.y(g.price)}
          y2={model.y(g.price)}
          stroke={g.color}
          strokeWidth={1}
          strokeDasharray={g.dash ? "4 3" : undefined}
          opacity={0.7}
        />
      ))}
    </g>
  );
}

function PriceAxis({
  model,
  position,
  mark,
}: {
  model: ChartModel;
  position: Position | null;
  mark: number | null;
}) {
  const ticks = [model.hi, (model.hi + model.lo) / 2, model.lo];
  const rows: { price: number; color: string; label: string }[] = [];
  if (position) {
    rows.push({ price: position.entry, color: "var(--color-fg)", label: "IN" });
    rows.push({ price: position.stop, color: "var(--color-danger)", label: "SL" });
    rows.push({ price: position.take, color: "var(--color-good)", label: "TP" });
  }
  if (mark != null) rows.push({ price: mark, color: "var(--color-accent)", label: "MK" });
  return (
    <g pointerEvents="none">
      {ticks.map((p) => (
        <text
          key={p}
          x={model.w - 6}
          y={model.y(p) + 3}
          textAnchor="end"
          fill="var(--color-subtle)"
          fontSize={10}
          fontFamily="IBM Plex Mono, monospace"
        >
          {px(p)}
        </text>
      ))}
      {rows.map((g) => (
        <text
          key={`gl${g.label}`}
          x={model.w - 6}
          y={model.y(g.price) - 4}
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
}

function UserDrawings({
  model,
  drawings,
  from,
  ghost,
}: {
  model: ChartModel;
  drawings: ChartDrawing[];
  from: { t: number; p: number } | null;
  ghost: { t: number; p: number } | null;
}) {
  const xi = (t: number) => model.x(indexOfTime(model.times, t));
  const a = from;
  const b = ghost;
  return (
    <g>
      {drawings.map((d) =>
        d.kind === "hline" ? (
          <g key={d.id}>
            <line
              x1={model.padL}
              x2={model.w - model.padR}
              y1={model.y(d.price)}
              y2={model.y(d.price)}
              stroke="var(--color-accent)"
              strokeWidth={1.1}
              strokeDasharray="5 3"
              opacity={0.9}
            />
            <text
              x={model.padL + 4}
              y={model.y(d.price) - 4}
              fill="var(--color-accent)"
              fontSize={9}
              fontFamily="IBM Plex Mono, monospace"
            >
              {px(d.price)}
            </text>
          </g>
        ) : (
          <g key={d.id}>
            <line
              x1={xi(d.t1)}
              y1={model.y(d.p1)}
              x2={xi(d.t2)}
              y2={model.y(d.p2)}
              stroke="var(--color-accent)"
              strokeWidth={1.3}
            />
            <circle cx={xi(d.t1)} cy={model.y(d.p1)} r={2.4} fill="var(--color-accent)" />
            <circle cx={xi(d.t2)} cy={model.y(d.p2)} r={2.4} fill="var(--color-accent)" />
          </g>
        ),
      )}
      {a ? (
        <circle cx={xi(a.t)} cy={model.y(a.p)} r={3} fill="var(--color-accent)" opacity={0.9} />
      ) : null}
      {a && b ? (
        <line
          x1={xi(a.t)}
          y1={model.y(a.p)}
          x2={xi(b.t)}
          y2={model.y(b.p)}
          stroke="var(--color-accent)"
          strokeWidth={1.1}
          strokeDasharray="4 3"
          opacity={0.75}
        />
      ) : null}
    </g>
  );
}

function Crosshair({
  model,
  hover,
}: {
  model: ChartModel;
  hover: { i: number; price: number } | null;
}) {
  if (!hover) return null;
  const cx = model.x(hover.i);
  const cy = model.y(hover.price);
  return (
    <g pointerEvents="none">
      <line
        x1={cx}
        x2={cx}
        y1={model.padT}
        y2={model.padT + model.innerH}
        stroke="var(--color-fg)"
        strokeWidth={0.8}
        opacity={0.28}
      />
      <line
        x1={model.padL}
        x2={model.w - model.padR}
        y1={cy}
        y2={cy}
        stroke="var(--color-fg)"
        strokeWidth={0.8}
        opacity={0.28}
      />
      <rect
        x={model.w - model.padR}
        y={cy - 8}
        width={model.padR - 2}
        height={14}
        fill="var(--color-surface-3)"
      />
      <text
        x={model.w - 6}
        y={cy + 3}
        textAnchor="end"
        fill="var(--color-fg)"
        fontSize={10}
        fontFamily="IBM Plex Mono, monospace"
      >
        {px(hover.price)}
      </text>
    </g>
  );
}

function VolumePane({ model, candles }: { model: ChartModel; candles: Candle[] }) {
  const h = model.volH;
  const max = model.maxVol;
  const y0 = h - 4;
  return (
    <svg viewBox={`0 0 ${model.w} ${h}`} className="block w-full" aria-label="Volume">
      <text x={model.padL} y={11} fill="var(--color-subtle)" fontSize={9} fontFamily="Rajdhani, sans-serif">
        VOL
      </text>
      {candles.map((c, i) => {
        const barH = (c.volume / max) * (h - 18);
        const up = c.close >= c.open;
        return (
          <rect
            key={c.time}
            x={model.x(i) - model.bodyW / 2}
            y={y0 - barH}
            width={model.bodyW}
            height={Math.max(1, barH)}
            fill={up ? "var(--color-good)" : "var(--color-danger)"}
            opacity={0.55}
          />
        );
      })}
    </svg>
  );
}

function RsiPane({ model }: { model: ChartModel }) {
  const arr = model.rsi!;
  const h = model.paneH;
  const y = (v: number) => 8 + ((100 - v) / 100) * (h - 20);
  const last = arr[arr.length - 1] ?? 50;
  return (
    <svg viewBox={`0 0 ${model.w} ${h}`} className="block w-full" aria-label="RSI">
      <text x={model.padL} y={11} fill="var(--color-subtle)" fontSize={9} fontFamily="Rajdhani, sans-serif">
        RSI {model.rsiN}
      </text>
      <line x1={model.padL} x2={model.w - model.padR} y1={y(70)} y2={y(70)} stroke="var(--color-border-strong)" />
      <line x1={model.padL} x2={model.w - model.padR} y1={y(30)} y2={y(30)} stroke="var(--color-border-strong)" />
      <path d={pathOf(model.x, y, arr)} fill="none" stroke="var(--color-regime)" strokeWidth={1.3} />
      <text
        x={model.w - 6}
        y={y(last) + 3}
        textAnchor="end"
        fill="var(--color-muted)"
        fontSize={10}
        fontFamily="IBM Plex Mono, monospace"
      >
        {last.toFixed(0)}
      </text>
    </svg>
  );
}

function MacdPane({ model }: { model: ChartModel }) {
  const m = model.macd!;
  const h = model.paneH;
  const abs = Math.max(
    ...m.hist.map((v) => Math.abs(v)),
    ...m.line.map((v) => Math.abs(v)),
    ...m.signal.map((v) => Math.abs(v)),
    1e-9,
  );
  const y = (v: number) => h / 2 - (v / abs) * ((h - 18) / 2);
  return (
    <svg viewBox={`0 0 ${model.w} ${h}`} className="block w-full" aria-label="MACD">
      <text x={model.padL} y={11} fill="var(--color-subtle)" fontSize={9} fontFamily="Rajdhani, sans-serif">
        MACD
      </text>
      <line x1={model.padL} x2={model.w - model.padR} y1={h / 2} y2={h / 2} stroke="var(--color-border)" />
      {m.hist.map((v, i) => {
        const zero = h / 2;
        const y1 = y(v);
        return (
          <rect
            key={`m${i}`}
            x={model.x(i) - model.bodyW / 2}
            y={Math.min(zero, y1)}
            width={model.bodyW}
            height={Math.max(1, Math.abs(y1 - zero))}
            fill={v >= 0 ? "var(--color-good)" : "var(--color-danger)"}
            opacity={0.85}
          />
        );
      })}
      <path d={pathOf(model.x, y, m.line)} fill="none" stroke="var(--color-info)" strokeWidth={1} />
      <path d={pathOf(model.x, y, m.signal)} fill="none" stroke="var(--color-warn)" strokeWidth={1} />
    </svg>
  );
}

function StochPane({ model }: { model: ChartModel }) {
  const s = model.stoch!;
  const h = model.paneH;
  const y = (v: number) => 8 + ((100 - v) / 100) * (h - 20);
  const last = s.k[s.k.length - 1] ?? 50;
  return (
    <svg viewBox={`0 0 ${model.w} ${h}`} className="block w-full" aria-label="Stochastic">
      <text x={model.padL} y={11} fill="var(--color-subtle)" fontSize={9} fontFamily="Rajdhani, sans-serif">
        STOCH {model.stochN}
      </text>
      <line x1={model.padL} x2={model.w - model.padR} y1={y(80)} y2={y(80)} stroke="var(--color-border-strong)" />
      <line x1={model.padL} x2={model.w - model.padR} y1={y(20)} y2={y(20)} stroke="var(--color-border-strong)" />
      <path d={pathOf(model.x, y, s.k)} fill="none" stroke="var(--color-info)" strokeWidth={1.2} />
      <path d={pathOf(model.x, y, s.d)} fill="none" stroke="var(--color-warn)" strokeWidth={1.2} />
      <text
        x={model.w - 6}
        y={y(last) + 3}
        textAnchor="end"
        fill="var(--color-muted)"
        fontSize={10}
        fontFamily="IBM Plex Mono, monospace"
      >
        {last.toFixed(0)}
      </text>
    </svg>
  );
}
