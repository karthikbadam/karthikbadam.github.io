// Outcomes use blue/yellow/red, kept distinct from the tool palette.

import { chartPalette } from "../../../theme";
import { chartHex } from "../../../components/taxonomy";
import type { Outcome } from "../../../components/taxonomy";

export const OUTCOME_PALETTE_KEY: Record<Outcome, keyof typeof chartPalette> = {
  success: "blue",
  partial: "orange",
  fail: "red",
};

export function outcomeColor(o: Outcome, dark: boolean): string {
  return chartHex(OUTCOME_PALETTE_KEY[o] ?? "gray", dark);
}
