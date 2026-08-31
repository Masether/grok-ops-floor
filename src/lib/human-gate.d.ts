export const POW_DIFFICULTY_BITS: number;
export const HUMAN_TTL_MS: number;
export const TEST_CONN_LIMIT: number;
export const TEST_CONN_WINDOW_MS: number;
export const HUMAN_TOKEN_STORAGE_KEY: string;
export const HUMAN_COPY: string;
export function leadingZeroBits(hex: string): number;
export function powMeets(hex: string, bits?: number): boolean;
export function sha256Hex(text: string): Promise<string>;
export function solvePow(salt: string, bits?: number, max?: number): Promise<number>;
export function readHumanToken(): string | null;
export function parseHumanToken(
  token: string,
): { exp: number; nonce: string; sig: string; raw: string } | null;
export function makeRateLimiter(
  limit?: number,
  windowMs?: number,
): {
  take(key: string, now?: number): { ok: boolean; remaining: number };
  peek(key: string, now?: number): { ok: boolean; remaining: number };
};
