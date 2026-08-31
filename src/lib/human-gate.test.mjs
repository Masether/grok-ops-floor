import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HUMAN_COPY,
  POW_DIFFICULTY_BITS,
  TEST_CONN_LIMIT,
  leadingZeroBits,
  makeRateLimiter,
  parseHumanToken,
  powMeets,
  sha256Hex,
  solvePow,
} from "./human-gate.mjs";

describe("pow bits", () => {
  it("counts leading zero bits from hex", () => {
    assert.equal(leadingZeroBits("0000ffff"), 16);
    assert.equal(leadingZeroBits("0fffffff"), 4);
    assert.equal(leadingZeroBits("8fffffff"), 0);
    assert.equal(powMeets("0000abcd", 16), true);
    assert.equal(powMeets("0001abcd", 16), false);
  });
});

describe("solvePow", () => {
  it("finds a nonce that meets a low difficulty", async () => {
    const salt = "test-salt-1";
    const bits = 8;
    const n = await solvePow(salt, bits, 200_000);
    const hex = await sha256Hex(`${salt}:${n}`);
    assert.equal(powMeets(hex, bits), true);
    assert.ok(n >= 0);
  });
});

describe("rate limiter", () => {
  it("allows a few attempts then blocks", () => {
    const lim = makeRateLimiter(3, 60_000);
    const t0 = 1_000_000;
    assert.equal(lim.take("s1", t0).ok, true);
    assert.equal(lim.take("s1", t0 + 10).ok, true);
    assert.equal(lim.take("s1", t0 + 20).ok, true);
    assert.equal(lim.take("s1", t0 + 30).ok, false);
    assert.equal(lim.take("s2", t0 + 30).ok, true);
    assert.equal(lim.take("s1", t0 + 60_000).ok, true);
    assert.equal(TEST_CONN_LIMIT, 5);
  });
});

describe("parseHumanToken", () => {
  it("rejects junk and expired tokens", () => {
    assert.equal(parseHumanToken(""), null);
    assert.equal(parseHumanToken("ok.1.n.sig"), null);
    const exp = Date.now() + 60_000;
    const parsed = parseHumanToken(`ok.${exp}.nonce.sig`);
    assert.ok(parsed);
    assert.equal(parsed.exp, exp);
  });
});

describe("copy", () => {
  it("asks to verify human and does not claim hack-proof", () => {
    assert.match(HUMAN_COPY, /Verify you're human/);
    assert.doesNotMatch(HUMAN_COPY, /hack-proof|unhackable/i);
    assert.ok(POW_DIFFICULTY_BITS >= 12);
  });
});
