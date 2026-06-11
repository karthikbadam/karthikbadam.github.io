// Agent-trajectory taxonomy + colour mapping, shared by the demos that
// visualize rollouts (Trajectory Atlas, Sankeyn). Categories map to Chakra
// `chart.*` tokens defined in src/theme.ts. The hex helpers below are for
// SVG fills (Visx) where we need a concrete colour string that responds to
// the active color mode.

import { chartPalette } from "../theme";

export type Category =
  | "task"
  | "thought"
  | "observation"
  | "plan"
  | "search"
  | "read"
  | "edit"
  | "exec"
  | "tool"
  | "verify"
  | "submit"
  | "error";

export type Outcome = "success" | "partial" | "fail";

/** Concrete hex from the theme chart palette — for SVG fills (Visx) where a
 * CSS token isn't usable directly. */
export function chartHex(key: keyof typeof chartPalette, dark: boolean): string {
  const v = chartPalette[key] ?? chartPalette.gray;
  return dark ? v.dark : v.light;
}

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

// Outcomes own green / yellow / red from observable10; tools draw from the
// remaining hues, so the two scales never overlap.
const OUTCOME_PALETTE_KEY: Record<Outcome, keyof typeof chartPalette> = {
  success: "green",
  partial: "orange",
  fail: "red",
};

const TOOL_POOL = [
  "blue",
  "cyan",
  "pink",
  "purple",
  "lightBlue",
  "brown",
  "teal",
  "gray",
] as const;

// Generator assignment order: common action categories first so they land on
// the most distinct hues; wraps when categories outnumber the pool.
const COLOR_ORDER: Category[] = [
  "exec",
  "read",
  "edit",
  "search",
  "tool",
  "plan",
  "verify",
  "submit",
  "task",
  "thought",
  "observation",
  "error",
];

function categoryPaletteKey(cat: Category): keyof typeof chartPalette {
  const i = COLOR_ORDER.indexOf(cat);
  return i < 0 ? "gray" : TOOL_POOL[i % TOOL_POOL.length];
}

/** Color for the synthetic "(none)" placeholder value. */
export function noneHex(dark: boolean): string {
  return dark ? "#4a5568" : "#a0aec0";
}

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
  // Claude-Code / multi-tool agent vocabularies (CapitalCase tool names).
  [/^(Read|LS|Glob|NotebookRead|view_file|cat|head|tail)$/, "read"],
  [/^(Grep|ripgrep|rg|search_files)$/, "search"],
  [/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|update_file|str_replace_based_edit_tool)$/, "edit"],
  [/^(Bash|BashOutput|KillBash|KillShell|run_command|terminal)$/, "exec"],
  [/^(Task|Agent|dispatch_agent|subagent|spawn_agent)$/, "tool"],
  [/^(TodoWrite|update_plan|ExitPlanMode)$/, "plan"],
  [/^(WebFetch|visit_url)$/, "read"],
  [/^WebSearch$/, "search"],
  [/^browser_(snapshot|screenshot|read|extract)$/, "read"],
  [/^browser_(navigate|click|type|select|scroll|hover|press|fill)$/, "tool"],
];

/** Column header for the i-th tool-call step of an outcome sankey.
 * `compact` drops the "tool" suffix so headers fit narrow column gaps. */
export function stepLabel(i: number, compact = false): string {
  const ord =
    i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`;
  if (compact) return ord;
  return i === 0 ? "Entry tool" : `${ord} tool`;
}

export function categoryFor(name: string): Category {
  for (const [pat, cat] of CATEGORY_RULES) {
    if (pat.test(name)) return cat;
  }
  return "tool";
}

/** Chakra token name (e.g. "chart.blue") for a category. */
export function categoryToken(cat: Category): string {
  return `chart.${categoryPaletteKey(cat)}`;
}

export function categoryHex(cat: Category, dark: boolean): string {
  return chartHex(categoryPaletteKey(cat), dark);
}

export function outcomeToken(o: Outcome): string {
  return `chart.${OUTCOME_PALETTE_KEY[o] ?? "gray"}`;
}

export function outcomeHex(o: Outcome, dark: boolean): string {
  return chartHex(OUTCOME_PALETTE_KEY[o] ?? "gray", dark);
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
