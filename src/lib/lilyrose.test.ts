import assert from "node:assert/strict";
import test from "node:test";
import { assembleBrief, isBait } from "./lilyrose.ts";

test("kills bait and keeps a real claim", () => {
  assert.equal(isBait("RT if you want this giveaway"), true);
  assert.equal(isBait("lol"), true);
  assert.equal(isBait("We shipped a local coding agent that writes patches against a real repo."), false);
});

test("assembles one brief from mixed hits", () => {
  const brief = assembleBrief({
    hits: [
      {
        kind: "web",
        title: "NovaAgent launches today",
        snippet: "NovaAgent writes verified briefs from live sources.",
        url: "https://example.com/nova",
      },
      {
        kind: "x",
        title: "giveaway",
        snippet: "RT if you want alpha",
        url: "https://x.com/spam",
      },
    ],
    fundConnected: false,
    paper: true,
    budgetUsd: 200,
  });
  assert.ok(brief.products.length >= 1);
  assert.equal(brief.action, "observe");
  assert.ok(brief.killedBait >= 1);
});
