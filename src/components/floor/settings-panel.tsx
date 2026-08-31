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
import { HumanGate } from "@/components/floor/human-gate";
import { executeOrder, scanLiveTape } from "@/lib/engine";
import { secondRead } from "@/lib/grok-brief";
import { testVenueKeys } from "@/lib/human-gate-api";
import { PAIRS, SLEEVE_META, USD_BALANCE_KEYS } from "@/lib/kraken";
import { readHumanToken } from "@/lib/human-gate.mjs";
import { rejectWalletSecret } from "@/lib/launch.mjs";
import { useDesk, useFloor } from "@/lib/store";
import type { BookSleeve, PairId } from "@/lib/types";
import { COMING_SOON_VENUES } from "@/lib/venues";
import { DurationPills } from "./duration-pills";

export function SettingsPanel() {
  const open = useFloor((s) => s.settingsOpen);
  const setOpen = useFloor((s) => s.setSettingsOpen);
  const mode = useFloor((s) => s.mode);
  const setMode = useFloor((s) => s.setMode);
  const autoTrade = useFloor((s) => s.autoTrade);
  const setAutoTrade = useFloor((s) => s.setAutoTrade);
  const liveArmed = useFloor((s) => s.liveArmed);
  const setLiveArmed = useFloor((s) => s.setLiveArmed);
  const venueId = useFloor((s) => s.venueId);
  const setVenueId = useFloor((s) => s.setVenueId);
  const humanVerified = useFloor((s) => s.humanVerified);
  const launched = useFloor((s) => s.launched);
  const floorOpen = useFloor((s) => s.floorOpen);
  const stopDesk = useFloor((s) => s.stopDesk);
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
  const sessionMinutes = useFloor((s) => s.sessionMinutes);
  const setSessionMinutes = useFloor((s) => s.setSessionMinutes);
  const [armAsk, setArmAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function testKeys() {
    const token = readHumanToken();
    if (!humanVerified || !token) {
      toast.error("Verify you're human before linking an account.");
      return;
    }
    const seedErr = rejectWalletSecret(keys.apiKey) || rejectWalletSecret(keys.apiSecret);
    if (seedErr) {
      toast.error(seedErr);
      return;
    }
    setBusy(true);
    try {
      const res = await testVenueKeys({
        data: {
          venueId,
          apiKey: keys.apiKey,
          apiSecret: keys.apiSecret,
          humanToken: token,
        },
      });
      setLiveBalance(res.balance);
      setKeysOk(true);
      const usd = USD_BALANCE_KEYS.map((k) => Number(res.balance[k] ?? 0)).reduce((a, b) => a + b, 0);
      toast.success(`${venueId === "kraken" ? "Kraken" : "Venue"} connected · USD ${usd.toFixed(2)}`);
    } catch (err) {
      setKeysOk(false);
      toast.error(err instanceof Error ? err.message : "Venue auth failed");
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

  function exportJournal() {
    const snap = useFloor.getState();
    const filled = snap.orders.filter((o) => o.status === "filled").slice(-40);
    const payload = {
      exportedAt: new Date().toISOString(),
      mode: snap.mode,
      desk: {
        equity: desk.equity,
        cash: desk.cash,
        exposure: desk.exposure,
        unrealized: desk.unrealized,
        realized: desk.realized,
        dayPnl: desk.dayPnl,
        fills: desk.fills,
        wins: desk.wins,
        losses: desk.losses,
        briefs: desk.briefs,
        openPositions: desk.openPositions,
      },
      brain: snap.brain,
      lessons: snap.brain.lessons,
      orders: filled,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grok-ops-journal-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.message("Journal downloaded");
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
                  <span className="text-treasury">1.</span> Paper: set capital and risk %, then
                  start the desk. The bot cannot deposit or withdraw.
                </li>
                <li>
                  <span className="text-treasury">2.</span> Live: verify you're human, then attach
                  an exchange account with Query + Orders keys. Withdrawal stays off.
                </li>
                <li>
                  <span className="text-treasury">3.</span> Test the connection, switch to Live,
                  then Arm. Live still needs test + arm. No withdrawal.
                </li>
                <li>
                  <span className="text-treasury">4.</span> Auto-trade on. Stops and the daily-loss
                  halt stay on. On-chain wallets are not in this build.
                </li>
              </ol>
              <p className="text-2xs text-subtle">
                Paper is the rehearsal. Live spends real venue cash. This desk can lose money. Not
                financial advice.
              </p>
              {launched ? (
                <Button
                  size="sm"
                  variant={floorOpen ? "danger" : "outline"}
                  onClick={() => {
                    stopDesk();
                    toast.message("Desk stopped — book kept");
                  }}
                >
                  Stop desk
                </Button>
              ) : null}
            </section>

            <section className="space-y-3">
              <Label>Session duration</Label>
              <DurationPills
                value={sessionMinutes}
                onChange={(m) => {
                  setSessionMinutes(m);
                  toast.message(
                    m === 0
                      ? "Runs until you stop"
                      : launched
                        ? "Clock reset from now"
                        : `Session ${m}m on launch`,
                  );
                }}
              />
              <p className="text-2xs text-subtle">
                Changing this mid-session restarts the clock from now. When it hits zero the desk
                stops new entries and keeps the book. Stops still protect open lots.
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
                  Live
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auto">Auto-trade</Label>
                <Switch id="auto" checked={autoTrade} onCheckedChange={setAutoTrade} />
              </div>
              <p className="text-2xs text-subtle">
                Paper is demo on live Kraken candles — real RSI/EMA/MACD, fake cash. Bar size is
                the Charts interval. Live sends real market orders only after you arm.
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
              <Label>Venue</Label>
              {mode === "paper" ? (
                <p className="text-2xs text-subtle">
                  Paper needs no venue. Attach an exchange when you switch to Live.
                </p>
              ) : (
                <>
                  <p className="text-2xs text-muted">
                    Attach an exchange account with Query + Orders keys. Withdrawal stays off.
                    On-chain wallets are not in this build.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="micro"
                      variant={venueId === "kraken" ? "default" : "outline"}
                      onClick={() => setVenueId("kraken")}
                    >
                      Kraken
                    </Button>
                    {COMING_SOON_VENUES.map((v) => (
                      <Button key={v.id} size="micro" variant="outline" disabled>
                        {v.label} · next
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="space-y-3">
              <Label>Exchange API</Label>
              <HumanGate />
              <Input
                type="text"
                autoComplete="off"
                placeholder="API key"
                disabled={!humanVerified}
                value={keys.apiKey}
                onChange={(e) => setKeys({ ...keys, apiKey: e.target.value })}
              />
              <Input
                type="password"
                autoComplete="off"
                placeholder="API secret (base64) — not a wallet key"
                disabled={!humanVerified}
                value={keys.apiSecret}
                onChange={(e) => setKeys({ ...keys, apiSecret: e.target.value })}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !keys.apiKey || !humanVerified}
                  onClick={() => void testKeys()}
                >
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
                  Verify you're human, then paste Query + Orders keys. Withdrawal stays off. Seed
                  phrases and wallet private keys are rejected.
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
                label={`Size per ticket ${(risk.sizePct * 100).toFixed(1)}% of capital`}
                value={risk.sizePct}
                min={0.005}
                max={0.08}
                step={0.005}
                onChange={(v) => setRisk({ sizePct: v })}
              />
              <RiskRow
                label={`Stop loss ${(risk.stopPct * 100).toFixed(1)}% of capital`}
                value={risk.stopPct}
                min={0.005}
                max={0.05}
                step={0.005}
                onChange={(v) => setRisk({ stopPct: v })}
              />
              <RiskRow
                label={`Take profit ${(risk.takePct * 100).toFixed(1)}% of capital`}
                value={risk.takePct}
                min={0.008}
                max={0.08}
                step={0.005}
                onChange={(v) => setRisk({ takePct: v })}
              />
              <RiskRow
                label={`Max daily loss ${(risk.maxDailyLossPct * 100).toFixed(0)}% of capital`}
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
                min={100}
                step={100}
                value={startingCash}
                onChange={(e) => setStartingCash(Math.max(100, Number(e.target.value) || 10_000))}
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
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={resetBrain}>
                  Reset brain
                </Button>
                <Button size="sm" variant="outline" onClick={exportJournal}>
                  Export journal
                </Button>
              </div>
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
