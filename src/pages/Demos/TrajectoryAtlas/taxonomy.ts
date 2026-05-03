// Trajectory Atlas — taxonomy + colour mapping.
// Categories map to Chakra `chart.*` tokens defined in src/theme.ts. The
// hex helpers below are for SVG fills (Visx) where we need a concrete
// colour string that responds to the active color mode.

import { chartPalette } from "../../../theme";
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
  task: "Task",
  observation: "Observation",
  thought: "Thought",
};

// Category → palette key. Used both for `bg={`chart.${CAT_PALETTE_KEY[c]}`}`
// in JSX and for hex resolution in SVG.
export const CAT_PALETTE_KEY: Record<Category, keyof typeof chartPalette> = {
  plan: "purple",
  task: "purple",
  thought: "lightBlue",
  observation: "gray",
  search: "cyan",
  read: "lightBlue",
  edit: "orange",
  exec: "blue",
  tool: "green",
  verify: "brown",
  submit: "pink",
  error: "red",
};

const OUTCOME_PALETTE_KEY: Record<Outcome, keyof typeof chartPalette> = {
  success: "blue",
  partial: "orange",
  fail: "red",
};

export const OUTCOME_ORDER: Outcome[] = ["success", "partial", "fail"];

const CATEGORY_RULES: Array<[RegExp, Category]> = [
  [/^(task|user_task)$/, "task"],
  [/^(observation|user_observation|tool_response)$/, "observation"],
  [/^(thought|think|thinking)$/, "thought"],
  [/^(final_answer|submit|finish|done)$/, "submit"],
  [/^(web_search|google_search|bing_search|duckduckgo_search)$/, "search"],
  [/^(grep_search|codebase_search|find_file|grep|search)$/, "search"],
  [/^(visit_webpage|read_file|open_url|view_image)$/, "read"],
  [/^file_editor\.view$/, "read"],
  [/^file_editor\.(str_replace|create|insert|write)$/, "edit"],
  [/^(write_file|str_replace|patch|edit|create_file|append_file|file_editor)$/, "edit"],
  [/^(execute_bash|bash|python|run_tests|pytest|run_code|shell)$/, "exec"],
  [/^(solve|simplify|symbols|Rational|Fraction|Eq|integrate|limit|factor|factorial|comb|sqrt|sin|cos|tan|log|exp|sympify|gcd|limit_denominator|create)$/, "exec"],
  [/^(api_call|sql_query|calculator|requests|httpx|fetch)$/, "tool"],
  [/^(assert|diff_check|lint|verify)$/, "verify"],
];

export function categoryFor(name: string): Category {
  for (const [pat, cat] of CATEGORY_RULES) {
    if (pat.test(name)) return cat;
  }
  return "tool";
}

/** Chakra token name (e.g. "chart.blue") for a category. */
export function categoryToken(cat: Category): string {
  return `chart.${CAT_PALETTE_KEY[cat]}`;
}

/** Concrete hex for an SVG fill — used by visx where a CSS token isn't
 * usable directly. */
export function categoryHex(cat: Category, dark: boolean): string {
  const key = CAT_PALETTE_KEY[cat] ?? "gray";
  const v = chartPalette[key];
  return dark ? v.dark : v.light;
}

export function outcomeToken(o: Outcome): string {
  return `chart.${OUTCOME_PALETTE_KEY[o] ?? "gray"}`;
}

export function outcomeHex(o: Outcome, dark: boolean): string {
  const key = OUTCOME_PALETTE_KEY[o] ?? "gray";
  const v = chartPalette[key];
  return dark ? v.dark : v.light;
}

/**
 * Sequential accent ramp for the icicle plot. Light mode interpolates from
 * `--accent-bg` (pale wash) to `--accent` (deep blue); dark mode flips to a
 * warm sand parchment ramp.
 */
export function accentRamp(t: number, dark: boolean): string {
  const tt = Math.max(0, Math.min(1, t));
  if (dark) {
    const l = 22 + tt * 60;
    const c = 0.04;
    return `oklch(${l}% ${c} 75)`;
  }
  const l = 96 - tt * 54;
  const c = 0.01 + tt * 0.11;
  return `oklch(${l}% ${c} 245)`;
}
