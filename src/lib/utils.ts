import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Font-size scale steps whose names tailwind-merge cannot recognise on its own.
 *
 * tailwind-merge splits `text-*` into a font-size group and a text-colour group,
 * and it decides which one a class belongs to by looking at the value. T-shirt
 * sizes like `2xs` are understood, but a bespoke name is not, so `text-micro`
 * lands in the colour group and silently evicts the colour beside it — that is
 * how `text-primary-foreground text-micro` used to collapse to background-
 * coloured text on the selected launch-gate chips. Teach the merger the names
 * we invented and both classes survive.
 *
 * Keep in sync with the `--text-*` tokens in `src/styles.css`.
 */
const CUSTOM_FONT_SIZES = ["micro"];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: CUSTOM_FONT_SIZES }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
