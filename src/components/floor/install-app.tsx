import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstall = Event & { prompt: () => Promise<void> };

function isStandalone() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt] = useState<BeforeInstall | null>(null);
  const [home, setHome] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHome(isStandalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstall);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    try {
      if (new URLSearchParams(window.location.search).get("install") === "1") setOpen(true);
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (home) return null;

  return (
    <>
      <Button
        type="button"
        size={compact ? "icon" : "sm"}
        variant={open ? "default" : "outline"}
        aria-label="Install on phone"
        aria-pressed={open}
        onClick={() => setOpen(true)}
      >
        <Smartphone className="size-3.5" />
        {compact ? null : <span>Install</span>}
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-end bg-bg/70 p-3 backdrop-blur-[3px] sm:place-items-center"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
            className="w-full max-w-md rounded-lg bg-surface p-4 shadow-[0_0_0_1px_var(--color-border-strong)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="panel-kicker" id="install-title">
                  Install on phone
                </p>
                <p className="panel-sub">
                  Home Screen icon. Trading only while this app is open — leave a laptop tab running overnight.
                </p>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-muted">
              <li>
                <span className="font-display text-2xs tracking-[0.14em] text-subtle uppercase">iPhone</span>
                <p className="mt-1">Safari → Share → Add to Home Screen. Open it from there, not the browser tab.</p>
              </li>
              <li>
                <span className="font-display text-2xs tracking-[0.14em] text-subtle uppercase">Android</span>
                <p className="mt-1">Chrome menu → Install app / Add to Home screen.</p>
              </li>
              <li>
                <span className="font-display text-2xs tracking-[0.14em] text-subtle uppercase">Desktop</span>
                <p className="mt-1">Chrome or Edge: install icon in the address bar, or the button below when it lights up.</p>
              </li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              {prompt ? (
                <Button
                  type="button"
                  variant="good"
                  className="min-h-11 flex-1"
                  onClick={() => {
                    void prompt.prompt();
                    setOpen(false);
                  }}
                >
                  Install now
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => setOpen(false)}>
                {isIos() ? "Got it" : "Close"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
