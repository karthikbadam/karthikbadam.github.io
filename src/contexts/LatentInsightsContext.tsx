import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
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
  ExplorationPattern,
} from "../pages/Demos/LatentInsights/types";
import { API_BASE } from "../pages/Demos/LatentInsights/config";
import { buildFeedFromSession } from "../pages/Demos/LatentInsights/utils";

// --- State ---

interface LatentInsightsState {
  status: "idle" | "loading" | "ready" | "error";
  mode: SessionMode | null;
  session: SessionResponse | null;
  feedEntries: FeedEntry[];
  selectedNode: SelectedNode | null;
  error: string | null;
}

const initialState: LatentInsightsState = {
  status: "idle",
  mode: null,
  session: null,
  feedEntries: [],
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
  | { type: "ADD_FEED_ENTRY"; entry: FeedEntry }
  | { type: "SET_FEED_ENTRIES"; entries: FeedEntry[] }
  | { type: "SELECT_NODE"; node: SelectedNode | null }
  | { type: "RESET" };

function reducer(state: LatentInsightsState, action: Action): LatentInsightsState {
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
          const existing = thread.steps.find(
            (s) => s.step_number === evt.step_number
          );
          if (!existing && evt.step_number !== undefined) {
            thread.steps = [
              ...thread.steps,
              {
                step_number: evt.step_number,
                move: "",
                instruction: "",
                result: "",
                view_created: null,
                duration_ms: null,
                events: [],
              },
            ];
          }
        } else if (evt.event_type === "step_complete") {
          thread.steps = thread.steps.map((s) =>
            s.step_number === evt.step_number
              ? { ...s, result: evt.result || s.result, move: evt.move || s.move }
              : s
          );
        } else if (evt.event_type === "thread_complete") {
          thread.status = "complete";
        } else if (evt.event_type === "thread_waiting") {
          thread.status = "waiting";
        } else if (
          evt.event_type === "llm_call" ||
          evt.event_type === "tool_call"
        ) {
          const lastStep = thread.steps[thread.steps.length - 1];
          if (lastStep) {
            const updatedStep = {
              ...lastStep,
              events: [
                ...lastStep.events,
                {
                  type: evt.event_type as "llm_call" | "tool_call",
                  timestamp: evt.timestamp,
                  agent: evt.role || null,
                  model: evt.model || null,
                  duration_ms: evt.duration_ms || null,
                  input_tokens: evt.input_tokens || null,
                  output_tokens: evt.output_tokens || null,
                  sql: evt.sql || null,
                  tool_result: evt.event_type === "tool_call" ? (evt.message || null) : null,
                  response: evt.event_type === "llm_call" ? (evt.message || null) : null,
                },
              ],
            };
            thread.steps = thread.steps.map((s) =>
              s.step_number === lastStep.step_number ? updatedStep : s
            );
          }
        }

        threads[idx] = thread;
      } else if (evt.event_type === "thread_start") {
        threads.push({
          id: evt.thread_id,
          seed_question: evt.message,
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
      if ((evt.event_type as string) === "schema_summary_ready" && evt.message) {
        session.schema_summary = evt.message;
      }

      return { ...state, session };
    }

    case "UPDATE_THREAD": {
      if (!state.session) return state;
      const threads = state.session.threads.map((t) =>
        t.id === action.thread.id ? action.thread : t
      );
      return { ...state, session: { ...state.session, threads } };
    }

    case "ADD_FEED_ENTRY":
      return { ...state, feedEntries: [...state.feedEntries, action.entry] };

    case "SET_FEED_ENTRIES":
      return { ...state, feedEntries: action.entries };

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
  loadSavedSession: (sessionId: string) => Promise<void>;
  loadLiveSession: (sessionId: string) => Promise<void>;
  uploadDataset: (file: File, config?: SessionConfig) => Promise<string | null>;
  replyToThread: (threadId: string, content: string) => Promise<void>;
  createThread: (sessionId: string, question: string, motivation?: string) => Promise<void>;
  broadcastMessage: (sessionId: string, content: string) => Promise<void>;
  switchPattern: (sessionId: string, pattern: ExplorationPattern) => Promise<void>;
  continueSession: (sessionId: string) => Promise<void>;
  selectNode: (node: SelectedNode | null) => void;
  reset: () => void;
}

const LatentInsightsContext = createContext<LatentInsightsContextValue | null>(null);

export function LatentInsightsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseEventCountRef = useRef<Map<string, number>>(new Map());

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
    sseEventCountRef.current.clear();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const connectSSE = useCallback(
    (sessionId: string) => {
      cleanup();
      let backoff = 1000;

      const connect = () => {
        const es = new EventSource(`${API_BASE}/sessions/${sessionId}/events`);
        eventSourceRef.current = es;

        const SSE_TYPES: string[] = [
          "scout_done",
          "thread_start",
          "step_start",
          "llm_call",
          "tool_call",
          "step_complete",
          "thread_complete",
          "thread_waiting",
          "schema_summary_ready",
        ];

        for (const eventType of SSE_TYPES) {
          es.addEventListener(eventType, (e: MessageEvent) => {
            try {
              const data = JSON.parse(e.data);
              const sseEvent: SSEEvent = { event_type: eventType as SSEEventType, ...data };

              const dedupeKey = `${data.thread_id}:${data.step_number ?? ""}:${eventType}:${data.timestamp}`;
              if (seenEventsRef.current.has(dedupeKey)) return;
              seenEventsRef.current.add(dedupeKey);

              let feedId: string;
              if (eventType === "thread_start") {
                feedId = `ts:${data.thread_id}`;
              } else if (eventType === "step_start") {
                feedId = `ss:${data.thread_id}:${data.step_number}`;
              } else if (eventType === "step_complete") {
                feedId = `sc:${data.thread_id}:${data.step_number}`;
              } else if (eventType === "thread_complete") {
                feedId = `tc:${data.thread_id}`;
              } else if (eventType === "thread_waiting") {
                feedId = `tw:${data.thread_id}`;
              } else {
                const stepKey = `${data.thread_id}:${data.step_number ?? "?"}`;
                const count = sseEventCountRef.current.get(stepKey) ?? 0;
                sseEventCountRef.current.set(stepKey, count + 1);
                feedId = `ev:${data.thread_id}:${data.step_number ?? 0}:${count}`;
              }

              const durationStr = data.duration_ms
                ? `${(data.duration_ms / 1000).toFixed(1)}s`
                : "";
              const previewMessage =
                eventType === "step_complete"
                  ? String(data.result ?? data.message ?? "")
                  : eventType === "thread_waiting"
                    ? String(data.error ?? data.message ?? data.running_summary ?? "")
                    : (eventType === "llm_call" || eventType === "tool_call")
                      ? durationStr
                      : String(data.message ?? "");

              const feedEntry: FeedEntry = {
                id: feedId,
                event_type: eventType as SSEEventType,
                thread_id: data.thread_id,
                message: previewMessage,
                timestamp: data.timestamp,
                step_number: data.step_number,
                move: eventType === "step_start" ? undefined : data.move,
                agent: data.agent || undefined,
                thread_status:
                  eventType === "thread_complete" ? "complete"
                  : eventType === "thread_waiting" ? "waiting"
                  : "running",
                sql: data.sql || undefined,
                response: eventType === "llm_call" ? (data.message || undefined) : undefined,
                full_message:
                  eventType === "step_complete" ? (data.result || undefined)
                  : eventType === "tool_call" ? (data.sql || data.message || undefined)
                  : eventType === "llm_call" ? (data.message || undefined)
                  : eventType === "thread_start" ? (data.message || undefined)
                  : undefined,
              };

              queueMicrotask(() => {
                dispatch({ type: "SSE_EVENT", event: sseEvent });
                dispatch({ type: "ADD_FEED_ENTRY", entry: feedEntry });
              });

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
                const entries = buildFeedFromSession(session);
                dispatch({ type: "SET_FEED_ENTRIES", entries });
              })
              .catch(() => {});
            connect();
          }, backoff);
          backoff = Math.min(backoff * 2, 30000);
        };
      };

      connect();
    },
    [cleanup]
  );

  const loadSavedSession = useCallback(async (sessionId: string) => {
    cleanup();
    dispatch({ type: "LOAD_START" });
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/saved`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const session: SessionResponse = await res.json();
      dispatch({ type: "LOAD_SESSION", session, mode: "saved" });
      const entries = buildFeedFromSession(session);
      dispatch({ type: "SET_FEED_ENTRIES", entries });
    } catch (e) {
      dispatch({
        type: "LOAD_ERROR",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }, [cleanup]);

  const loadLiveSession = useCallback(async (sessionId: string) => {
    cleanup();
    dispatch({ type: "LOAD_START" });
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const session: SessionResponse = await res.json();
      dispatch({ type: "LOAD_SESSION", session, mode: "live" });
      const entries = buildFeedFromSession(session);
      dispatch({ type: "SET_FEED_ENTRIES", entries });
      connectSSE(session.id);
    } catch (e) {
      dispatch({
        type: "LOAD_ERROR",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }, [cleanup, connectSSE]);

  const uploadDataset = useCallback(
    async (file: File, config?: SessionConfig): Promise<string | null> => {
      cleanup();
      try {
        const form = new FormData();
        form.append("file", file);
        if (config) {
          if (config.question_source) form.append("question_source", config.question_source);
          if (config.scout_context) form.append("scout_context", config.scout_context);
          if (config.seed_threads) form.append("seed_threads", String(config.seed_threads));
        }
        const res = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        dispatch({ type: "RESET" });
        return data.id || data.session_id || null;
      } catch (e) {
        dispatch({
          type: "LOAD_ERROR",
          error: e instanceof Error ? e.message : "Unknown error",
        });
        return null;
      }
    },
    [cleanup]
  );

  const replyToThread = useCallback(async (threadId: string, content: string) => {
    const res = await fetch(`${API_BASE}/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Reply failed: ${res.status}`);
  }, []);

  const createThread = useCallback(async (sessionId: string, question: string, motivation?: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, motivation }),
    });
    if (!res.ok) throw new Error(`Create thread failed: ${res.status}`);
  }, []);

  const broadcastMessage = useCallback(async (sessionId: string, content: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Broadcast failed: ${res.status}`);
  }, []);

  const switchPattern = useCallback(async (sessionId: string, pattern: ExplorationPattern) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/patterns/${pattern}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Switch pattern failed: ${res.status}`);
  }, []);

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

  return (
    <LatentInsightsContext.Provider
      value={{
        state,
        loadSavedSession,
        loadLiveSession,
        uploadDataset,
        replyToThread,
        createThread,
        broadcastMessage,
        switchPattern,
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
  if (!ctx) throw new Error("useLatentInsights must be used within LatentInsightsProvider");
  return ctx;
}
