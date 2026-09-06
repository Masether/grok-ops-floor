import { krakenAdapter } from "./kraken.ts";

/** @deprecated Live-only desk — paper adapter removed. */
export const paperAdapter = {
  ...krakenAdapter,
  id: "kraken" as const,
  label: "Kraken",
};
