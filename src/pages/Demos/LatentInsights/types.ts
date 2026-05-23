export type WaitReason =
  | "coordinator_stuck"
  | "repeated_moves"
  | "retry_exhausted"
  | "unexpected_error"
  | "human_review"
  | "context_exhausted";

export type FeedEventType =
  | "schema_summary_ready"
  | "session_ready"
  | "scout_done"
  | "thread_start"
  | "thread_resumed"
  | "step_start"
  | "llm_call"
  | "tool_call"
  | "step_complete"
  | "human_message"
  | "thread_complete"
  | "thread_waiting"
  | "synthesis_start";

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

  // thread_start / thread_complete / thread_waiting / thread_resumed
  seed_question?: string | null;
  motivation?: string | null;
  entry_point?: string | null;
  thread_status?: string | null;
  reason?: WaitReason | string | null;
  running_summary?: string | null;
  from_step?: number | null;

  // schema_summary_ready / session_ready / scout_done
  schema_summary_markdown?: string | null;
  dataset_path?: string | null;
  scout_questions?: ScoutQuestion[] | null;
  question_source?: string | null;
  question_count?: number | null;

  // synthesis_start
  source_threads?: string[] | null;
  synthesis_thread?: string | null;

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
