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

// Observable 10 mapping for sankey nodes / step dots. Each category has a
// concrete hex per mode so SVG `fill` doesn't depend on CSS-var resolution
// (which has been flaky inside the AnyTable / Mosaic SVG render path).
const HEX_LIGHT: Record<Category, string> = {
  plan: "#A463F2",
  task: "#A463F2",
  thought: "#97BBF5",
  observation: "#9498A0",
  search: "#6CC5B0",
  read: "#97BBF5",
  edit: "#EFB118",
  exec: "#4269D0",
  tool: "#3CA951",
  verify: "#9C6B4E",
  submit: "#FF8AB7",
  error: "#FF725C",
};

const HEX_DARK: Record<Category, string> = {
  plan: "#BC8AF5",
  task: "#BC8AF5",
  thought: "#B5CFFB",
  observation: "#B8BCC4",
  search: "#8FD8C5",
  read: "#B5CFFB",
  edit: "#F5C44D",
  exec: "#7B9BE8",
  tool: "#6BC97D",
  verify: "#B58A72",
  submit: "#FFA8C8",
  error: "#FF9580",
};

export function categoryHex(cat: Category, dark: boolean): string {
  return (dark ? HEX_DARK : HEX_LIGHT)[cat] ?? (dark ? "#B8BCC4" : "#9498A0");
}

// CSS-var-based mapping kept for code paths that DO resolve them
// (HTML/CSS step-dots in the table render through `color-mix(in oklab, ...)`).
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

const OUTCOME_HEX_LIGHT: Record<Outcome, string> = {
  success: "#4269D0",
  partial: "#EFB118",
  fail: "#FF725C",
};
const OUTCOME_HEX_DARK: Record<Outcome, string> = {
  success: "#7B9BE8",
  partial: "#F5C44D",
  fail: "#FF9580",
};
export function outcomeHex(o: Outcome, dark: boolean): string {
  return (dark ? OUTCOME_HEX_DARK : OUTCOME_HEX_LIGHT)[o] ?? (dark ? "#B8BCC4" : "#9498A0");
}

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
