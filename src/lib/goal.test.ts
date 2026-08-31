import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LAUNCH_BOUNDS } from "./launch.mjs";
import {
  DAY_PRESETS,
  GOAL_PRESETS,
  asGoalLevel,
  fmtGoalUsd,
  goalChipLine,
  goalProgressPct,
  levelById,
  normalizeGoalDays,
  normalizeGoalProfit,
  planGoal,
  sessionMinutesForDays,
  suggestedSessionMinutes,
} from "./goal.ts";

describe("normalizeGoalProfit / days", () => {
  it("clamps profit and days", () => {
    assert.equal(normalizeGoalProfit(10_000), 10_000);
    assert.equal(normalizeGoalProfit(0), 1);
    assert.equal(normalizeGoalProfit(-5), 1);
    assert.equal(normalizeGoalProfit(99_000_000), 10_000_000);
    assert.equal(normalizeGoalDays(7), 7);
    assert.equal(normalizeGoalDays(0), 1);
    assert.equal(normalizeGoalDays(0.4), 1);
    assert.equal(normalizeGoalDays(900), 365);
  });
});

describe("asGoalLevel", () => {
  it("accepts the three ids and defaults to balanced", () => {
    assert.equal(asGoalLevel("steady"), "steady");
    assert.equal(asGoalLevel("push"), "push");
    assert.equal(asGoalLevel("balanced"), "balanced");
    assert.equal(asGoalLevel("nope"), "balanced");
    assert.equal(asGoalLevel(null), "balanced");
  });
});

describe("fmtGoalUsd", () => {
  it("prints compact chip labels", () => {
    assert.equal(fmtGoalUsd(1_000), "$1k");
    assert.equal(fmtGoalUsd(10_000), "$10k");
    assert.equal(fmtGoalUsd(100_000), "$100k");
    assert.equal(fmtGoalUsd(1_500), "$1.5k");
    assert.equal(fmtGoalUsd(200), "$200");
  });
});

describe("planGoal feasibility", () => {
  it("is easy when required return per day is under ~1%", () => {
    // $200 on $10k in 7d → 0.286%/day
    const plan = planGoal({ capital: 10_000, goalProfit: 200, days: 7 });
    assert.ok(plan.simpleDaily < 0.01);
    for (const level of plan.levels) {
      assert.equal(level.feasibility, "easy");
    }
    assert.equal(plan.recommended, "balanced");
    assert.equal(plan.wild, false);
  });

  it("is stretch under ~4%/day when the halt still covers it", () => {
    // $2,000 on $10k in 7d → 2.86%/day
    const plan = planGoal({ capital: 10_000, goalProfit: 2_000, days: 7 });
    assert.ok(plan.simpleDaily > 0.01 && plan.simpleDaily < 0.04);
    const by = Object.fromEntries(plan.levels.map((l) => [l.id, l]));
    assert.equal(by.steady?.feasibility, "unrealistic"); // 2.86% > 2% halt
    assert.equal(by.balanced?.feasibility, "stretch");
    assert.equal(by.push?.feasibility, "stretch");
    assert.equal(plan.recommended, "balanced");
  });

  it("is unrealistic above ~4%/day", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 10_000, days: 7 });
    assert.ok(plan.simpleDaily > 0.04);
    assert.equal(plan.wild, true);
    for (const level of plan.levels) {
      assert.equal(level.feasibility, "unrealistic");
    }
  });
});

describe("planGoal 10k/7d/10k-capital", () => {
  it("computes ~14.3%/day, tickets, and recommends Steady because it is impossible", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 10_000, days: 7 });
    assert.equal(plan.capital, 10_000);
    assert.equal(plan.goalProfit, 10_000);
    assert.equal(plan.days, 7);
    assert.equal(plan.requiredReturn, 1);
    assert.ok(Math.abs(plan.simpleDaily - 10_000 / 7 / 10_000) < 1e-12);
    assert.ok(Math.abs(plan.requiredDailyPct - (100 / 7)) < 1e-9);
    assert.equal(plan.recommended, "steady");
    assert.match(plan.recommendNote, /add capital or add days/i);
    assert.match(plan.needLine, /not a promise/i);
    assert.equal(plan.suggestedSessionMinutes, 7 * 8 * 60);

    const by = Object.fromEntries(plan.levels.map((l) => [l.id, l]));
    assert.equal(by.steady?.ticketUsd, 200);
    assert.equal(by.steady?.sizePct, 0.02);
    assert.equal(by.steady?.stopPct, 0.008);
    assert.equal(by.steady?.takePct, 0.012);
    assert.equal(by.steady?.maxDailyLossPct, 0.02);
    assert.equal(by.steady?.maxPositions, 3);
    assert.equal(by.steady?.feasibility, "unrealistic");

    assert.equal(by.balanced?.ticketUsd, 200);
    assert.equal(by.balanced?.sizePct, 0.02);
    assert.equal(by.balanced?.stopPct, 0.015);
    assert.equal(by.balanced?.takePct, 0.025);
    assert.equal(by.balanced?.maxDailyLossPct, 0.04);
    assert.equal(by.balanced?.maxPositions, 5);

    assert.equal(by.push?.ticketUsd, 800);
    assert.equal(by.push?.sizePct, 0.08);
    assert.equal(by.push?.stopPct, 0.025);
    assert.equal(by.push?.takePct, 0.06);
    assert.equal(by.push?.maxDailyLossPct, 0.08);
    assert.equal(by.push?.maxPositions, 6);
    assert.ok(by.push!.requiredDailyPct > by.push!.maxDailyLossPct * 100);
  });
});

