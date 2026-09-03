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
import { executeOrder, refreshTreasury, scanLiveTape } from "@/lib/engine";
import { secondRead } from "@/lib/grok-brief";
import { testVenueKeys } from "@/lib/human-gate-api";
import { PAIRS, PAIR_BY_ID, SLEEVE_META } from "@/lib/kraken";
import { readHumanToken } from "@/lib/human-gate.mjs";
import { rejectWalletSecret } from "@/lib/launch.mjs";
import { useDesk, useFloor, ensurePaperDesk } from "@/lib/store";
import { persistDeskBook } from "@/lib/profile";
import type { BookSleeve, PairId } from "@/lib/types";
import { ALL_LANE_IDS, pickHotBook } from "@/lib/universe";
import { COMING_SOON_VENUES } from "@/lib/venues";
import { DurationPills } from "./duration-pills";
import { InstallAppButton } from "./install-app";
import { LIVE_BUDGET_PRESETS, clampLiveBudget, krakenKeysOn, liveSleeve } from "@/lib/live-budget";
import { PLAYBOOKS, type PlaybookId } from "@/lib/playbook";
import { moneyFull } from "@/lib/format";

export function SettingsPanel() {
  const open = useFloor((s) => s.settingsOpen);
  const setOpen = useFloor((s) => s.setSettingsOpen);
  const mode = useFloor((s) => s.mode);
  const setMode = useFloor((s) => s.setMode);
  const autoTrade = useFloor((s) => s.autoTrade);
  const setAutoTrade = useFloor((s) => s.setAutoTrade);
  const playbooks = useFloor((s) => s.playbooks);
  const setPlaybook = useFloor((s) => s.setPlaybook);
  const liveArmed = useFloor((s) => s.liveArmed);
  const setLiveArmed = useFloor((s) => s.setLiveArmed);
  const liveBudget = useFloor((s) => s.liveBudget);
  const setLiveBudget = useFloor((s) => s.setLiveBudget);
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
  const tickers = useFloor((s) => s.tickers);
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
  const resetBrain = useFloor((s) => s.resetBrain);
  const sessionMinutes = useFloor((s) => s.sessionMinutes);
  const setSessionMinutes = useFloor((s) => s.setSessionMinutes);
  const [armAsk, setArmAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function testKeys() {
    const saved = krakenKeysOn(keys);
    if (saved && !humanVerified) {
      setBusy(true);
      try {
        await refreshTreasury();
        const ok = useFloor.getState().keysOk;
        if (ok) toast.success("Saved Kraken keys still work.");
        else toast.error("Saved keys failed — paste them again.");
      } finally {
        setBusy(false);
      }
      return;
    }
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
      const sleeve = liveSleeve({
        liveBudget,
        liveBalance: res.balance,
        positions: useFloor.getState().positions,
      });
      toast.success(
        sleeve.usd >= 15
          ? `Kraken connected · USD ${sleeve.usd.toFixed(2)} · budget $${sleeve.budget.toFixed(0)}`
          : sleeve.usdt >= 15
            ? `Kraken connected · USDT ${sleeve.usdt.toFixed(2)} — convert to USD on Kraken, then test again`
            : `Kraken connected · USD ${sleeve.usd.toFixed(2)}. Deposit $200 USD on Kraken.`,
      );
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
      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) persistProfile();
        }}
      >
        <SheetContent title="Desk settings">
          <div className="space-y-6">
            <section className="space-y-3">
              <Label>How the floor works your money</Label>
              <ol className="space-y-2 text-2xs text-muted">
                <li>
                  <span className="text-treasury">1.</span> Paper starts with play money. No
                  wallet. No deposit. Test the twelve desks first.
                </li>
                <li>
                  <span className="text-treasury">2.</span> Live is optional: verify you're human,
                  then attach an exchange account with Query + Orders keys. Withdrawal stays off.
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
              ) : (
                <Button
                  size="sm"
                  variant="good"
                  onClick={() => {
                    if (ensurePaperDesk()) {
                      toast.success("Paper desk is on — $10k play money. No wallet needed.");
                      setOpen(false);
                    }
                  }}
                >
                  Start paper desk
                </Button>
              )}
              <InstallAppButton />
              <p className="text-2xs text-subtle">
                Install puts the desk on your phone Home Screen. The book is saved. The bot cannot
                trade while the phone is closed — it replays the tape when you open it again.
              </p>
            </section>

            <section className="space-y-3">
              <Label>Session duration</Label>
              <DurationPills
                value={sessionMinutes}
                onChange={(m) => {
                  setSessionMinutes(m);
                  toast.message(
                    m === 0
                      ? "24/7 — runs until you stop"
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
                Paper is demo on live Kraken candles. Live spends only the budget. Scalp, Grid, and
                DCA all sit inside that cap.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PLAYBOOKS.map((b) => (
                  <Button
                    key={b.id}
                    type="button"
                    size="sm"
                    variant={playbooks.includes(b.id) ? "default" : "outline"}
                    onClick={() => {
                      setPlaybook(b.id as PlaybookId);
                      toast.message(`${b.label} · ${b.hint}`);
                    }}
                  >
                    {b.label}
                  </Button>
                ))}
              </div>
              <p className="text-2xs text-subtle">
                All three run together, split across the $200 cap (40% scalp / 35% grid / 25% DCA).
                MACD routes: up → scalp, chop → grid, reset → DCA. Tap a book to pause it.
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
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="live-budget">Live budget (USD)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {LIVE_BUDGET_PRESETS.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={liveBudget === n ? "live" : "outline"}
                        onClick={() => setLiveBudget(n)}
                      >
                        ${n}
                      </Button>
                    ))}
                  </div>
                  <Input
                    id="live-budget"
                    type="number"
                    min={20}
                    max={50_000}
                    step={10}
                    inputMode="decimal"
                    value={liveBudget}
                    onChange={(e) => setLiveBudget(Number(e.target.value) || 0)}
                    onBlur={() => setLiveBudget(clampLiveBudget(liveBudget))}
                  />
                  <p className="text-2xs text-subtle">
                    The bot only spends this slice — even if Kraken holds more. Default $200 USD.
                    Deposit USD on Kraken, then arm. Leave Withdraw off the API key.
                  </p>
                </div>
              )}
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
                placeholder={krakenKeysOn(keys) ? "API key saved on this device" : "API key"}
                disabled={!humanVerified && !krakenKeysOn(keys)}
                value={keys.apiKey}
                onChange={(e) => setKeys({ ...keys, apiKey: e.target.value })}
              />
              <Input
                type="password"
                autoComplete="off"
                placeholder={krakenKeysOn(keys) ? "Secret saved on this device" : "API secret (base64) — not a wallet key"}
                disabled={!humanVerified && !krakenKeysOn(keys)}
                value={keys.apiSecret}
                onChange={(e) => setKeys({ ...keys, apiSecret: e.target.value })}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !keys.apiKey || (!humanVerified && !krakenKeysOn(keys))}
                  onClick={() => void testKeys()}
                >
                  {busy ? "Testing…" : "Test connection"}
                </Button>
                <Button
                  size="sm"
                  variant={liveArmed ? "danger" : "live"}
                  disabled={mode !== "live" || (keysOk !== true && !krakenKeysOn(keys))}
                  onClick={() => (liveArmed ? setLiveArmed(false) : setArmAsk(true))}
                >
                  {liveArmed ? "Disarm" : "Arm live"}
                </Button>
              </div>
              {krakenKeysOn(keys) ? (
                <p className="text-2xs text-good">
                  Keys stay in this browser. You do not paste them again on this device.
                </p>
              ) : keysOk === true ? (
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Book — grow the wallet</Label>
                <Button
                  type="button"
                  size="micro"
                  variant="outline"
                  onClick={() => {
                    const picked = pickHotBook(tickers, ALL_LANE_IDS);
                    setPairs(picked);
                    toast.message(
                      `All three: ${picked.map((id) => PAIR_BY_ID[id].base).join(" · ")}`,
                    );
                  }}
                >
                  All three · bot pick
                </Button>
              </div>
              <p className="text-2xs text-subtle">
                All three lanes: hot tape, uprising alts, and memes. xStocks are tokenized
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
              <p className="text-2xs text-subtle">
                Always on. Archivist scores every close in Paper, Auto, and Learn. RSI bands,
                confidence, size tilt, and pair bias move after wins and losses. Learn walks daily
                and weekly candles from the first print we can get.
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
            Real market orders on Kraken, capped at {moneyFull(liveBudget)} USD. Size, stops, and
            the daily-loss halt stay on that budget — not your whole wallet. Deposit USD, then arm.
            Winning closes auto-sweep into the in-app wallet. Kill switch is the power button. No
            withdrawal key. Not financial advice — you can lose this ${liveBudget.toFixed(0)}.
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
                toast.message(`Live armed — budget ${moneyFull(liveBudget)}. Profits auto-sweep.`);
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

function persistProfile() {
  persistDeskBook();
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
