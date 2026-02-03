export type LoadingState =
  | { status: "idle" }
  | { status: "initializing" }
  | { status: "loading-parquet"; message: string; query?: string }
  | { status: "creating-tables"; table: string; query?: string }
  | { status: "updating-tables"; message: string; query?: string }
  | { status: "ready" }
  | { status: "error"; message: string };

