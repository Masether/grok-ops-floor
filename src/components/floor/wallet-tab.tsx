import { ArrowRightLeft, ArrowUpRight, Repeat } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Switch } from "@/components/ui/field";
import { money, moneyFull, px, qty } from "@/lib/format";
import { PAIR_BY_ID } from "@/lib/kraken";
import { persistDeskBook } from "@/lib/profile";
import { flushFloorPersist, useDesk, useFloor, type TransferRow, type WalletId } from "@/lib/store";
import { sweepableProfit, vaultMark, type ExternalDest } from "@/lib/wallet";
import type { PairId } from "@/lib/types";
import { cn } from "@/lib/utils";

type Pane = "wallet" | "convert" | "send" | "move";

export function WalletTab() {
  const [pane, setPane] = useState<Pane>("wallet");
  return (
    <div className="px-3 py-3">
      <ol className="grid grid-cols-4 gap-px overflow-hidden rounded-sm bg-border">
        {(
          [
            ["01", "Desk"],
            ["02", "Wallet"],
            ["03", "Convert"],
            ["04", "Send"],
          ] as const
        ).map(([n, label], i) => {
          const on =
            (pane === "wallet" && i <= 1) ||
            (pane === "convert" && i <= 2) ||
            (pane === "send" && i <= 3) ||
            (pane === "move" && i === 1);
          return (
            <li key={label} className={cn("bg-surface px-2 py-2", on && "bg-surface-2")}>
              <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">{n}</div>
              <div className={cn("font-display text-2xs tracking-[0.08em] uppercase", on ? "text-fg" : "text-muted")}>
                {label}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["wallet", "Wallet"],
            ["convert", "Convert"],
            ["send", "Send out"],
            ["move", "Transfer"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            className="min-h-11"
            variant={pane === id ? "default" : "outline"}
            aria-pressed={pane === id}
            onClick={() => setPane(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="mt-4">
        {pane === "wallet" ? <WalletPane onSend={() => setPane("send")} onConvert={() => setPane("convert")} /> : null}
        {pane === "convert" ? <ConvertPane /> : null}
        {pane === "send" ? <SendPane /> : null}
        {pane === "move" ? <MovePane /> : null}
      </div>
    </div>
  );
}

function WalletPane({ onSend, onConvert }: { onSend: () => void; onConvert: () => void }) {
  const fundingCash = useFloor((s) => s.fundingCash);
  const cash = useFloor((s) => s.cash);
  const transfers = useFloor((s) => s.transfers);
  const autoSweep = useFloor((s) => s.autoSweep);
  const setAutoSweep = useFloor((s) => s.setAutoSweep);
  const sweepProfit = useFloor((s) => s.sweepProfit);
  const sweptTotal = useFloor((s) => s.sweptTotal);
  const realized = useFloor((s) => s.realized);
  const vault = useFloor((s) => s.vault);
  const pairs = useFloor((s) => s.pairs);
  const tickers = useFloor((s) => s.tickers);
  const mode = useFloor((s) => s.mode);
  const liveArmed = useFloor((s) => s.liveArmed);
  const depositFunding = useFloor((s) => s.depositFunding);
  const desk = useDesk();
  const [deposit, setDeposit] = useState("1000");

  const due = sweepableProfit(realized, sweptTotal, cash);
  const last: Partial<Record<PairId, number>> = {};
  for (const p of pairs) last[p] = tickers[p]?.last;
  const vaultUsd = vaultMark(vault, last);
  const walletUsd = fundingCash + vaultUsd;

  const onDeposit = () => {
    const res = depositFunding(Number(deposit));
    if (!res.ok) {
      toast.message(res.reason);
      return;
    }
    toast.success(`Deposited ${moneyFull(Number(deposit))} to bot wallet`);
    persistProfile();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <WalletCard
          label="Bot wallet"
          sub="profits · not at risk"
          value={moneyFull(walletUsd)}
          extra={`${money(fundingCash)} USD · ${money(vaultUsd)} coin`}
          tone="good"
        />
        <WalletCard
          label="Trading desk"
          sub="live book"
          value={moneyFull(desk.equity)}
          extra={`${money(cash)} free`}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-sm bg-surface-2 px-3 py-2.5 shadow-[0_0_0_1px_var(--color-border)]">
        <div className="min-w-0">
          <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
            Auto-sweep profits
          </p>
          <p className="text-2xs text-muted">
            {autoSweep
              ? liveArmed
                ? `On · winning closes settle to USD on Kraken · logged ${moneyFull(sweptTotal)}`
                : `On · winning closes sweep to the bot wallet · swept ${moneyFull(sweptTotal)} · ${moneyFull(due)} ready`
              : "Off — profit stays on the desk"}
          </p>
        </div>
        <Switch
          checked={autoSweep}
          onCheckedChange={(v) => setAutoSweep(v === true)}
          aria-label="Auto-sweep profits"
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full min-h-11"
        disabled={due < 0.5}
        onClick={() => {
          const res = sweepProfit();
          if (!res.ok) {
            toast.message(res.reason);
            return;
          }
          toast.success(`Swept ${moneyFull(res.amount)} to bot wallet`);
          persistProfile();
        }}
      >
        Sweep {moneyFull(due)} now
      </Button>

      <p className="text-2xs text-muted">
        Live USD sits on Kraken. Auto-sweep parks the profit bucket here so you can convert, then
        send out.
      </p>

      {vault.length > 0 ? (
        <ul className="space-y-1 text-2xs text-muted">
          {vault.map((l) => (
            <li key={l.pair} className="flex justify-between">
              <span>{PAIR_BY_ID[l.pair]?.base ?? l.pair}</span>
              <span className="stat-num text-fg">
                {qty(l.qty, Math.min(PAIR_BY_ID[l.pair]?.decimals ?? 6, 6))} ·{" "}
                {moneyFull((tickers[l.pair]?.last ?? 0) * l.qty)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={onConvert}>
          <Repeat className="size-3.5" />
          Convert
        </Button>
        <Button type="button" variant="good" className="min-h-11" onClick={onSend}>
          <ArrowUpRight className="size-3.5" />
          Send out
        </Button>
      </div>

      <Ledger transfers={transfers} />
    </div>
  );
}

function ConvertPane() {
  const convertWallet = useFloor((s) => s.convertWallet);
  const fundingCash = useFloor((s) => s.fundingCash);
  const vault = useFloor((s) => s.vault);
  const pairs = useFloor((s) => s.pairs);
  const tickers = useFloor((s) => s.tickers);
  const [convSide, setConvSide] = useState<"buy" | "sell">("buy");
  const [convPair, setConvPair] = useState<PairId>(pairs[0] ?? "XBTUSD");
  const [convAmt, setConvAmt] = useState("100");
  const convPx = tickers[convPair]?.last ?? 0;
  const convN = Number(convAmt) || 0;
  const lot = vault.find((l) => l.pair === convPair);

  const onConvert = () => {
    const res = convertWallet(convSide, convPair, convN);
    if (!res.ok) {
      toast.message(res.reason);
      return;
    }
    toast.success(
      convSide === "buy"
        ? `Converted ${moneyFull(convN)} → ${PAIR_BY_ID[convPair]?.base ?? convPair}`
        : `Converted ${PAIR_BY_ID[convPair]?.base ?? convPair} → USD`,
    );
    persistProfile();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConvert();
      }}
    >
      <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
        Convert in wallet
      </p>
      <p className="text-2xs text-subtle">
        Swap bot-wallet USD into a coin (or back). Stays in the wallet — Auto cannot spend it.
      </p>
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          variant={convSide === "buy" ? "default" : "outline"}
          onClick={() => setConvSide("buy")}
        >
          USD → coin
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          variant={convSide === "sell" ? "default" : "outline"}
          onClick={() => setConvSide("sell")}
        >
          Coin → USD
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1.5">
          <Label htmlFor="conv-pair">Coin</Label>
          <select
            id="conv-pair"
            className="h-11 w-full rounded-sm bg-bg px-2 font-mono text-sm text-fg shadow-[0_0_0_1px_var(--color-border-strong)]"
            value={convPair}
            onChange={(e) => setConvPair(e.target.value as PairId)}
          >
            {pairs.map((p) => (
              <option key={p} value={p}>
                {PAIR_BY_ID[p]?.base ?? p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <Label htmlFor="conv-amt">{convSide === "buy" ? "USD" : "Qty"}</Label>
          <Input
            id="conv-amt"
            className="h-11"
            type="number"
            min={convSide === "buy" ? 1 : 0}
            step={convSide === "buy" ? 10 : "any"}
            inputMode="decimal"
            value={convAmt}
            onChange={(e) => setConvAmt(e.target.value)}
          />
        </label>
      </div>
      <p className="text-2xs text-subtle">
        Wallet USD {moneyFull(fundingCash)}
        {lot
          ? ` · ${PAIR_BY_ID[convPair]?.base ?? convPair} ${qty(lot.qty, Math.min(PAIR_BY_ID[convPair]?.decimals ?? 6, 6))}`
          : ""}
        {convPx > 0 ? ` · mark ${px(convPx)}` : ""}
        {convSide === "buy" && convPx > 0
          ? ` · ~${(convN / convPx).toPrecision(4)} ${PAIR_BY_ID[convPair]?.base ?? ""}`
          : ""}
      </p>
      {vault.length > 0 ? (
        <ul className="space-y-1 text-2xs text-muted">
          {vault.map((l) => (
            <li key={l.pair} className="flex justify-between">
              <span>{PAIR_BY_ID[l.pair]?.base ?? l.pair}</span>
              <span className="stat-num text-fg">
                {qty(l.qty, Math.min(PAIR_BY_ID[l.pair]?.decimals ?? 6, 6))} ·{" "}
                {moneyFull((tickers[l.pair]?.last ?? 0) * l.qty)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-2xs text-subtle">No coin in the wallet yet. Sweep profit, then convert.</p>
      )}
      <Button type="button" className="w-full min-h-11" variant="outline" onClick={onConvert}>
        <Repeat className="size-3.5" />
        Convert
      </Button>
    </form>
  );
}

function SendPane() {
  const sendOut = useFloor((s) => s.sendOut);
  const fundingCash = useFloor((s) => s.fundingCash);
  const vault = useFloor((s) => s.vault);
  const tickers = useFloor((s) => s.tickers);
  const liveArmed = useFloor((s) => s.liveArmed);
  const mode = useFloor((s) => s.mode);
  const [dest, setDest] = useState<ExternalDest>("coinbase");
  const [asset, setAsset] = useState<"usd" | PairId>("usd");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);

  const price = asset === "usd" ? 1 : (tickers[asset]?.last ?? 0);
  const available =
    asset === "usd" ? fundingCash : (vault.find((l) => l.pair === asset)?.qty ?? 0);
  const n = Number(amount) || 0;
  const usdEst = asset === "usd" ? n : n * price;

  const runSend = () => {
    if (!preview) {
      if (n <= 0) {
        toast.message("Enter an amount.");
        return;
      }
      setPreview(true);
      return;
    }
    const res = sendOut(dest, asset, n, note || undefined);
    if (!res.ok) {
      toast.message(res.reason);
      setPreview(false);
      return;
    }
    const destLabel = dest === "coinbase" ? "Coinbase" : "Kraken";
    toast.success(
      liveArmed && dest === "coinbase"
        ? `Booked ${moneyFull(res.amount)} to Coinbase — finish withdraw in Kraken`
        : `Sent ${moneyFull(res.amount)} to ${destLabel}`,
    );
    setPreview(false);
    setAmount("");
    persistProfile();
  };

  const run = (e: FormEvent) => {
    e.preventDefault();
    runSend();
  };

  return (
    <form className="space-y-3" onSubmit={run}>
      <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">Send out</p>
      <p className="text-2xs text-muted">
        {mode === "live" || liveArmed
          ? "Live cash is already on Kraken. Sending to Kraken releases this wallet bucket. Sending to Coinbase books the take-off — finish Funding → Withdraw in the Kraken app. No seed, no withdrawal key in this app."
          : "Paper send so you can rehearse. On live, USD is already on Kraken; Coinbase is a Kraken withdraw you finish yourself."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setDest("kraken");
            setPreview(false);
          }}
          className={cn(
            "min-h-11 rounded-sm px-3 py-2.5 text-left",
            dest === "kraken"
              ? "bg-good/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-good)_50%,transparent)]"
              : "bg-surface-2 shadow-[0_0_0_1px_var(--color-border)]",
          )}
        >
          <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">Kraken</div>
          <p className="mt-0.5 text-2xs text-muted">Venue wallet</p>
        </button>
        <button
          type="button"
          onClick={() => {
            setDest("coinbase");
            setPreview(false);
          }}
          className={cn(
            "min-h-11 rounded-sm px-3 py-2.5 text-left",
            dest === "coinbase"
              ? "bg-good/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-good)_50%,transparent)]"
              : "bg-surface-2 shadow-[0_0_0_1px_var(--color-border)]",
          )}
        >
          <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">Coinbase</div>
          <p className="mt-0.5 text-2xs text-muted">External</p>
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          variant={asset === "usd" ? "default" : "outline"}
          onClick={() => {
            setAsset("usd");
            setPreview(false);
          }}
        >
          USD
        </Button>
        {vault.map((l) => (
          <Button
            key={l.pair}
            type="button"
            size="sm"
            className="min-h-11"
            variant={asset === l.pair ? "default" : "outline"}
            onClick={() => {
              setAsset(l.pair);
              setPreview(false);
            }}
          >
            {PAIR_BY_ID[l.pair]?.base ?? l.pair}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="send-amt">{asset === "usd" ? "Amount USD" : "Qty"}</Label>
          <button
            type="button"
            className="min-h-11 text-micro text-muted underline-offset-4 hover:text-fg hover:underline"
            onClick={() => {
              setAmount(String(Math.max(0, Math.round(available * 1e8) / 1e8)));
              setPreview(false);
            }}
          >
            Max {asset === "usd" ? moneyFull(available) : qty(available, 6)}
          </button>
        </div>
        <Input
          id="send-amt"
          className="h-11"
          type="number"
          min={asset === "usd" ? 1 : 0}
          step={asset === "usd" ? 1 : "any"}
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setPreview(false);
          }}
        />
        <p className="text-2xs text-subtle">
          {asset === "usd" ? `Wallet USD ${moneyFull(fundingCash)}` : `≈ ${moneyFull(usdEst)}`}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="send-note">Note (optional)</Label>
        <Input
          id="send-note"
          className="h-11"
          placeholder={dest === "coinbase" ? "Coinbase email or last 4" : "Kraken account note"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {preview ? (
        <div className="rounded-sm bg-surface-2 px-3 py-2 text-2xs text-muted shadow-[0_0_0_1px_var(--color-border)]">
          {liveArmed && dest === "coinbase"
            ? `Book ${moneyFull(usdEst)} off this wallet, then withdraw to Coinbase in Kraken.`
            : `Send ${moneyFull(usdEst)} from the bot wallet to ${dest === "coinbase" ? "Coinbase" : "Kraken"}.`}
        </div>
      ) : null}

      <Button type="button" className="w-full min-h-11" variant={preview ? "good" : "default"} onClick={runSend}>
        <ArrowUpRight className="size-3.5" />
        {preview ? "Confirm send" : "Preview send"}
      </Button>
    </form>
  );
}

function MovePane() {
  const fundingCash = useFloor((s) => s.fundingCash);
  const cash = useFloor((s) => s.cash);
  const transferFunds = useFloor((s) => s.transferFunds);
  const [from, setFrom] = useState<WalletId>("funding");
  const to: WalletId = from === "funding" ? "trading" : "funding";
  const available = from === "funding" ? fundingCash : cash;
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState(false);
  const n = Number(amount) || 0;

  const runMove = () => {
    if (!preview) {
      if (n <= 0) {
        toast.message("Enter an amount.");
        return;
      }
      setPreview(true);
      return;
    }
    const res = transferFunds(from, to, n);
    if (!res.ok) {
      toast.message(res.reason);
      setPreview(false);
      return;
    }
    toast.success(`Moved ${moneyFull(n)} ${labelFor(from)} → ${labelFor(to)}`);
    setPreview(false);
    setAmount("");
    persistProfile();
  };

  const run = (e: FormEvent) => {
    e.preventDefault();
    runMove();
  };

  return (
    <form className="space-y-3" onSubmit={run}>
      <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
        Desk ↔ wallet
      </p>
      <p className="text-2xs text-subtle">
        Move working capital onto the desk so Auto can trade it, or pull free cash back to the
        wallet.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setFrom("funding");
            setPreview(false);
          }}
          className={cn(
            "min-h-11 rounded-sm px-3 py-2.5 text-left",
            from === "funding"
              ? "bg-good/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-good)_50%,transparent)]"
              : "bg-surface-2 shadow-[0_0_0_1px_var(--color-border)]",
          )}
        >
          <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
            From wallet
          </div>
          <div className="stat-num text-sm">{moneyFull(fundingCash)}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setFrom("trading");
            setPreview(false);
          }}
          className={cn(
            "min-h-11 rounded-sm px-3 py-2.5 text-left",
            from === "trading"
              ? "bg-good/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-good)_50%,transparent)]"
              : "bg-surface-2 shadow-[0_0_0_1px_var(--color-border)]",
          )}
        >
          <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
            From desk
          </div>
          <div className="stat-num text-sm">{moneyFull(cash)} free</div>
        </button>
      </div>
      <p className="text-2xs text-muted">
        {labelFor(from)} → {labelFor(to)}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="xfer-amt">Amount USD</Label>
          <button
            type="button"
            className="min-h-11 text-micro text-muted underline-offset-4 hover:text-fg hover:underline"
            onClick={() => {
              setAmount(String(Math.max(0, Math.round(available * 100) / 100)));
              setPreview(false);
            }}
          >
            Max {moneyFull(available)}
          </button>
        </div>
        <Input
          id="xfer-amt"
          className="h-11"
          type="number"
          min={1}
          step={100}
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setPreview(false);
          }}
        />
      </div>
      {preview ? (
        <div className="rounded-sm bg-surface-2 px-3 py-2 text-2xs text-muted shadow-[0_0_0_1px_var(--color-border)]">
          Preview: {moneyFull(n)} from {labelFor(from)} to {labelFor(to)}. Confirm to post.
        </div>
      ) : null}
      <Button type="button" className="w-full min-h-11" variant={preview ? "good" : "default"} onClick={runMove}>
        <ArrowRightLeft className="size-3.5" />
        {preview ? "Confirm transfer" : "Preview transfer"}
      </Button>
    </form>
  );
}

function Ledger({ transfers }: { transfers: TransferRow[] }) {
  return (
    <div>
      <p className="font-display text-micro tracking-[0.14em] text-subtle uppercase">Recent wallet</p>
      {transfers.length === 0 ? (
        <p className="mt-1.5 text-2xs text-subtle">
          None yet. Winning closes auto-sweep here once Auto is running.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {transfers.map((t) => (
            <li key={t.id} className="flex justify-between text-2xs text-muted">
              <span>{xferLine(t)}</span>
              <span className="stat-num text-fg">{moneyFull(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function persistProfile() {
  flushFloorPersist();
  persistDeskBook();
}

function labelFor(id: WalletId): string {
  return id === "funding" ? "Bot wallet" : "Trading desk";
}

function xferLine(t: TransferRow): string {
  if (t.kind === "sweep") return "Sweep profit → wallet";
  if (t.kind === "deposit") return "Deposit";
  if (t.kind === "convert") return t.note ?? "Convert";
  if (t.kind === "send") {
    const dest = t.dest === "kraken" ? "Kraken" : t.dest === "coinbase" ? "Coinbase" : "out";
    return t.note ?? `Send → ${dest}`;
  }
  return `${labelFor(t.from)} → ${labelFor(t.to)}`;
}

function WalletCard({
  label,
  sub,
  value,
  extra,
  tone,
}: {
  label: string;
  sub: string;
  value: string;
  extra?: string;
  tone?: "good";
}) {
  return (
    <div className="rounded-sm bg-surface-2 px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]">
      <div className="font-display text-micro tracking-[0.14em] text-subtle uppercase">{label}</div>
      <div className={cn("stat-num text-base", tone === "good" ? "text-good" : "text-fg")}>{value}</div>
      <div className="text-micro text-subtle">{extra ?? sub}</div>
    </div>
  );
}
