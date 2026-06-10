// Sankeykey-local outcome colours: green = success, red = fail. (The shared
// taxonomy uses blue for success; here the verdict should read at a glance.)

import { chartPalette } from "../../../theme";
import { chartHex } from "../../../components/taxonomy";
import type { Outcome } from "../../../components/taxonomy";

export const OUTCOME_PALETTE_KEY: Record<Outcome, keyof typeof chartPalette> = {
  success: "green",
  partial: "orange",
  fail: "red",
};

export function outcomeColor(o: Outcome, dark: boolean): string {
  return chartHex(OUTCOME_PALETTE_KEY[o] ?? "gray", dark);
}
