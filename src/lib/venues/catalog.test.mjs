import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMING_SOON_VENUES,
  DEFAULT_LIVE_VENUE,
  VENUE_IDS,
  getVenue,
  resolveLiveVenueId,
} from "./catalog.mjs";

describe("venue registry", () => {
  it("getVenue(kraken) exists", () => {
    const v = getVenue("kraken");
    assert.equal(v.id, "kraken");
    assert.equal(v.label, "Kraken");
    assert.ok(VENUE_IDS.includes("kraken"));
    assert.ok(VENUE_IDS.includes("paper"));
  });

  it("getVenue(paper) exists", () => {
    const v = getVenue("paper");
    assert.equal(v.id, "paper");
    assert.equal(v.label, "Paper");
  });

  it("unknown id throws", () => {
    assert.throws(() => getVenue("binance"), /Unknown venue/);
    assert.throws(() => getVenue("nope"), /Unknown venue/);
  });

  it("live unknown id falls back to kraken", () => {
    assert.equal(resolveLiveVenueId("nope"), DEFAULT_LIVE_VENUE);
    assert.equal(resolveLiveVenueId("kraken"), "kraken");
    assert.equal(resolveLiveVenueId("paper"), "paper");
  });

  it("coming-soon venues are labeled next and are not live ids", () => {
    assert.deepEqual(
      COMING_SOON_VENUES.map((v) => v.id),
      ["binance", "coinbase", "bybit"],
    );
    for (const row of COMING_SOON_VENUES) {
      assert.equal(row.status, "next");
      assert.throws(() => getVenue(row.id), /Unknown venue/);
    }
  });
});
