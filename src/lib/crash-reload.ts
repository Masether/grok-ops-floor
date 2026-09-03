const KEY = "ops-floor-crash-at";
const COOL_MS = 20_000;

/** Reload once per 20s so a hitch recovers without a loop. */
export function reloadOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < COOL_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}

export function armCrashReload(): () => void {
  if (typeof window === "undefined") return () => {};
  const onErr = () => {
    window.setTimeout(() => reloadOnce(), 400);
  };
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);
  return () => {
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onErr);
  };
}
