import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanKrakenSecret, mapKrakenAuthError, signKraken } from "./kraken-sign.ts";

describe("signKraken", () => {
  it("matches Kraken's published AddOrder vector", async () => {
    const sig = await signKraken(
      "/0/private/AddOrder",
      "1616492376594",
      "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25",
      "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==",
    );
    assert.equal(
      sig,
      "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==",
    );
  });

  it("strips paste whitespace from the secret", () => {
    const dirty = "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==\n";
    assert.equal(cleanKrakenSecret(dirty).endsWith("=="), true);
    assert.equal(cleanKrakenSecret(dirty).includes("\n"), false);
  });

  it("maps Invalid key to a desk line", () => {
    assert.match(mapKrakenAuthError("EAPI:Invalid key"), /invalid API key/i);
  });
});
