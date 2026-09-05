import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { heatFading, tapeLens, volumeBuild, volumeSpikes, vwapSeries, vwapStretch } from "./tape-lens.ts";

describe("vwapSeries", () => {
  it("weights typical price by volume", () => {
    const v = vwapSeries([
      { high: 11, low: 9, close: 10, volume: 10 },
      { high: 12, low: 10, close: 11, volume: 30 },
    ]);
    assert.equal(v.length, 2);
    assert.ok(Math.abs(v[0]! - 10) < 1e-9);
    assert.ok(v[1]! > v[0]!);
  });
});

describe("volumeSpikes", () => {
  it("flags a bar well above the recent average", () => {
    const vols = Array.from({ length: 20 }, () => 10);
    vols.push(40);
    const spikes = volumeSpikes(vols);
    assert.equal(spikes[spikes.length - 1], true);
    assert.equal(spikes[10], false);
  });
});

describe("tapeLens", () => {
  it("picks scalp on a volume spike in an up tape", () => {
    assert.equal(tapeLens({ price: 100, vwap: 100, spike: true, lane: "up" }), "scalp");
  });

  it("picks grid when price is stretched off VWAP in chop", () => {
    assert.ok(vwapStretch(101, 100) >= 0.008);
    assert.equal(tapeLens({ price: 101, vwap: 100, spike: false, lane: "chop" }), "grid");
  });

  it("does not chase a stretched up-move even with a spike", () => {
    assert.equal(tapeLens({ price: 101.2, vwap: 100, spike: true, lane: "up" }), null);
  });

  it("scalps a volume build at VWAP before the 2.4× spike", () => {
    const vols = Array.from({ length: 20 }, () => 10);
    vols.push(16);
    assert.equal(volumeBuild(vols).at(-1), true);
    assert.equal(
      tapeLens({ price: 100.1, vwap: 100, spike: false, lane: "chop", building: true }),
      "scalp",
    );
  });
});

describe("heatFading", () => {
  it("flags a dump as fast as the rip", () => {
    assert.equal(heatFading({ entry: 1, mark: 0.995, lane: "up" }), true);
    assert.equal(heatFading({ entry: 1, mark: 1.01, lane: "down" }), true);
    assert.equal(heatFading({ entry: 1, mark: 1.01, lane: "up" }), false);
  });
});
