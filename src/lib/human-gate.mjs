/**
 * Human-gate primitives: proof-of-work check + rate limiter.
 * No "AI bot detector". Server signs the session token separately.
 */

export const POW_DIFFICULTY_BITS = 12;
export const HUMAN_TTL_MS = 12 * 60 * 60 * 1000;
export const TEST_CONN_LIMIT = 5;
export const TEST_CONN_WINDOW_MS = 10 * 60 * 1000;
export const HUMAN_TOKEN_STORAGE_KEY = "ops-floor-human";
export const HUMAN_COPY = "Verify you're human before linking an account.";

/** @param {string} hex */
export function leadingZeroBits(hex) {
  let bits = 0;
  const h = String(hex ?? "").toLowerCase();
  for (const ch of h) {
    const n = parseInt(ch, 16);
    if (!Number.isFinite(n)) break;
    if (n === 0) {
      bits += 4;
      continue;
    }
    if (n < 2) bits += 3;
    else if (n < 4) bits += 2;
    else if (n < 8) bits += 1;
    break;
  }
  return bits;
}

/**
 * @param {string} hex
 * @param {number} [bits]
 */
export function powMeets(hex, bits = POW_DIFFICULTY_BITS) {
  return leadingZeroBits(hex) >= bits;
}

/** @param {string} text */
export async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(String(text));
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {string} salt
 * @param {number} [bits]
 * @param {number} [max]
 */
export async function solvePow(salt, bits = POW_DIFFICULTY_BITS, max = 8_000_000) {
  const target = Number(bits) || POW_DIFFICULTY_BITS;
  for (let n = 0; n < max; n++) {
    const hex = await sha256Hex(`${salt}:${n}`);
    if (powMeets(hex, target)) return n;
    if (n > 0 && n % 128 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  throw new Error("Human check timed out — try again");
}

/** @param {string} token */
export function parseHumanToken(token) {
  const raw = String(token ?? "");
  const parts = raw.split(".");
  if (parts.length !== 4 || parts[0] !== "ok") return null;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  if (!parts[2] || !parts[3]) return null;
  return { exp, nonce: parts[2], sig: parts[3], raw };
}

export function readHumanToken() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HUMAN_TOKEN_STORAGE_KEY);
    const parsed = parseHumanToken(raw ?? "");
    return parsed?.raw ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {number} [limit]
 * @param {number} [windowMs]
 */
export function makeRateLimiter(limit = TEST_CONN_LIMIT, windowMs = TEST_CONN_WINDOW_MS) {
  /** @type {Map<string, { start: number, n: number }>} */
  const hits = new Map();
  return {
    /**
     * @param {string} key
     * @param {number} [now]
     */
    take(key, now = Date.now()) {
      const id = String(key || "anon");
      const row = hits.get(id);
      if (!row || now - row.start >= windowMs) {
        hits.set(id, { start: now, n: 1 });
        return { ok: true, remaining: limit - 1 };
      }
      if (row.n >= limit) return { ok: false, remaining: 0 };
      row.n += 1;
      return { ok: true, remaining: limit - row.n };
    },
    /**
     * @param {string} key
     * @param {number} [now]
     */
    peek(key, now = Date.now()) {
      const id = String(key || "anon");
      const row = hits.get(id);
      if (!row || now - row.start >= windowMs) return { ok: true, remaining: limit };
      return { ok: row.n < limit, remaining: Math.max(0, limit - row.n) };
    },
  };
}
