export interface StepEvent {
  type: "llm_call" | "tool_call";
  timestamp: number;
  agent: string | null;
  model: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  sql: string | null;
  tool_result: string | null;
  response: string | null;
}

export interface StepResponse {
  step_number: number;
  move: string;
  instruction: string;
  result: string;
  view_created: string | null;
  duration_ms: number | null;
  events: StepEvent[];
}

export interface ThreadResponse {
  id: string;
  seed_question: string;
  motivation: string | null;
  status: "running" | "complete" | "waiting" | "error";
  summary: string | null;
  running_summary: string | null;
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
  | "step_start"
  | "llm_call"
  | "tool_call"
  | "step_complete"
  | "thread_complete"
  | "thread_waiting";

export interface SSEEvent {
  event_type: SSEEventType;
  thread_id: string;
  message: string;
  timestamp: number;
  step_number?: number;
  move?: string;
  result?: string;
  role?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  has_tool_calls?: boolean;
  sql?: string;
}

export type SessionMode = "saved" | "live";

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
  sql?: string;
  tool_result?: string;
  response?: string;
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

export const FEATURED_SESSIONS = [
  {
    id: "846f0bbfefc0",
    dataset: "cars.csv",
    description: "10 threads, 60 steps",
  },
  {
    id: "a59dfbbd0fee",
    dataset: "exoplanets-nasa.csv",
    description: "8 threads, 4 waiting",
  },
  {
    id: "746fa2380425",
    dataset: "star_classification.csv",
    description: "8 threads, 3 waiting",
  },
] as const;
