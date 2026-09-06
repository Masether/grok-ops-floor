import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirror of store setKeys progressive-paste rules (keep in sync). */
function nextKeys(
  prev: { apiKey: string; apiSecret: string },
  incoming: { apiKey: string; apiSecret: string },
): { apiKey: string; apiSecret: string } | null {
  const apiKey = incoming.apiKey.replace(/\s+/g, "").trim();
  const apiSecret = incoming.apiSecret.replace(/\s+/g, "").trim();
  const hadPair = prev.apiKey.length >= 8 && prev.apiSecret.length >= 16;
  if (!apiKey && !apiSecret) return { apiKey: "", apiSecret: "" };
  if (apiKey.length < 8 || apiSecret.length < 16) {
    if (hadPair) return null;
    return { apiKey, apiSecret };
  }
  return { apiKey, apiSecret };
}

describe("key paste progressive", () => {
  it("keeps the first pasted API key when secret is still empty", () => {
    const r = nextKeys(
      { apiKey: "", apiSecret: "" },
      { apiKey: "abcdefghij", apiSecret: "" },
    );
    assert.equal(r?.apiKey, "abcdefghij");
  });

  it("accepts secret paste after key", () => {
    const r = nextKeys(
      { apiKey: "abcdefghij", apiSecret: "" },
      { apiKey: "abcdefghij", apiSecret: "0123456789abcdef" },
    );
    assert.ok(r);
    assert.equal(r!.apiSecret.length, 16);
  });

  it("does not half-wipe a working pair", () => {
    const r = nextKeys(
      { apiKey: "abcdefghij", apiSecret: "0123456789abcdef" },
      { apiKey: "abcdefghij", apiSecret: "" },
    );
    assert.equal(r, null);
  });
});