describe("planGoal impossible 10k/7d on 1k capital", () => {
  it("recommends Steady and marks every level unrealistic", () => {
    const plan = planGoal({ capital: 1_000, goalProfit: 10_000, days: 7 });
    assert.equal(plan.recommended, "steady");
    assert.ok(plan.simpleDaily > 1);
    assert.equal(plan.wild, true);
    for (const level of plan.levels) {
      assert.equal(level.feasibility, "unrealistic");
      assert.equal(level.ticketUsd, plan.capital * level.sizePct);
    }
    const steady = levelById(plan, "steady");
    assert.equal(steady.ticketUsd, 20);
    assert.match(plan.recommendNote, /Steady/);
  });
});

describe("ticketUsd and launch bounds", () => {
  it("ticketUsd is capital times sizePct and every level stays in launch bounds", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 5_000, days: 14 });
    for (const level of plan.levels) {
      assert.equal(level.ticketUsd, plan.capital * level.sizePct);
      assert.ok(level.sizePct >= LAUNCH_BOUNDS.sizePct.min);
      assert.ok(level.sizePct <= LAUNCH_BOUNDS.sizePct.max);
      assert.ok(level.stopPct >= LAUNCH_BOUNDS.stopPct.min);
      assert.ok(level.stopPct <= LAUNCH_BOUNDS.stopPct.max);
      assert.ok(level.takePct >= LAUNCH_BOUNDS.takePct.min);
      assert.ok(level.takePct <= LAUNCH_BOUNDS.takePct.max);
      assert.ok(level.maxDailyLossPct >= LAUNCH_BOUNDS.maxDailyLossPct.min);
      assert.ok(level.maxDailyLossPct <= LAUNCH_BOUNDS.maxDailyLossPct.max);
      assert.ok(level.maxPositions >= LAUNCH_BOUNDS.maxPositions.min);
      assert.ok(level.maxPositions <= LAUNCH_BOUNDS.maxPositions.max);
    }
  });

  it("never uses the daily-loss cap as a plan to win", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 10_000, days: 7 });
    for (const level of plan.levels) {
      assert.ok(level.maxDailyLossPct <= LAUNCH_BOUNDS.maxDailyLossPct.max);
      assert.ok(level.maxDailyLossPct < plan.simpleDaily);
    }
  });
});

describe("custom presets recompute levels", () => {
  it("has $1k–$100k and 7/14/30 presets", () => {
    assert.deepEqual([...GOAL_PRESETS], [1_000, 5_000, 10_000, 20_000, 50_000, 100_000]);
    assert.deepEqual([...DAY_PRESETS], [7, 14, 30]);
  });

  it("a $100k / 7d / $10k book is wild and red-path (unrealistic)", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 100_000, days: 7 });
    assert.equal(plan.wild, true);
    assert.equal(plan.recommended, "steady");
    for (const level of plan.levels) {
      assert.equal(level.feasibility, "unrealistic");
    }
    assert.match(plan.needLine, /not a promise/i);
    assert.doesNotMatch(plan.needLine.toLowerCase(), /you will|you'll|guaranteed|10x/);
  });
});

describe("session mapping", () => {
  it("suggested session is min(calendar days, 8h × D)", () => {
    assert.equal(suggestedSessionMinutes(7), 7 * 8 * 60);
    assert.equal(suggestedSessionMinutes(1), 8 * 60);
  });

  it("duration default stays 4h unless the goal is a single day", () => {
    assert.equal(sessionMinutesForDays(7), 240);
    assert.equal(sessionMinutesForDays(1), 480);
  });
});

describe("goal progress chip", () => {
  it("is dayPnl / G, not a forecast", () => {
    assert.equal(goalProgressPct(1_200, 10_000), 12);
    assert.equal(goalProgressPct(-500, 10_000), -5);
    assert.equal(goalProgressPct(10, 0), 0);
    assert.equal(
      goalChipLine({ goalProfit: 10_000, goalDays: 7, dayPnl: 1_200 }),
      "goal $10k · 7d · 12% there",
    );
  });
});
