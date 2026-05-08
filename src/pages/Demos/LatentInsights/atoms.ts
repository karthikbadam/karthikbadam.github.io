import { atom } from "jotai";
import { atomWithReducer } from "jotai/utils";
import {
  SessionResponse,
  ThreadResponse,
  SSEEvent,
  SSEEventType,
  FeedEntry,
  SessionMode,
  SelectedNode,
  SessionConfig,
} from "./types";
import { API_BASE } from "./config";
import { buildFeedFromSession } from "./utils";

export interface LatentInsightsState {
  status: "idle" | "loading" | "ready" | "error";
  mode: SessionMode | null;
  session: SessionResponse | null;
  selectedNode: SelectedNode | null;
  error: string | null;
}

const initialState: LatentInsightsState = {
  status: "idle",
  mode: null,
  session: null,
  selectedNode: null,
  error: null,
};

type Action =
  | { type: "LOAD_START" }
  | { type: "LOAD_SESSION"; session: SessionResponse; mode: SessionMode }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "SSE_EVENT"; event: SSEEvent }
  | { type: "UPDATE_THREAD"; thread: ThreadResponse }
  | { type: "SELECT_NODE"; node: SelectedNode | null }
  | { type: "RESET" };

function reducer(
  state: LatentInsightsState,
  action: Action,
): LatentInsightsState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, status: "loading", error: null };

    case "LOAD_SESSION":
      return {
        ...state,
        status: "ready",
        mode: action.mode,
        session: action.session,
        error: null,
      };

    case "LOAD_ERROR":
      return { ...state, status: "error", error: action.error };

    case "SSE_EVENT": {
      if (!state.session) return state;
      const evt = action.event;
      const session = { ...state.session };
      const threads = [...session.threads];

      const idx = threads.findIndex((t) => t.id === evt.thread_id);
      if (idx >= 0) {
        const thread = { ...threads[idx] };

        if (evt.event_type === "step_start") {
          // When a real HUMAN_INPUT step arrives, clear any temporary
          // placeholder steps created by message_injected.
          if (evt.move === "HUMAN_INPUT") {
            thread.steps = thread.steps.filter((s) => s.step_number >= 0);
          }
          const existing = thread.steps.find(
            (s) => s.step_number === evt.step_number,
          );
          if (!existing && evt.step_number !== undefined) {
            thread.steps = [
              ...thread.steps,
              {
                step_number: evt.step_number,
                move: evt.move ?? "",
                instruction: evt.instruction ?? "",
                result: "",
                view_created: null,
                duration_ms: null,
                events: [],
                started_at: evt.timestamp,
              },
            ];
          }
        } else if (evt.event_type === "step_complete") {
          thread.steps = thread.steps.map((s) =>
            s.step_number === evt.step_number
              ? {
                  ...s,
                  result: evt.result ?? s.result,
                  move: evt.move ?? s.move,
                  instruction: evt.instruction ?? s.instruction,
                  duration_ms: evt.duration_ms ?? s.duration_ms,
                }
              : s,
          );
        } else if (evt.event_type === "thread_complete") {
          thread.status = "complete";
        } else if (evt.event_type === "thread_resumed") {
          thread.status = "running";
          thread.error = null;
          thread.running_summary = null;
        } else if (evt.event_type === "thread_waiting") {
          thread.status = "waiting";
          thread.error = evt.reason ?? thread.error ?? null;
          thread.running_summary =
            evt.running_summary ?? thread.running_summary ?? null;
        } else if (evt.event_type === "message_injected") {
          // Immediate echo: create a temporary HUMAN_INPUT step so the
          // message shows up in the feed before the runner drains it.
          thread.steps = [
            ...thread.steps,
            {
              step_number: -Date.now(),
              move: "HUMAN_INPUT",
              instruction: evt.target ?? "thread",
              result: evt.content ?? "",
              view_created: null,
              duration_ms: 0,
              events: [],
              started_at: evt.timestamp,
            },
          ];
        } else if (
          evt.event_type === "llm_call" ||
          evt.event_type === "tool_call"
        ) {
          const lastStep = thread.steps[thread.steps.length - 1];
          if (lastStep) {
            const newEvent = {
              type: evt.event_type,
              timestamp: evt.timestamp,
              agent:
                evt.agent ??
                (evt.event_type === "tool_call" ? "worker" : null),
              model: evt.model ?? null,
              duration_ms: evt.duration_ms ?? null,
              input_tokens: evt.input_tokens ?? null,
              output_tokens: evt.output_tokens ?? null,
              sql: evt.sql ?? null,
              tool_result:
                evt.event_type === "tool_call"
                  ? evt.tool_result ?? null
                  : null,
              response:
                evt.event_type === "llm_call" ? evt.response ?? null : null,
            };
            thread.steps = thread.steps.map((s) =>
              s.step_number === lastStep.step_number
                ? { ...s, events: [...s.events, newEvent] }
                : s,
            );
          }
        }

        threads[idx] = thread;
      } else if (evt.event_type === "message_injected") {
        // Session-level broadcast: create temporary HUMAN_INPUT steps
        // on each target thread for immediate feedback.
        const targets = new Set([
          ...(evt.injected_threads ?? []),
          ...(evt.resumed_threads ?? []),
        ]);
        for (let i = 0; i < threads.length; i++) {
          if (!targets.has(threads[i].id)) continue;
          const t = { ...threads[i] };
          t.steps = [
            ...t.steps,
            {
              step_number: -(Date.now() + i),
              move: "HUMAN_INPUT",
              instruction: "session",
              result: evt.content ?? "",
              view_created: null,
              duration_ms: 0,
              events: [],
              started_at: evt.timestamp,
            },
          ];
          threads[i] = t;
        }
      } else if (evt.event_type === "thread_start") {
        threads.push({
          id: evt.thread_id,
          seed_question: evt.message ?? "",
          motivation: null,
          status: "running",
          summary: null,
          running_summary: null,
          error: null,
          steps: [],
          updated_at: new Date(evt.timestamp * 1000).toISOString(),
        });
      }

      session.threads = threads;

      if (evt.event_type === "scout_done" && evt.message) {
        try {
          const questions = JSON.parse(evt.message);
          if (Array.isArray(questions)) {
            session.scout_questions = questions;
          }
        } catch {
          // scout_done message may not be JSON
        }
      }
      if (evt.event_type === "schema_summary_ready" && evt.schema_summary) {
        session.schema_summary = evt.schema_summary;
      }

      return { ...state, session };
    }

    case "UPDATE_THREAD": {
      if (!state.session) return state;
      const threads = state.session.threads.map((t) =>
        t.id === action.thread.id ? action.thread : t,
      );
      return { ...state, session: { ...state.session, threads } };
    }

    case "SELECT_NODE":
      return { ...state, selectedNode: action.node };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// Single reducer atom holds the entire state machine.
