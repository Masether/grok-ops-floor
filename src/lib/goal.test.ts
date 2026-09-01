import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LAUNCH_BOUNDS } from "./launch.mjs";
import {
  DAY_PRESETS,
  FEASIBILITY_LABEL,
  GOAL_DEFAULTS,
  GOAL_PRESETS,
  asGoalLevel,
  capitalToReach,
  compoundDailyRate,
  daysToReach,
  fmtGoalUsd,
  goalChipLine,
  goalProgressPct,
  levelById,
  normalizeGoalDays,
  normalizeGoalProfit,
  planGoal,
  reachableProfit,
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

describe("compounding math", () => {
  it("quotes the geometric daily rate, not profit / days / capital", () => {
    // Doubling a book in 7 days is ~10.4%/day compounding, not the 14.3% that
    // simple division reports.
    const daily = compoundDailyRate(10_000, 10_000, 7);
    assert.ok(Math.abs(daily - (Math.pow(2, 1 / 7) - 1)) < 1e-12);
    assert.ok(daily < 10_000 / 7 / 10_000);
    assert.ok(Math.abs(daily - 0.104089) < 1e-5);
  });

  it("reachableProfit, daysToReach and capitalToReach agree with each other", () => {
    const reach = reachableProfit(10_000, 0.008, 30);
    assert.ok(Math.abs(reach - 10_000 * (Math.pow(1.008, 30) - 1)) < 1e-9);
    // The capital that turns that same rate and window into the same profit.
    assert.ok(Math.abs(capitalToReach(reach, 0.008, 30) - 10_000) < 1e-6);
    // And the window that gets a $10k book to that profit at that rate.
    assert.equal(daysToReach(reach, 10_000, 0.008), 30);
  });

  it("returns Infinity rather than a number nobody can act on", () => {
    assert.equal(daysToReach(10_000, 10_000, 0), Infinity);
    assert.equal(capitalToReach(10_000, 0.01, 0), Infinity);
    assert.equal(reachableProfit(0, 0.01, 7), 0);
  });
});

describe("planGoal feasibility", () => {
  it("grades the ask against what a level plays for, not against its loss halt", () => {
    // $200 on $10k in 7d → ~0.28%/day. Balanced aims 0.8%, Steady only 0.4%.
    const plan = planGoal({ capital: 10_000, goalProfit: 200, days: 7 });
    const by = Object.fromEntries(plan.levels.map((l) => [l.id, l]));
    assert.equal(by.balanced?.feasibility, "easy");
    assert.equal(by.push?.feasibility, "easy");
    assert.equal(by.steady?.feasibility, "stretch");
    assert.equal(plan.recommended, "balanced");
    assert.equal(plan.wild, false);
    assert.deepEqual(plan.fixes, []);
  });

  it("every level carries its own daily aim and what that reaches in the window", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 1_000, days: 30 });
    const by = Object.fromEntries(plan.levels.map((l) => [l.id, l]));
    assert.equal(by.steady?.dailyTargetPct, 0.004);
    assert.equal(by.balanced?.dailyTargetPct, 0.008);
    assert.equal(by.push?.dailyTargetPct, 0.015);
    for (const level of plan.levels) {
      assert.ok(
        Math.abs(level.reachableProfit - 10_000 * (Math.pow(1 + level.dailyTargetPct, 30) - 1)) <
          1e-9,
      );
      // A level's aim is always well under the loss halt it trades behind.
      assert.ok(level.dailyTargetPct < level.maxDailyLossPct);
    }
  });

  it("is out of reach when the ask clears every level's aim", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 10_000, days: 7 });
    assert.equal(plan.wild, true);
    for (const level of plan.levels) {
      assert.equal(level.feasibility, "unrealistic");
      assert.ok(plan.compoundDaily > level.dailyTargetPct);
    }
  });
});

