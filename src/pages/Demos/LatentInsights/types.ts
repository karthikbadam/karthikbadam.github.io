export type WaitReason =
  | "coordinator_stuck"
  | "repeated_moves"
  | "retry_exhausted"
  | "unexpected_error"
  | "human_review"
  | "context_exhausted";

export type FeedEventType =
  | "schema_summary_ready"
  | "thread_start"
  | "step_start"
  | "llm_call"
  | "tool_call"
  | "step_complete"
  | "human_message"
  | "thread_complete"
  | "thread_waiting"
  | "thread_resumed";

// Single render-ready row. Mirrors the backend's FeedEntry schema.
// Both saved-mode JSON files and live SSE events deliver this exact shape.
export interface FeedEntry {
  id: string;
  feed_index: number;
  event_type: FeedEventType;
  thread_id: string;
  timestamp: number;
  message: string;
  full_message?: string | null;

  step_number?: number;
  move?: string | null;
  agent?: string | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  duration_ms?: number | null;

  // tool_call
  sql?: string | null;
  tool_result?: string | null;

  // llm_call — backend pre-parses the response
  response_text?: string | null;
  response_tables?: Record<string, unknown[]> | null;

  // human_message
  content?: string | null;
  target?: string | null;

  // thread_start / thread_complete / thread_waiting
  seed_question?: string | null;
  motivation?: string | null;
  thread_status?: string | null;
  reason?: WaitReason | string | null;
  running_summary?: string | null;

  // schema_summary_ready
  schema_summary_markdown?: string | null;

  // step_start coordinator extras
  instruction?: string | null;
  assessment?: string | null;
  rationale?: string | null;
  status?: string | null;
}

export interface ScoutQuestion {
  question: string;
  motivation: string;
  entry_point: string;
  difficulty: string;
}

export interface SessionMeta {
  id: string;
  dataset_path?: string | null;
  created_at?: string | null;
  scout_questions?: ScoutQuestion[] | null;
}

export type SessionMode = "saved" | "live";

export type ExplorationPattern = "coordinator_worker";
export type QuestionSource = "scout" | "human" | "both";

export type CommandMode = "ask" | "broadcast" | "direct" | "continue";

export interface SessionConfig {
  question_source?: QuestionSource;
  scout_context?: string;
  seed_threads?: number;
  initial_questions?: string[];
}

export interface SelectedNode {
  type: "session" | "thread" | "thread_end" | "step" | "event";
  threadId?: string;
  stepNumber?: number;
  eventIndex?: number;
  threadStatus?: string;
}