export const stateAtom = atomWithReducer<LatentInsightsState, Action>(
  initialState,
  reducer,
);

// Derived selectors so consumers can subscribe to slices.
export const sessionAtom = atom((get) => get(stateAtom).session);
export const selectedNodeAtom = atom((get) => get(stateAtom).selectedNode);
export const feedEntriesAtom = atom<FeedEntry[]>((get) => {
  const session = get(sessionAtom);
  return session ? buildFeedFromSession(session) : [];
});

const SSE_TYPES: SSEEventType[] = [
  "scout_done",
  "thread_start",
  "thread_resumed",
  "step_start",
  "llm_call",
  "tool_call",
  "step_complete",
  "thread_complete",
  "thread_waiting",
  "schema_summary_ready",
  "message_injected",
];

interface SSEHandle {
  es: EventSource | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  seenEvents: Set<string>;
}

// SSE plumbing — one bundle so cleanup is atomic.
export const sseHandleAtom = atom<SSEHandle | null>(null);

export const cleanupSSEAtom = atom(null, (get, set) => {
  const h = get(sseHandleAtom);
  if (!h) return;
  if (h.es) h.es.close();
  if (h.reconnectTimer) clearTimeout(h.reconnectTimer);
  h.seenEvents.clear();
  set(sseHandleAtom, null);
});

