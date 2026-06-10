// Outcomes use a dedicated scale, distinct from the tool category palette.

import { chartPalette } from "../../../theme";
import { chartHex } from "../../../components/taxonomy";
import type { Outcome } from "../../../components/taxonomy";

export const OUTCOME_PALETTE_KEY: Record<Outcome, keyof typeof chartPalette> = {
  success: "outcomeSuccess",
  partial: "outcomePartial",
  fail: "outcomeFail",
};

export function outcomeColor(o: Outcome, dark: boolean): string {
  return chartHex(OUTCOME_PALETTE_KEY[o] ?? "gray", dark);
}
