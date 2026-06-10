// Sankeykey-local outcome colours: green = success, red = fail. (The shared
// taxonomy uses blue for success; here the verdict should read at a glance.)

import { chartPalette } from "../../../theme";
import type { Outcome } from "../TrajectoryAtlas/types";

export const OUTCOME_PALETTE_KEY: Record<Outcome, keyof typeof chartPalette> = {
  success: "green",
  partial: "orange",
  fail: "red",
};

export function outcomeColor(o: Outcome, dark: boolean): string {
  const v = chartPalette[OUTCOME_PALETTE_KEY[o] ?? "gray"];
  return dark ? v.dark : v.light;
}
