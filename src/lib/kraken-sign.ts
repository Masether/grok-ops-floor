/** Kraken private REST sign. Matches docs.kraken.com Spot REST Authentication. */

export function cleanKrakenSecret(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

export function mapKrakenAuthError(raw: string): string {
  const msg = raw.replace(/^Error:\s*/i, "").trim();
  if (/EAPI:Invalid key/i.test(msg)) {
    return "Kraken: invalid API key — paste Query+Orders keys, no spaces, not the secret as the key";
  }
  if (/EAPI:Invalid signature/i.test(msg)) {
    return "Kraken: invalid signature — private secret is wrong or has extra characters";
  }
  if (/EAPI:Invalid nonce/i.test(msg)) {
    return "Kraken: nonce too low — wait 1s and retry; don't reuse the same key in two bots";
  }
  if (/EAPI:Feature disabled|EGeneral:Permission denied|EOrder:Insufficient/i.test(msg)) {
    return `Kraken permission: ${msg}. Key needs Query+Create & modify orders.`;
  }
  if (/EAPI:Rate limit/i.test(msg)) return "Kraken rate limit — backing off";
  return msg || "Kraken auth failed";
}

export async function signKraken(
  path: string,
  nonce: string,
  body: string,
  secret: string,
): Promise<string> {
  const { createHash, createHmac } = await import("node:crypto");
  const sha256 = createHash("sha256").update(nonce + body, "utf8").digest();
  const hmac = createHmac("sha512", Buffer.from(cleanKrakenSecret(secret), "base64"));
  hmac.update(path, "utf8");
  hmac.update(sha256);
  return hmac.digest("base64");
}