export const connectSSEAtom = atom(
  null,
  (_get, set, sessionId: string) => {
    set(cleanupSSEAtom);
    const handle: SSEHandle = {
      es: null,
      reconnectTimer: null,
      seenEvents: new Set<string>(),
    };
    let backoff = 1000;

    const connect = () => {
      const es = new EventSource(`${API_BASE}/sessions/${sessionId}/events`);
      handle.es = es;

      for (const eventType of SSE_TYPES) {
        es.addEventListener(eventType, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const sseEvent: SSEEvent = { event_type: eventType, ...data };

            const dedupeKey = `${data.thread_id}:${data.step_number ?? ""}:${eventType}:${data.timestamp}`;
            if (handle.seenEvents.has(dedupeKey)) return;
            handle.seenEvents.add(dedupeKey);

            set(stateAtom, { type: "SSE_EVENT", event: sseEvent });
            backoff = 1000;
          } catch {
            // ignore parse errors
          }
        });
      }

      es.onerror = () => {
        es.close();
        handle.es = null;
        handle.reconnectTimer = setTimeout(() => {
          fetch(`${API_BASE}/sessions/${sessionId}`)
            .then((r) => r.json())
            .then((session: SessionResponse) => {
              set(stateAtom, {
                type: "LOAD_SESSION",
                session,
                mode: "live",
              });
            })
            .catch(() => {});
          connect();
        }, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
    };

    connect();
    set(sseHandleAtom, handle);
  },
);

// Action atoms

export const loadSavedSessionAtom = atom(
  null,
  async (_get, set, sessionId: string) => {
    set(cleanupSSEAtom);
    set(stateAtom, { type: "LOAD_START" });
    try {
      const res = await fetch(`/data/latent-insights/${sessionId}.json`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const session: SessionResponse = await res.json();
      set(stateAtom, { type: "LOAD_SESSION", session, mode: "saved" });
    } catch (e) {
      set(stateAtom, {
        type: "LOAD_ERROR",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  },
);

export const loadLiveSessionAtom = atom(
  null,
  async (_get, set, sessionId: string) => {
    set(cleanupSSEAtom);
    set(stateAtom, { type: "LOAD_START" });
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const session: SessionResponse = await res.json();
      set(stateAtom, { type: "LOAD_SESSION", session, mode: "live" });
      set(connectSSEAtom, session.id);
    } catch (e) {
      set(stateAtom, {
        type: "LOAD_ERROR",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  },
);

export const uploadDatasetAtom = atom(
  null,
  async (
    _get,
    set,
    payload: { file: File; config?: SessionConfig },
  ): Promise<string | null> => {
    set(cleanupSSEAtom);
    try {
      const form = new FormData();
      form.append("file", payload.file);
      if (payload.config) {
        const backendConfig: Record<string, unknown> = {
          question_source: payload.config.question_source,
          seed_threads: payload.config.seed_threads,
        };
        if (payload.config.scout_context) {
          backendConfig.scout_context = payload.config.scout_context;
        }
        if (
          payload.config.initial_questions &&
          payload.config.initial_questions.length > 0
        ) {
          backendConfig.initial_questions = payload.config.initial_questions;
        }
        form.append("config", JSON.stringify(backendConfig));
      }
      const res = await fetch(`${API_BASE}/sessions`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      set(stateAtom, { type: "RESET" });
      return data.id ?? data.session_id ?? null;
    } catch (e) {
      set(stateAtom, {
        type: "LOAD_ERROR",
        error: e instanceof Error ? e.message : "Unknown error",
      });
      return null;
    }
  },
);

export const replyToThreadAtom = atom(
  null,
  async (
    _get,
    _set,
    payload: { threadId: string; content: string },
  ): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/threads/${payload.threadId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payload.content }),
      },
    );
    if (!res.ok) throw new Error(`Reply failed: ${res.status}`);
  },
);

export const createThreadAtom = atom(
  null,
  async (
    _get,
    _set,
    payload: { sessionId: string; question: string; motivation?: string },
  ): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/sessions/${payload.sessionId}/threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: payload.question,
          motivation: payload.motivation,
        }),
      },
    );
    if (!res.ok) throw new Error(`Create thread failed: ${res.status}`);
  },
);

export const broadcastMessageAtom = atom(
  null,
  async (
    _get,
    _set,
    payload: { sessionId: string; content: string },
  ): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/sessions/${payload.sessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payload.content }),
      },
    );
    if (!res.ok) throw new Error(`Broadcast failed: ${res.status}`);
  },
);

export const continueSessionAtom = atom(
  null,
  async (_get, _set, sessionId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/continue`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Continue failed: ${res.status}`);
  },
);

export const selectNodeAtom = atom(
  null,
  (_get, set, node: SelectedNode | null) => {
    set(stateAtom, { type: "SELECT_NODE", node });
  },
);

export const resetAtom = atom(null, (_get, set) => {
  set(cleanupSSEAtom);
  set(stateAtom, { type: "RESET" });
});

