/**
 * Launch-setup payload: clamp percents, ticket size, grandfather launched.
 * Pure module so Node 20 tests can import it without stripping types.
 */

/** @typedef {{ startingCash?: number, sizePct?: number, stopPct?: number, takePct?: number, maxDailyLossPct?: number, maxPositions?: number }} LaunchInput */

export const LAUNCH_DEFAULTS = {
  startingCash: 10_000,
  sizePct: 0.05,
  stopPct: 0.015,
  takePct: 0.025,
  maxDailyLossPct: 0.04,
  maxPositions: 5,
};

export const LAUNCH_BOUNDS = {
  startingCash: { min: 100, max: 10_000_000 },
  sizePct: { min: 0.005, max: 0.08 },
  stopPct: { min: 0.005, max: 0.05 },
  takePct: { min: 0.008, max: 0.08 },
  maxDailyLossPct: { min: 0.01, max: 0.15 },
  maxPositions: { min: 1, max: 6 },
};

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** 2 or 0.02 both mean 2%. Values > 1 are treated as percents.
 * @param {number} value
 * @param {number} fallback
 */
export function asFraction(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return fallback;
  if (value > 1) return value / 100;
  return value;
}

/** @param {LaunchInput} [input] */
export function clampLaunch(input) {
  const src = input ?? {};
  const startingCash = Math.round(
    clamp(
      Number(src.startingCash ?? LAUNCH_DEFAULTS.startingCash),
      LAUNCH_BOUNDS.startingCash.min,
      LAUNCH_BOUNDS.startingCash.max,
    ),
  );
  const sizePct = clamp(
    asFraction(src.sizePct ?? LAUNCH_DEFAULTS.sizePct, LAUNCH_DEFAULTS.sizePct),
    LAUNCH_BOUNDS.sizePct.min,
    LAUNCH_BOUNDS.sizePct.max,
  );
  const stopPct = clamp(
    asFraction(src.stopPct ?? LAUNCH_DEFAULTS.stopPct, LAUNCH_DEFAULTS.stopPct),
    LAUNCH_BOUNDS.stopPct.min,
    LAUNCH_BOUNDS.stopPct.max,
  );
  const takePct = clamp(
    asFraction(src.takePct ?? LAUNCH_DEFAULTS.takePct, LAUNCH_DEFAULTS.takePct),
    LAUNCH_BOUNDS.takePct.min,
    LAUNCH_BOUNDS.takePct.max,
  );
  const maxDailyLossPct = clamp(
    asFraction(src.maxDailyLossPct ?? LAUNCH_DEFAULTS.maxDailyLossPct, LAUNCH_DEFAULTS.maxDailyLossPct),
    LAUNCH_BOUNDS.maxDailyLossPct.min,
    LAUNCH_BOUNDS.maxDailyLossPct.max,
  );
  const maxPositions = Math.round(
    clamp(
      Number(src.maxPositions ?? LAUNCH_DEFAULTS.maxPositions),
      LAUNCH_BOUNDS.maxPositions.min,
      LAUNCH_BOUNDS.maxPositions.max,
    ),
  );
  return { startingCash, sizePct, stopPct, takePct, maxDailyLossPct, maxPositions };
}

/**
 * @param {number} capital
 * @param {number} sizePct
 */
export function ticketNotional(capital, sizePct) {
  const cash = Number(capital);
  const pct = asFraction(sizePct, 0);
  if (!Number.isFinite(cash) || !Number.isFinite(pct)) return 0;
  return Math.max(0, cash * pct);
}

/** @param {number} n */
function fmtMoney(n) {
  return Math.round(n).toLocaleString("en-US");
}

/** @param {number} fraction */
function fmtPct(fraction) {
  const n = fraction * 100;
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** @param {LaunchInput} [input] */
export function launchPreviewLine(input) {
  const p = clampLaunch(input);
  const ticket = ticketNotional(p.startingCash, p.sizePct);
  return `A $${fmtMoney(p.startingCash)} book → ~$${fmtMoney(ticket)} per ticket, stop ${fmtPct(p.stopPct)}%, take ${fmtPct(p.takePct)}%. Paper. Can still lose.`;
}

/**
 * Grandfather persisted desks: missing `launched` + existing book activity
 * counts as already launched so we do not brick a running paper test.
 * @param {unknown} persisted
 */
export function inferLaunched(persisted) {
  if (!persisted || typeof persisted !== "object") return false;
  const p = /** @type {{ launched?: boolean, orders?: unknown, positions?: unknown, briefs?: unknown }} */ (
    persisted
  );
  if (typeof p.launched === "boolean") return p.launched;
  const orders = Array.isArray(p.orders) ? p.orders.length : 0;
  const positions = Array.isArray(p.positions) ? p.positions.length : 0;
  const briefs = Number(p.briefs) || 0;
  return orders > 0 || positions > 0 || briefs > 0;
}

/** Reject seed phrases / hex wallet keys. Exchange API keys only.
 * @param {unknown} value
 */
export function rejectWalletSecret(value) {
  const t = String(value ?? "").trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  if (
    words.length >= 12 &&
    words.length <= 24 &&
    words.every((w) => /^[a-zA-Z]+$/.test(w))
  ) {
    return "On-chain wallets are not in this build. Use an exchange API key, not a seed phrase.";
  }
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(t)) {
    return "Wallet private keys are not accepted. Use an exchange API key with withdrawal off.";
  }
  return null;
}
