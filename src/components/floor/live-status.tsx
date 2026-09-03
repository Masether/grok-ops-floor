import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moneyFull } from "@/lib/format";
import { liveSleeve } from "@/lib/live-budget";
import { useFloor } from "@/lib/store";
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
  const setMode = useFloor((s) => s.setMode);
  const setLiveArmed = useFloor((s) => s.setLiveArmed);
  const setSettingsOpen = useFloor((s) => s.setSettingsOpen);
  const sleeve = liveSleeve({ liveBudget, liveBalance, positions, tickers });
  const keyed = Boolean(keys.apiKey && keys.apiSecret);
  const connected = keyed && keysOk === true;
  const live = mode === "live" && liveArmed;

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
          {live ? "Live · Kraken" : connected ? "Kraken linked · paper still on" : "Paper desk"}
        </p>
        <p className={cn("stat-num text-sm", live ? "text-danger" : "text-fg")}>
          {live
            ? `Spending Kraken USD ${moneyFull(sleeve.usd || sleeve.venue)} · budget ${moneyFull(sleeve.budget)} · paper OFF`
            : connected
              ? `Kraken sees USD ${moneyFull(sleeve.usd)} · USDT ${moneyFull(sleeve.usdt)} · tickets still use play money until you arm`
              : "Play money only. Keys + Arm live to spend Kraken USD."}
        </p>
        <p className="mt-1 text-micro text-subtle">
          Overnight: leave this tab open. Max $100 in lots so $100 stays as change. Tickets from
          min (~$12) to remaining working cash. Winning closes settle to USD on Kraken. Scout{" "}
          {scoutScanned || "—"} books · dropped {scoutDropped} under $10k liq · hot{" "}
          {scoutHot?.length ?? 0}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {live ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => {
              setLiveArmed(false);
              setMode("paper");
              toast.message("Paper on — Kraken not spending.");
            }}
          >
            Disarm · paper
          </Button>
        ) : connected ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="live"
              onClick={() => {
                setMode("live");
                setLiveArmed(true);
                toast.message(`Live on Kraken — budget ${moneyFull(liveBudget)}. Paper off.`);
              }}
            >
              Arm live · use Kraken
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
              Keys
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="live" onClick={() => setSettingsOpen(true)}>
            Connect Kraken
          </Button>
        )}
      </div>
    </section>
  );
}
