// Trajectory Atlas — shared types. Category/Outcome live with the shared
// taxonomy in src/components/taxonomy.ts; re-exported for local imports.

import type { Category, Outcome } from "../../../components/taxonomy";

export type { Category, Outcome };

export interface Step {
  idx: number;
  name: string;             // tool name OR "task" / "thought" / "observation"
  category: Category;
  tool: string;             // alias of `name` kept for back-compat
  role: string;             // user / assistant / tool
  tokens: number;
  duration: number;
  ok: boolean;
}

export interface Trajectory {
  id: string;
  dataset: string;
  model: string;
  task: string;
  outcome: Outcome;
  step_count: number;
  tokens: number;
  duration: number;
  reward: number;
  cost: number;
  tools_used: string[];
  step_tools: string[];   // flat per-step tool name (matches steps[].name)
  steps: Step[];
}

export type SourceKey = "qwen" | "deepswe";

export interface SourceConfig {
  key: SourceKey;
  label: string;
  parquetUrl: string;
}
