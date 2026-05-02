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
  task: "Task",
  observation: "Observation",
  thought: "Thought",
};

// Observable 10 mapping for sankey nodes / step dots.
// Resolved from the existing site theme CSS variables (see src/theme.ts).
export const CAT_COLOR: Record<Category, string> = {
  plan: "var(--chart-purple)",
  task: "var(--chart-purple)",
  thought: "var(--chart-light-blue)",
  observation: "var(--chart-gray)",
  search: "var(--chart-cyan)",
  read: "var(--chart-light-blue)",
  edit: "var(--chart-orange)",
  exec: "var(--chart-blue)",
  tool: "var(--chart-green)",
  verify: "var(--chart-brown)",
  submit: "var(--chart-pink)",
  error: "var(--chart-red)",
};

export const OUTCOME_COLOR: Record<Outcome, string> = {
  success: "var(--chart-blue)",
  partial: "var(--chart-orange)",
  fail: "var(--chart-red)",
};

export const OUTCOME_ORDER: Outcome[] = ["success", "partial", "fail"];

// JS mirror of the Python extractor's category rules — kept in sync so the UI
// can map a tool name to a colour bucket without re-querying the DB.
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
