import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  HUMAN_COPY,
  HUMAN_TOKEN_STORAGE_KEY,
  readHumanToken,
  solvePow,
} from "@/lib/human-gate.mjs";
import {
  getHumanGateConfig,
  issuePowChallenge,
  verifyHuman,
} from "@/lib/human-gate-api";
import { useFloor } from "@/lib/store";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          theme?: string;
        },
      ) => string;
      remove?: (id: string) => void;
    };
  }
}

export function HumanGate() {
  const humanVerified = useFloor((s) => s.humanVerified);
  const setHumanVerified = useFloor((s) => s.setHumanVerified);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"pow" | "turnstile" | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const existing = readHumanToken();
    if (existing) setHumanVerified(true);
  }, [setHumanVerified]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getHumanGateConfig();
        if (cancelled) return;
        setKind(cfg.kind);
        setSiteKey(cfg.siteKey);
      } catch {
        if (!cancelled) setKind("pow");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (kind !== "turnstile" || !siteKey || humanVerified) return;
    const el = boxRef.current;
    if (!el) return;
    let widgetId: string | null = null;
    let script = document.querySelector<HTMLScriptElement>("script[data-ops-turnstile]");
    const render = () => {
      if (!window.turnstile || !el) return;
      el.innerHTML = "";
      widgetId = window.turnstile.render(el, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => {
          void (async () => {
            try {
              const res = await verifyHuman({
                data: { kind: "turnstile", turnstileToken: token },
              });
              window.sessionStorage.setItem(HUMAN_TOKEN_STORAGE_KEY, res.token);
              setHumanVerified(true);
              toast.message("Human check passed");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Human check failed");
            }
          })();
        },
      });
    };
    if (window.turnstile) {
      render();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.opsTurnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      script?.removeEventListener("load", render);
      if (widgetId && window.turnstile?.remove) window.turnstile.remove(widgetId);
    };
  }, [kind, siteKey, humanVerified, setHumanVerified]);

  async function runPow() {
    setBusy(true);
    try {
      const challenge = await issuePowChallenge();
      const counter = await solvePow(challenge.salt, challenge.difficulty);
      const res = await verifyHuman({
        data: {
          kind: "pow",
          salt: challenge.salt,
          exp: challenge.exp,
          sig: challenge.sig,
          counter,
        },
      });
      window.sessionStorage.setItem(HUMAN_TOKEN_STORAGE_KEY, res.token);
      setHumanVerified(true);
      toast.message("Human check passed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Human check failed");
    } finally {
      setBusy(false);
    }
  }

  if (humanVerified) {
    return (
      <p className="text-2xs text-good">
        Human check passed for this session. Exchange API keys only — withdrawal stays off.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-2xs text-muted">{HUMAN_COPY}</p>
      {kind === "turnstile" ? (
        <div ref={boxRef} className="min-h-16" />
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void runPow()}>
          {busy ? "Checking…" : "I'm human — continue"}
        </Button>
      )}
      <p className="text-2xs text-subtle">
        A short check on this device. We never ask for seed phrases or wallet private keys.
      </p>
    </div>
  );
}
