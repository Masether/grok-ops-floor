const KEY = "ops-floor-crash-at";
const COOL_MS = 20_000;

const MODULE_FAIL =
  /Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk|error loading dynamically imported module/i;

/** Reload once per 20s so a hitch recovers without a loop. */
export function reloadOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < COOL_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.setTimeout(() => window.location.reload(), 50);
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}

function isModuleFail(ev: Event): boolean {
  if (ev instanceof ErrorEvent) {
    return MODULE_FAIL.test(ev.message || "") || MODULE_FAIL.test(String(ev.error ?? ""));
  }
  const reason = (ev as PromiseRejectionEvent).reason;
  const msg = reason instanceof Error ? reason.message : String(reason ?? "");
  return MODULE_FAIL.test(msg);
}

/** Only module-load failures — not every script/image error (that froze the floor). */
export function armCrashReload(): () => void {
  if (typeof window === "undefined") return () => {};
  const onErr = (ev: Event) => {
    if (!isModuleFail(ev)) return;
    window.setTimeout(() => reloadOnce(), 600);
  };
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);
  return () => {
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onErr);
  };
}
