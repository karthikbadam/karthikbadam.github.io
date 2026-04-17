export type WaitReason =
  | "coordinator_stuck"
  | "repeated_moves"
  | "retry_exhausted"
  | "unexpected_error"
  | "human_review"
  | "context_exhausted";

export type StepEventType = "llm_call" | "tool_call" | "human_message";

export interface StepEvent {
  type: StepEventType;
  timestamp: number;
  agent: string | null;
  model: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  sql: string | null;
  tool_result: string | null;
  response: string | null;
  /** Populated only when type === "human_message". */
  content?: string | null;
  /** Populated only when type === "human_message". */
  target?: "thread" | "session" | null;
}

export interface StepResponse {
  step_number: number;
  move: string;
  instruction: string;
  result: string;
  view_created: string | null;
  duration_ms: number | null;
  events: StepEvent[];
  /** Wall-clock timestamp of step_start, used for feed ordering. */
  started_at?: number;
}

export interface ThreadResponse {
  id: string;
  seed_question: string;
  motivation: string | null;
  status: "running" | "complete" | "waiting" | "error";
  summary: string | null;
  running_summary: string | null;
  /** Free-text error / reason string, populated on every waiting transition. */
  error: string | null;
  steps: StepResponse[];
  updated_at: string;
}

export interface ScoutQuestion {
  question: string;
  motivation: string;
  entry_point: string;
  difficulty: string;
}

export interface SessionUrls {
  self: string;
  events: string;
  threads: string;
}

export interface SessionResponse {
  id: string;
  /** May be absent on very fresh sessions right after upload */
  dataset_path?: string | null;
  schema_summary: string | null;
  scout_questions: ScoutQuestion[] | null;
  threads: ThreadResponse[];
  urls: SessionUrls;
  created_at: string;
}

export type SSEEventType =
  | "scout_done"
  | "thread_start"
  | "thread_resumed"
  | "step_start"
  | "llm_call"
  | "tool_call"
  | "step_complete"
  | "thread_complete"
  | "thread_waiting"
  | "schema_summary_ready"
  | "message_injected";

export interface SSEEvent {
  event_type: SSEEventType;
  thread_id: string;
  /** Present on thread_start, scout_done; absent on most others. */
  message?: string;
  timestamp: number;
  step_number?: number;
  move?: string;
  result?: string;
  agent?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  has_tool_calls?: boolean;
  sql?: string;
  tool_result?: string;
  response?: string;
  instruction?: string;
  provisional?: boolean;
  running_summary?: string | null;
  reason?: WaitReason;
  schema_summary?: string;
  content?: string;
  target?: "thread" | "session";
  /** Populated on `message_injected` when target === "session". */
  injected_threads?: string[];
  /** Populated on `message_injected` when target === "session". */
  resumed_threads?: string[];
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

export interface FeedEntry {
  id: string;
  event_type: SSEEventType | StepEvent["type"];
  thread_id: string;
  message: string;
  timestamp: number;
  step_number?: number;
  move?: string;
  agent?: string;
  thread_status?: string;
  /** Classified reason for thread_waiting entries. */
  reason?: WaitReason | null;
  sql?: string;
  tool_result?: string;
  response?: string;
  /** Inline human message text (for type === "human_message"). */
  content?: string;
  /** Where the message was sent (for type === "human_message"). */
  target?: "thread" | "session";
  full_message?: string;
  tables?: Record<string, unknown[]>;
}

export interface SelectedNode {
  type: "session" | "thread" | "thread_end" | "step" | "event";
  threadId?: string;
  stepNumber?: number;
  eventIndex?: number;
  threadStatus?: string;
}
