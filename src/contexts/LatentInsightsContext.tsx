import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  SessionResponse,
  ThreadResponse,
  SSEEvent,
  SSEEventType,
  FeedEntry,
  SessionMode,
  SelectedNode,
  SessionConfig,
} from "../pages/Demos/LatentInsights/types";
import { API_BASE } from "../pages/Demos/LatentInsights/config";
import { buildFeedFromSession } from "../pages/Demos/LatentInsights/utils";

// --- State ---

interface LatentInsightsState {
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

// --- Actions ---

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

    case "LOAD_SESSION": {
      return {
        ...state,
        status: "ready",
        mode: action.mode,
        session: action.session,
        error: null,
      };
    }

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
          // The real step arrives via step_start + step_complete shortly.
          thread.steps = [
            ...thread.steps,
            {
              step_number: -(Date.now()),
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
                evt.event_type === "llm_call"
                  ? evt.response ?? null
                  : null,
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

      // Handle session-level SSE events
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

// --- Context ---

interface LatentInsightsContextValue {
  state: LatentInsightsState;
  feedEntries: FeedEntry[];
  loadSavedSession: (sessionId: string) => Promise<void>;
  loadLiveSession: (sessionId: string) => Promise<void>;
  uploadDataset: (file: File, config?: SessionConfig) => Promise<string | null>;
  replyToThread: (threadId: string, content: string) => Promise<void>;
  createThread: (
    sessionId: string,
    question: string,
    motivation?: string,
  ) => Promise<void>;
  broadcastMessage: (sessionId: string, content: string) => Promise<void>;
  continueSession: (sessionId: string) => Promise<void>;
  selectNode: (node: SelectedNode | null) => void;
  reset: () => void;
}

const LatentInsightsContext = createContext<LatentInsightsContextValue | null>(
  null,
);

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

export function LatentInsightsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    seenEventsRef.current.clear();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const connectSSE = useCallback(
    (sessionId: string) => {
      cleanup();
      let backoff = 1000;

      const connect = () => {
        const es = new EventSource(`${API_BASE}/sessions/${sessionId}/events`);
        eventSourceRef.current = es;

        for (const eventType of SSE_TYPES) {
          es.addEventListener(eventType, (e: MessageEvent) => {
            try {
              const data = JSON.parse(e.data);
              const sseEvent: SSEEvent = {
                event_type: eventType,
                ...data,
              };

              const dedupeKey = `${data.thread_id}:${data.step_number ?? ""}:${eventType}:${data.timestamp}`;
              if (seenEventsRef.current.has(dedupeKey)) return;
              seenEventsRef.current.add(dedupeKey);

              dispatch({ type: "SSE_EVENT", event: sseEvent });
              backoff = 1000;
            } catch {
              // ignore parse errors
            }
          });
        }

        es.onerror = () => {
          es.close();
          eventSourceRef.current = null;
          reconnectTimerRef.current = setTimeout(() => {
            fetch(`${API_BASE}/sessions/${sessionId}`)
              .then((r) => r.json())
              .then((session: SessionResponse) => {
                dispatch({ type: "LOAD_SESSION", session, mode: "live" });
              })
              .catch(() => {});
            connect();
          }, backoff);
          backoff = Math.min(backoff * 2, 30000);
        };
      };

      connect();
    },
    [cleanup],
  );

  const loadSavedSession = useCallback(
    async (sessionId: string) => {
      cleanup();
      dispatch({ type: "LOAD_START" });
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/saved`);
        if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
        const session: SessionResponse = await res.json();
        dispatch({ type: "LOAD_SESSION", session, mode: "saved" });
      } catch (e) {
        dispatch({
          type: "LOAD_ERROR",
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [cleanup],
  );

  const loadLiveSession = useCallback(
    async (sessionId: string) => {
      cleanup();
      dispatch({ type: "LOAD_START" });
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
        if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
        const session: SessionResponse = await res.json();
        dispatch({ type: "LOAD_SESSION", session, mode: "live" });
        connectSSE(session.id);
      } catch (e) {
        dispatch({
          type: "LOAD_ERROR",
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [cleanup, connectSSE],
  );

  const uploadDataset = useCallback(
    async (file: File, config?: SessionConfig): Promise<string | null> => {
      cleanup();
      try {
        const form = new FormData();
        form.append("file", file);
        if (config) {
          const backendConfig: Record<string, unknown> = {
            question_source: config.question_source,
            seed_threads: config.seed_threads,
          };
          if (config.scout_context) {
            backendConfig.scout_context = config.scout_context;
          }
          if (config.initial_questions && config.initial_questions.length > 0) {
            backendConfig.initial_questions = config.initial_questions;
          }
          form.append("config", JSON.stringify(backendConfig));
        }
        const res = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        dispatch({ type: "RESET" });
        return data.id ?? data.session_id ?? null;
      } catch (e) {
        dispatch({
          type: "LOAD_ERROR",
          error: e instanceof Error ? e.message : "Unknown error",
        });
        return null;
      }
    },
    [cleanup],
  );

  const replyToThread = useCallback(
    async (threadId: string, content: string) => {
      const res = await fetch(`${API_BASE}/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Reply failed: ${res.status}`);
    },
    [],
  );

  const createThread = useCallback(
    async (sessionId: string, question: string, motivation?: string) => {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, motivation }),
      });
      if (!res.ok) throw new Error(`Create thread failed: ${res.status}`);
    },
    [],
  );

  const broadcastMessage = useCallback(
    async (sessionId: string, content: string) => {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Broadcast failed: ${res.status}`);
    },
    [],
  );

  const continueSession = useCallback(async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/continue`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Continue failed: ${res.status}`);
  }, []);

  const selectNode = useCallback((node: SelectedNode | null) => {
    dispatch({ type: "SELECT_NODE", node });
  }, []);

  const reset = useCallback(() => {
    cleanup();
    dispatch({ type: "RESET" });
  }, [cleanup]);

  const feedEntries = useMemo(
    () => (state.session ? buildFeedFromSession(state.session) : []),
    [state.session],
  );

  return (
    <LatentInsightsContext.Provider
      value={{
        state,
        feedEntries,
        loadSavedSession,
        loadLiveSession,
        uploadDataset,
        replyToThread,
        createThread,
        broadcastMessage,
        continueSession,
        selectNode,
        reset,
      }}
    >
      {children}
    </LatentInsightsContext.Provider>
  );
}

export function useLatentInsights() {
  const ctx = useContext(LatentInsightsContext);
  if (!ctx)
    throw new Error(
      "useLatentInsights must be used within LatentInsightsProvider",
    );
  return ctx;
}