describe("the opening book", () => {
  it("defaults to a goal the desk can actually describe", () => {
    // The gate used to open on $10k in 7 days: three red cards and no way out.
    const plan = planGoal({
      capital: GOAL_DEFAULTS.capital,
      goalProfit: GOAL_DEFAULTS.goalProfit,
      days: GOAL_DEFAULTS.days,
    });
    assert.equal(plan.wild, false);
    assert.equal(plan.recommended, GOAL_DEFAULTS.level);
    assert.equal(levelById(plan, plan.recommended).feasibility, "easy");
    assert.deepEqual(plan.fixes, []);
    assert.ok(plan.compoundDaily < 0.005);
  });

  it("reads as a sentence, not a wall of percentages", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 10_000, days: 7 });
    assert.equal(plan.askLine, "That is +100% on a $10k book in 7 days.");
    assert.match(plan.needLine, /~10\.4% per day, compounding/);
    assert.match(plan.aimLine, /^Push plays for ~1\.5% a day — about \$1k on this book in 7 days\.$/);
    assert.match(plan.recommendNote, /Steady is the least-bad book to run/);
  });

  it("labels feasibility in plain words", () => {
    assert.equal(FEASIBILITY_LABEL.easy, "In reach");
    assert.equal(FEASIBILITY_LABEL.stretch, "Stretch");
    assert.equal(FEASIBILITY_LABEL.unrealistic, "Out of reach");
  });
});

describe("fixes for an out-of-reach ask", () => {
  it("offers more days, more capital, or a smaller goal — measured off the hungriest book", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 10_000, days: 7 });
    assert.deepEqual(
      plan.fixes.map((f) => f.id),
      ["days", "capital", "goal"],
    );
    const by = Object.fromEntries(plan.fixes.map((f) => [f.id, f]));
    // Push aims 1.5%/day, so ~47 days — not the 174 that Steady's 0.4% implies.
    assert.equal(by.days?.days, 47);
    assert.ok(by.capital!.capital! > 10_000);
    assert.ok(by.goal!.goalProfit! < 10_000);
    for (const fix of plan.fixes) {
      assert.match(fix.label, /\S/);
      assert.match(fix.detail, /\S/);
    }
  });

  it("every fix it offers actually lands a reachable plan", () => {
    for (const [goalProfit, days, capital] of [
      [10_000, 7, 10_000],
      [2_000, 7, 10_000],
      [5_000, 14, 10_000],
    ] as const) {
      const plan = planGoal({ capital, goalProfit, days });
      assert.equal(plan.wild, true);
      assert.ok(plan.fixes.length > 0);
      for (const fix of plan.fixes) {
        const next = planGoal({
          capital: fix.capital ?? capital,
          goalProfit: fix.goalProfit ?? goalProfit,
          days: fix.days ?? days,
        });
        assert.equal(next.wild, false, `${fix.id} fix on ${goalProfit}/${days}d/${capital}`);
        assert.deepEqual(next.fixes, []);
      }
    }
  });

  it("drops a suggestion it cannot express instead of printing a dead number", () => {
    // $10k on a $1k book in 7 days needs ~40.9%/day; a day count inside the
    // 365-day bound still exists, but the capital ask must stay in bounds too.
    const plan = planGoal({ capital: 1_000, goalProfit: 10_000, days: 7 });
    for (const fix of plan.fixes) {
      if (fix.days !== undefined) assert.ok(fix.days <= 365);
      if (fix.capital !== undefined) assert.ok(fix.capital <= 10_000_000);
      if (fix.goalProfit !== undefined) assert.ok(fix.goalProfit >= 1);
    }
  });
});

describe("planGoal 10k/7d/10k-capital", () => {
  it("keeps ticket sizing, and recommends Steady because nothing here reaches it", () => {
    const plan = planGoal({ capital: 10_000, goalProfit: 10_000, days: 7 });
    assert.equal(plan.capital, 10_000);
    assert.equal(plan.goalProfit, 10_000);
    assert.equal(plan.days, 7);
    assert.equal(plan.requiredReturn, 1);
    assert.ok(Math.abs(plan.simpleDaily - 10_000 / 7 / 10_000) < 1e-12);
    assert.ok(Math.abs(plan.requiredDailyPct - (100 / 7)) < 1e-9);
    assert.equal(plan.recommended, "steady");
    assert.match(plan.recommendNote, /least-bad book to run/i);
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
      // The halt is a stop, never the thing the level says it is playing for.
      assert.notEqual(level.dailyTargetPct, level.maxDailyLossPct);
      assert.doesNotMatch(level.note, /halt/i);
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
