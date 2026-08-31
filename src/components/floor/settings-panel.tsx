import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Slider, Switch } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Sheet,
  SheetContent,
} from "@/components/ui/overlay";
import { executeOrder, scanLiveTape } from "@/lib/engine";
import { secondRead } from "@/lib/grok-brief";
import { fetchBalance } from "@/lib/kraken-api";
import { PAIRS, SLEEVE_META, USD_BALANCE_KEYS } from "@/lib/kraken";
import { useDesk, useFloor } from "@/lib/store";
import type { BookSleeve, PairId } from "@/lib/types";

export function SettingsPanel() {
  const open = useFloor((s) => s.settingsOpen);
  const setOpen = useFloor((s) => s.setSettingsOpen);
  const mode = useFloor((s) => s.mode);
  const setMode = useFloor((s) => s.setMode);
  const autoTrade = useFloor((s) => s.autoTrade);
  const setAutoTrade = useFloor((s) => s.setAutoTrade);
  const liveArmed = useFloor((s) => s.liveArmed);
  const setLiveArmed = useFloor((s) => s.setLiveArmed);
  const keys = useFloor((s) => s.keys);
  const setKeys = useFloor((s) => s.setKeys);
  const keysOk = useFloor((s) => s.keysOk);
  const setKeysOk = useFloor((s) => s.setKeysOk);
  const pairs = useFloor((s) => s.pairs);
  const setPairs = useFloor((s) => s.setPairs);
  const risk = useFloor((s) => s.risk);
  const setRisk = useFloor((s) => s.setRisk);
  const startingCash = useFloor((s) => s.startingCash);
  const setStartingCash = useFloor((s) => s.setStartingCash);
  const resetPaper = useFloor((s) => s.resetPaper);
  const liveBalance = useFloor((s) => s.liveBalance);
  const setLiveBalance = useFloor((s) => s.setLiveBalance);
  const pending = useFloor((s) => s.pendingLive);
  const setPending = useFloor((s) => s.setPendingLive);
  const grokBusy = useFloor((s) => s.grokBusy);
  const setGrokBusy = useFloor((s) => s.setGrokBusy);
  const setGrokNote = useFloor((s) => s.setGrokNote);
  const signals = useFloor((s) => s.signals);
  const desk = useDesk();
  const brain = useFloor((s) => s.brain);
  const selfLearn = useFloor((s) => s.selfLearn);
  const setSelfLearn = useFloor((s) => s.setSelfLearn);
  const resetBrain = useFloor((s) => s.resetBrain);
  const [armAsk, setArmAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function testKeys() {
    setBusy(true);
    try {
      const bal = await fetchBalance({ data: keys });
      setLiveBalance(bal);
      setKeysOk(true);
      const usd = USD_BALANCE_KEYS.map((k) => Number(bal[k] ?? 0)).reduce((a, b) => a + b, 0);
      toast.success(`Kraken connected · USD ${usd.toFixed(2)}`);
    } catch (err) {
      setKeysOk(false);
      toast.error(err instanceof Error ? err.message : "Kraken auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function askSentinel() {
    const sig = signals[0];
    if (!sig) {
      toast.message("No signal on the blotter yet");
      return;
    }
    setGrokBusy(true);
    try {
      const res = await secondRead({
        data: {
          pair: sig.pair,
          price: sig.price,
          changePct: 0,
          rsi: sig.rsi,
          reason: sig.reason,
          kind: sig.kind,
          equity: desk.equity,
          exposure: desk.exposure,
        },
      });
      if (!res.ok) toast.error(res.error);
      else setGrokNote(res.text);
    } finally {
      setGrokBusy(false);
    }
  }

  function togglePair(id: PairId) {
    if (pairs.includes(id)) {
      if (pairs.length === 1) return;
      setPairs(pairs.filter((p) => p !== id));
    } else setPairs([...pairs, id]);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Desk settings">
          <div className="space-y-6">
            <section className="space-y-3">
              <Label>How the floor works your money</Label>
              <ol className="space-y-2 text-2xs text-muted">
                <li>
                  <span className="text-treasury">1.</span> Deposit USD on Kraken (Funding →
                  deposit). The bot cannot move money in or out.
                </li>
                <li>
                  <span className="text-treasury">2.</span> Create an API key with Query + Create
                  & Modify Orders. Leave Withdrawal off.
                </li>
                <li>
                  <span className="text-treasury">3.</span> Paste the key here, test it, switch to
                  Live, then Arm.
                </li>
                <li>
                  <span className="text-treasury">4.</span> Auto-trade on. Hunter, Signal, Regime,
                  Flow, Risk, Treasury and Runner work the book. Stops and the daily-loss halt stay
                  on.
                </li>
              </ol>
              <p className="text-2xs text-subtle">
                Paper is the rehearsal. Live spends real Kraken cash. This desk can lose money.
              </p>
            </section>

            <section className="space-y-3">
              <Label>Book</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={mode === "paper" ? "default" : "outline"}
                  onClick={() => setMode("paper")}
                >
                  Paper
                </Button>
                <Button
                  size="sm"
                  variant={mode === "live" ? "live" : "outline"}
                  onClick={() => setMode("live")}
                >
                  Live Kraken
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auto">Auto-trade</Label>
                <Switch id="auto" checked={autoTrade} onCheckedChange={setAutoTrade} />
              </div>
              <p className="text-2xs text-subtle">
                Paper is demo on live Kraken 1-minute candles — real RSI/EMA/MACD, fake cash. Live
                uses 5-minute bars and sends real market orders after you arm.
              </p>
              {mode === "paper" ? (
                <Button
                  size="sm"
                  variant="good"
                  onClick={() => {
                    void (async () => {
                      const res = await scanLiveTape();
                      if (res.acted) toast.success(res.note);
                      else toast.message(res.note);
                      setOpen(false);
                    })();
                  }}
                >
                  Scan live tape
                </Button>
              ) : null}
            </section>

            <section className="space-y-3">
              <Label>Kraken API</Label>
              <Input
                type="text"
                autoComplete="off"
                placeholder="API key"
                value={keys.apiKey}
                onChange={(e) => setKeys({ ...keys, apiKey: e.target.value })}
              />
              <Input
                type="password"
                autoComplete="off"
                placeholder="Private key (base64)"
                value={keys.apiSecret}
                onChange={(e) => setKeys({ ...keys, apiSecret: e.target.value })}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy || !keys.apiKey} onClick={() => void testKeys()}>
                  {busy ? "Testing…" : "Test connection"}
                </Button>
                <Button
                  size="sm"
                  variant={liveArmed ? "danger" : "live"}
                  disabled={mode !== "live" || keysOk !== true}
                  onClick={() => (liveArmed ? setLiveArmed(false) : setArmAsk(true))}
                >
                  {liveArmed ? "Disarm" : "Arm live"}
                </Button>
              </div>
              {keysOk === true ? (
                <p className="text-2xs text-good">Keys accepted. Keys stay in this browser.</p>
              ) : keysOk === false ? (
                <p className="text-2xs text-danger">Kraken rejected the keys.</p>
              ) : (
                <p className="text-2xs text-subtle">
                  Create a Kraken key with Query + Create & Modify Orders. Withdrawal keys are not
                  needed and should stay off.
                </p>
              )}
              {liveBalance ? (
                <ul className="grid grid-cols-2 gap-1 text-2xs">
                  {Object.entries(liveBalance)
                    .filter(([, v]) => Number(v) > 0)
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <li key={k} className="flex justify-between text-muted">
                        <span>{k}</span>
                        <span className="stat-num text-fg">{Number(v).toPrecision(4)}</span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </section>

            <section className="space-y-3">
              <Label>Book — grow the wallet</Label>
              <p className="text-2xs text-subtle">
                Core compounds. Heat only if the meme is actually rising. xStocks are tokenized
                NVDA/TSLA/AAPL/SPY on Kraken (not available in the US). Nothing here is a promise.
                Memes can go to zero.
              </p>
              {(["core", "heat", "stock"] as BookSleeve[]).map((sleeve) => (
                <div key={sleeve}>
                  <p className="font-display text-micro tracking-[0.14em] text-muted uppercase">
                    {SLEEVE_META[sleeve].label}
                    <span className="ml-2 font-sans tracking-normal text-subtle normal-case">
                      {SLEEVE_META[sleeve].blurb}
                    </span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {PAIRS.filter((p) => p.sleeve === sleeve).map((p) => {
                      const on = pairs.includes(p.id);
                      return (
                        <Button
                          key={p.id}
                          size="micro"
                          variant={on ? "default" : "outline"}
                          onClick={() => togglePair(p.id)}
                        >
                          {p.base}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-4">
              <Label>Risk</Label>
              <RiskRow
                label={`Size ${(risk.sizePct * 100).toFixed(1)}%`}
                value={risk.sizePct}
                min={0.005}
                max={0.08}
                step={0.005}
                onChange={(v) => setRisk({ sizePct: v })}
              />
              <RiskRow
                label={`Stop ${(risk.stopPct * 100).toFixed(1)}%`}
                value={risk.stopPct}
                min={0.005}
                max={0.05}
                step={0.005}
                onChange={(v) => setRisk({ stopPct: v })}
              />
              <RiskRow
                label={`Take ${(risk.takePct * 100).toFixed(1)}%`}
                value={risk.takePct}
                min={0.008}
                max={0.08}
                step={0.005}
                onChange={(v) => setRisk({ takePct: v })}
              />
              <RiskRow
                label={`Max daily loss ${(risk.maxDailyLossPct * 100).toFixed(0)}%`}
                value={risk.maxDailyLossPct}
                min={0.01}
                max={0.15}
                step={0.01}
                onChange={(v) => setRisk({ maxDailyLossPct: v })}
              />
              <RiskRow
                label={`Max positions ${risk.maxPositions}`}
                value={risk.maxPositions}
                min={1}
                max={6}
                step={1}
                onChange={(v) => setRisk({ maxPositions: Math.round(v) })}
              />
            </section>

            <section className="space-y-3">
              <Label>Paper cash</Label>
              <Input
                type="number"
                min={1000}
                step={1000}
                value={startingCash}
                onChange={(e) => setStartingCash(Number(e.target.value) || 10_000)}
              />
              <Button size="sm" variant="outline" onClick={resetPaper}>
                Reset paper book
              </Button>
            </section>

            <section className="space-y-3">
              <Label>Self-learning brain</Label>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="learn">Learn from fills</Label>
                <Switch id="learn" checked={selfLearn} onCheckedChange={setSelfLearn} />
              </div>
              <p className="text-2xs text-subtle">
                Archivist scores every close. RSI bands, confidence floor, size tilt, and pair bias
                move after wins and losses. Bad setups get retired.
              </p>
              <div className="grid grid-cols-2 gap-1 text-2xs text-muted">
                <div className="flex justify-between">
                  <span>Samples</span>
                  <span className="stat-num text-fg">{brain.samples}</span>
                </div>
                <div className="flex justify-between">
                  <span>Win rate</span>
                  <span className="stat-num text-fg">
                    {brain.samples ? `${Math.round((brain.wins / brain.samples) * 100)}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>RSI buy/sell</span>
                  <span className="stat-num text-fg">
                    {brain.rsiBuy.toFixed(0)}/{brain.rsiSell.toFixed(0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Min conf</span>
                  <span className="stat-num text-fg">{(brain.minConf * 100).toFixed(0)}%</span>
                </div>
              </div>
              {brain.lessons[0] ? (
                <p className="text-2xs text-muted">{brain.lessons[0].note}</p>
              ) : null}
              <Button size="sm" variant="outline" onClick={resetBrain}>
                Reset brain
              </Button>
            </section>

            <section className="space-y-3">
              <Label>Sentinel</Label>
              <Button size="sm" variant="outline" disabled={grokBusy} onClick={() => void askSentinel()}>
                {grokBusy ? "Reading…" : "Second read on last signal"}
              </Button>
              <p className="text-2xs text-subtle">
                User-triggered Grok pass. Not fired on every tick.
              </p>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={armAsk} onOpenChange={setArmAsk}>
        <DialogContent>
          <DialogTitle>Arm live runner</DialogTitle>
          <DialogDescription>
            This lets the desk send real market orders to your Kraken account when auto-trade is
            on. Size, stops, and the daily-loss halt still apply. The kill switch cancels open
            orders.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setArmAsk(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setLiveArmed(true);
                setArmAsk(false);
                toast.message("Live runner armed");
              }}
            >
              Arm live
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pending)} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent>
          <DialogTitle>Confirm ticket</DialogTitle>
          <DialogDescription>
            {pending
              ? `${pending.side.toUpperCase()} ${pending.qty} ${pending.pair} @ ${pending.price.toFixed(2)} · ${pending.mode}`
              : ""}
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Dismiss
            </Button>
            <Button
              onClick={() => {
                if (pending) void executeOrder(pending);
              }}
            >
              Fill
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RiskRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-2xs text-muted">
        <span>{label}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}
