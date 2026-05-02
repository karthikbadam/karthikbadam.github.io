// Trajectory Atlas — shared types.

export type Category =
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

export interface Step {
  idx: number;
  category: Category;
  tool: string;
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
  steps: Step[];
}

export type IcicleSelection = {
  kind: "icicle";
  level: number;
  category: Category;
  trajIds: Set<string>;
};

export type SankeySelection = {
  kind: "sankey";
  fromCol: number;
  from: string;
  to: string;
  trajIds: Set<string>;
};

export type RowSelection = {
  kind: "row";
  trajId: string;
  traj: Trajectory;
};

export type Selection = IcicleSelection | SankeySelection | RowSelection;

export type SourceKey = "qwen" | "deepswe";

export interface SourceConfig {
  key: SourceKey;
  label: string;
  parquetUrl: string;
  hfUrl?: string;
}
