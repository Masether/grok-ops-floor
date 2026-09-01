import { createServerFn } from "@tanstack/react-start";
import {
  HUMAN_TTL_MS,
  POW_DIFFICULTY_BITS,
  TEST_CONN_LIMIT,
  TEST_CONN_WINDOW_MS,
  makeRateLimiter,
  powMeets,
} from "./human-gate.mjs";
import { rejectWalletSecret } from "./launch.mjs";
import { fetchBalance } from "./kraken-api.ts";

const globalRef = globalThis as typeof globalThis & {
  __opsHumanSecret__?: string;
  __opsHumanLimiter__?: ReturnType<typeof makeRateLimiter>;
};

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
}

async function cryptoApi() {
  return import("node:crypto");
}

async function secret(): Promise<string> {
  if (!globalRef.__opsHumanSecret__) {
    const { randomBytes } = await cryptoApi();
    globalRef.__opsHumanSecret__ =
      env("HUMAN_GATE_SECRET") || randomBytes(32).toString("hex");
  }
  return globalRef.__opsHumanSecret__;
}

async function hmac(text: string): Promise<string> {
  const { createHmac } = await cryptoApi();
  return createHmac("sha256", await secret()).update(text).digest("base64url");
}

async function safeEq(a: string, b: string): Promise<boolean> {
  const { timingSafeEqual } = await cryptoApi();
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function turnstileConfigured(): boolean {
  return Boolean(env("TURNSTILE_SITE_KEY") && env("TURNSTILE_SECRET_KEY"));
}

function limiter() {
  globalRef.__opsHumanLimiter__ ??= makeRateLimiter(
    TEST_CONN_LIMIT,
    TEST_CONN_WINDOW_MS,
  );
  return globalRef.__opsHumanLimiter__;
}

async function clientIp(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const h = req.headers;
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || "local";
    return h.get("x-real-ip")?.trim() || "local";
  } catch {
    return "local";
  }
}

async function assertHumanToken(token: string): Promise<string> {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 4 || parts[0] !== "ok") {
    throw new Error("Verify you're human before linking an account.");
  }
  const exp = Number(parts[1]);
  const nonce = parts[2] ?? "";
  const sig = parts[3] ?? "";
  if (!Number.isFinite(exp) || exp <= Date.now() || !nonce || !sig) {
    throw new Error("Human check expired — verify again.");
  }
  const payload = `ok.${exp}.${nonce}`;
  if (!(await safeEq(await hmac(payload), sig))) {
    throw new Error("Verify you're human before linking an account.");
  }
  return payload;
}

async function mintHumanToken(): Promise<{ token: string; exp: number }> {
  const { randomBytes } = await cryptoApi();
  const exp = Date.now() + HUMAN_TTL_MS;
  const nonce = randomBytes(8).toString("hex");
  const payload = `ok.${exp}.${nonce}`;
  return { token: `${payload}.${await hmac(payload)}`, exp };
}

export const getHumanGateConfig = createServerFn({ method: "POST" }).handler(
  async () => {
    if (turnstileConfigured()) {
      return {
        kind: "turnstile" as const,
        siteKey: env("TURNSTILE_SITE_KEY") as string,
        difficulty: 0,
      };
    }
    return {
      kind: "pow" as const,
      siteKey: null as string | null,
      difficulty: POW_DIFFICULTY_BITS,
    };
  },
);

export const issuePowChallenge = createServerFn({ method: "POST" }).handler(
  async () => {
    const { randomBytes } = await cryptoApi();
    const salt = randomBytes(16).toString("hex");
    const exp = Date.now() + 5 * 60_000;
    return {
      salt,
      exp,
      sig: await hmac(`${salt}.${exp}`),
      difficulty: POW_DIFFICULTY_BITS,
    };
  },
);

export const verifyHuman = createServerFn({ method: "POST" })
  .validator(
    (input: {
      kind: "pow" | "turnstile";
      salt?: string;
      exp?: number;
      sig?: string;
      counter?: number;
      turnstileToken?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (data.kind === "turnstile") {
      if (!turnstileConfigured()) throw new Error("Turnstile is not configured");
      const ip = await clientIp();
      const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: env("TURNSTILE_SECRET_KEY") as string,
            response: data.turnstileToken ?? "",
            ...(ip && ip !== "local" ? { remoteip: ip } : {}),
          }),
        },
      );
      const json = (await res.json()) as { success?: boolean };
      if (!json.success) throw new Error("Human check failed");
      return mintHumanToken();
    }

    const salt = data.salt ?? "";
    const exp = data.exp ?? 0;
    const sig = data.sig ?? "";
    if (!salt || !sig || !(await safeEq(await hmac(`${salt}.${exp}`), sig))) {
      throw new Error("Bad challenge");
    }
    if (Date.now() > exp) throw new Error("Challenge expired — try again");
    const counter = Number(data.counter);
    if (!Number.isFinite(counter) || counter < 0 || counter > 20_000_000) {
      throw new Error("Proof failed");
    }
    const { createHash } = await cryptoApi();
    const hex = createHash("sha256").update(`${salt}:${counter}`).digest("hex");
    if (!powMeets(hex, POW_DIFFICULTY_BITS)) throw new Error("Proof failed");
    return mintHumanToken();
  });

export const testVenueKeys = createServerFn({ method: "POST" })
  .validator(
    (input: {
      venueId: string;
      apiKey: string;
      apiSecret: string;
      humanToken: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const session = await assertHumanToken(data.humanToken);
    const ip = await clientIp();
    const hit = limiter().take(`${session}|${ip}`);
    if (!hit.ok) {
      throw new Error("Too many connection tests — wait a few minutes");
    }
    const seedErr =
      rejectWalletSecret(data.apiKey) || rejectWalletSecret(data.apiSecret);
    if (seedErr) throw new Error(seedErr);
    if (data.venueId === "paper") {
      return { ok: true as const, balance: {} as Record<string, string> };
    }
    try {
      const balance = await fetchBalance({
        data: { apiKey: data.apiKey, apiSecret: data.apiSecret },
      });
      return { ok: true as const, balance };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Kraken auth failed");
    }
  });
