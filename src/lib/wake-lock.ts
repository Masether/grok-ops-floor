/** Keep the tab awake so the desk can run overnight while this page is open. */

let sentinel: { release: () => Promise<void> } | null = null;

export async function holdWakeLock(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return false;
  try {
    const n = navigator as Navigator & {
      wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    sentinel = await n.wakeLock.request("screen");
    return true;
  } catch {
    return false;
  }
}

export async function dropWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    /* already released */
  }
  sentinel = null;
}
