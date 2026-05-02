// Trajectory Atlas — taxonomy and color tokens.

import type { Category, Outcome } from "./types";

export const CATEGORY_LABELS: Record<Category, string> = {
  plan: "Plan",
  search: "Search",
  read: "Read",
  edit: "Edit",
  exec: "Execute",
  tool: "API",
  verify: "Verify",
  submit: "Submit",
  error: "Error",
};

// Observable 10 mapping for sankey nodes / step dots.
// Resolved from the existing site theme CSS variables (see src/theme.ts).
export const CAT_COLOR: Record<Category, string> = {
  plan: "var(--chart-purple)",
  search: "var(--chart-cyan)",
  read: "var(--chart-light-blue)",
  edit: "var(--chart-orange)",
  exec: "var(--chart-blue)",
  tool: "var(--chart-green)",
  verify: "var(--chart-brown)",
  submit: "var(--chart-gray)",
  error: "var(--chart-red)",
};

export const OUTCOME_COLOR: Record<Outcome, string> = {
  success: "var(--chart-blue)",
  partial: "var(--chart-orange)",
  fail: "var(--chart-red)",
};

// Stable column ordering used as an *override* by the demo wrapper around the
// generic Sankey. The generic component is data-driven; ordering is opt-in.
export const ACTION_ORDER: Category[] = [
  "plan",
  "search",
  "read",
  "edit",
  "exec",
  "tool",
  "verify",
  "submit",
  "error",
];

export const OUTCOME_ORDER: Outcome[] = ["success", "partial", "fail"];

/**
 * Sequential accent ramp for the icicle plot. Light mode interpolates from
 * `--accent-bg` (pale wash) to `--accent` (deep blue); dark mode flips to a
 * warm sand parchment ramp using the dark-mode accent tokens.
 *
 * `t` ranges 0..1 from shallow to deep. Returned as an `oklch(...)` string so
 * it composes cleanly across light/dark without needing the live CSS var to
 * resolve at runtime.
 */
export function accentRamp(t: number, dark: boolean): string {
  const tt = Math.max(0, Math.min(1, t));
  if (dark) {
    // dark-brown #3a332b → sand #dfd0b8
    const l = 22 + tt * 60; // 22% → 82%
    const c = 0.04;
    return `oklch(${l}% ${c} 75)`;
  }
  // pale blue-grey #f0f5f9 → utility blue #2b6cb0
  const l = 96 - tt * 54; // 96% → 42%
  const c = 0.01 + tt * 0.11;
  return `oklch(${l}% ${c} 245)`;
}
