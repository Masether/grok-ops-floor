import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cn } from "./utils.ts";

describe("cn", () => {
  it("keeps a colour and a bespoke font size together", () => {
    // The regression that made the selected launch-gate preset chip render as a
    // blank white box: tailwind-merge read `text-micro` as a colour and dropped
    // `text-primary-foreground`, leaving #e8edf5 text on a #e8edf5 button.
    const out = cn("bg-primary text-primary-foreground", "h-7 px-2 text-micro");
    assert.match(out, /text-primary-foreground/);
    assert.match(out, /text-micro/);
  });

  it("still lets a later colour win over an earlier one", () => {
    const out = cn("text-fg", "text-danger");
    assert.match(out, /text-danger/);
    assert.doesNotMatch(out, /text-fg/);
  });

  it("still lets a later size win over an earlier one", () => {
    const out = cn("text-micro", "text-2xs");
    assert.match(out, /text-2xs/);
    assert.doesNotMatch(out, /text-micro/);

    const back = cn("text-2xs", "text-micro");
    assert.match(back, /text-micro/);
    assert.doesNotMatch(back, /text-2xs/);
  });

  it("registers every bespoke --text-* token declared in the stylesheet", () => {
    // A new `--text-<name>` step that tailwind-merge cannot classify would
    // reintroduce the same invisible-text bug, so hold the two lists together.
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const declared = [...css.matchAll(/^\s*--text-([\w-]+):/gm)].map((m) => m[1]);
    assert.ok(declared.length > 0, "expected --text-* tokens in styles.css");
    for (const name of declared) {
      const out = cn(`text-fg text-${name}`);
      assert.match(out, /text-fg/, `text-${name} evicted the colour beside it`);
      assert.match(out, new RegExp(`text-${name}`), `text-${name} was dropped`);
    }
  });
});
