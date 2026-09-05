import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { haltLive } from "@/lib/engine-call";
import { moneyFull } from "@/lib/format";
import { HEAT_BUDGET_PCT, heatAllowed, heatLotCount, heatOpenUsd } from "@/lib/book-balance";
import { bookDayPnl } from "@/lib/desk-pnl";
import { HEAT_MAX_LOTS, HEAT_PAIRS } from "@/lib/kraken";
import { liveDayBase, liveSleeve } from "@/lib/live-budget";
import { useFloor } from "@/lib/store";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";

export function LiveStatusBar() {
  const mode = useFloor((s) => s.mode);
  const liveArmed = useFloor((s) => s.liveArmed);
  const keysOk = useFloor((s) => s.keysOk);
  const keys = useFloor((s) => s.keys);
  const liveBalance = useFloor((s) => s.liveBalance);
  const liveBudget = useFloor((s) => s.liveBudget);
  const scoutScanned = useFloor((s) => s.scoutScanned);
  const scoutDropped = useFloor((s) => s.scoutDropped);
  const scoutHot = useFloor((s) => s.scoutHot);
  const positions = useFloor((s) => s.positions);
  const tickers = useFloor((s) => s.tickers);
  const dayStartEquity = useFloor((s) => s.dayStartEquity);
  const realized = useFloor((s) => s.realized);
  const setMode = useFloor((s) => s.setMode);
  const setLiveArmed = useFloor((s) => s.setLiveArmed);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const sleeve = liveSleeve({ liveBudget, liveBalance, positions, tickers });
  const heatOpen = heatOpenUsd(positions, tickers);
  const heatLots = heatLotCount(positions);
  const heatCap = sleeve.budget * HEAT_BUDGET_PCT;
  const day = bookDayPnl(
    sleeve.equity,
    liveDayBase({
      dayStart: dayStartEquity,
      budget: sleeve.budget,
      equity: sleeve.equity,
      openLots: positions.length,
    }),
  );
  const heatOn = heatAllowed(day);
  const heatPct = heatCap > 0 ? Math.min(100, (heatOpen / heatCap) * 100) : 0;
  const keyed = Boolean(keys.apiKey && keys.apiSecret);
  const connected = keyed && keysOk !== false;
  const live = (mode === "live" || liveArmed) && keyed;

  return (
    <section
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-sm px-3 py-2",
        live
          ? "bg-danger/15 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_45%,transparent)]"
          : connected
            ? "bg-surface-2 shadow-[0_0_0_1px_var(--color-border-strong)]"
            : "bg-surface shadow-[0_0_0_1px_var(--color-border)]",
      )}
    >
      <div className="min-w-0">
        <p className="font-display text-micro tracking-[0.16em] uppercase">
          {connected ? (keysOk === true ? "AUTO BOT · Kraken" : "Kraken keys — testing") : "Connect Kraken"}
        </p>
        <p className={cn("stat-num text-sm", live ? "text-danger" : "text-fg")}>
          {connected
            ? `USD + BTC · fees in the ticket · ${sleeve.btc?.toFixed(5) ?? "0"} BTC + ${moneyFull(sleeve.usd)} USD · budget ${moneyFull(sleeve.budget)}`
            : "Query + Orders keys in Settings. No paper book."}
        </p>
        <p className="mt-1 text-micro text-subtle">
          Grid + DCA today. Scalp only a huge rising spike from the 1m tape or a trend wire. Scout{" "}
          {scoutDropped} · hot {scoutHot?.length ?? 0}.
        </p>
        <SignedOut>
          <p className="mt-1 text-2xs text-warn">
            Sign in (header) with the same Google/X as Grok — then open this floor on your phone to
            watch the book. Keys stay on this laptop.
          </p>
        </SignedOut>
        <SignedIn>
          <p className="mt-1 text-2xs text-subtle">
            Book syncs to your Grok login every few seconds. Phone without keys = watch only.
          </p>
        </SignedIn>
        <p className={cn("mt-1 stat-num text-2xs", heatOn ? "text-fg" : "text-warn")}>
          Heat {heatOn ? "live" : "sleep"} · {heatLots}/{HEAT_MAX_LOTS} lots ·{" "}
          {moneyFull(heatOpen)} / {moneyFull(heatCap)} ({heatPct.toFixed(0)}%) · day{" "}
          {day >= 0 ? "+" : ""}
          {moneyFull(day)} · names {HEAT_PAIRS.map((id) => id.replace("USD", "")).join(" ")}
          {realized < 0 ? ` · realized ${moneyFull(realized)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {connected ? (
          <Button
            type="button"
            size="sm"
            variant={live ? "danger" : "live"}
            onClick={() => {
              if (live) {
                haltLive();
                toast.message("Halt — new tickets stopped. Open lots still protected.");
              } else {
                setMode("live");
                setLiveArmed(true);
                toast.message(`Live on Kraken — budget ${moneyFull(liveBudget)}.`);
              }
            }}
          >
            {live ? "Halt" : "Arm live"}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="live" onClick={() => setSettingsOpen(true)}>
            Connect Kraken
          </Button>
        )}
      </div>
    </section>
  );
}
