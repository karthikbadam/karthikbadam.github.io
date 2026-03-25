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
} from "../pages/Demos/LatentInsights/types";

const API_BASE = import.meta.env.DEV
  ? "http://localhost:8000/api"
  : "https://latent-insights-service-production.up.railway.app/api";

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
                move: evt.move || "UNKNOWN",
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

// --- Build feed from snapshot ---

function tryParseJsonResponse(raw: string): { text: string; tables?: Record<string, unknown[]> } {
  try {
    const obj = JSON.parse(raw);
    const tables: Record<string, unknown[]> = {};
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === "object") {
        tables[key] = obj[key];
      }
    }
    const text = obj.summary || obj.assessment || "";
    return { text, tables: Object.keys(tables).length > 0 ? tables : undefined };
  } catch {
    const summaryMatch = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (summaryMatch) return { text: summaryMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') };
    return { text: raw };
  }
}

function buildFeedFromSession(session: SessionResponse): FeedEntry[] {
  const entries: FeedEntry[] = [];
  if (!session.threads) return entries;

  for (const thread of session.threads) {
    const firstEventTs = thread.steps[0]?.events[0]?.timestamp;
    const threadStartTs = firstEventTs
      ? firstEventTs - 0.01
      : new Date(thread.updated_at).getTime() / 1000 - 1000;

    entries.push({
      id: `ts:${thread.id}`,
      event_type: "thread_start",
      thread_id: thread.id,
      message: thread.seed_question.slice(0, 80),
      timestamp: threadStartTs,
      thread_status: thread.status,
      full_message: thread.seed_question + (thread.motivation ? `\n\n${thread.motivation}` : ""),
    });

    for (const step of thread.steps) {
      entries.push({
        id: `ss:${thread.id}:${step.step_number}`,
        event_type: "step_start",
        thread_id: thread.id,
        message: "",
        timestamp: step.events[0]?.timestamp || 0,
        step_number: step.step_number,
        move: step.move,
        thread_status: thread.status,
        full_message: step.instruction || undefined,
      });

      for (let ei = 0; ei < step.events.length; ei++) {
        const evt = step.events[ei];

        const hasSql = !!evt.sql;
        const hasToolResult = !!evt.tool_result;

        if (evt.type === "tool_call" || (hasSql && hasToolResult)) {
          entries.push({
            id: `ev:${thread.id}:${step.step_number}:${ei}`,
            event_type: "tool_call",
            thread_id: thread.id,
            message: evt.duration_ms ? `${evt.duration_ms}ms` : "",
            timestamp: evt.timestamp,
            step_number: step.step_number,
            move: step.move,
            agent: evt.agent || "worker",
            thread_status: thread.status,
            sql: evt.sql || undefined,
            tool_result: hasToolResult ? evt.tool_result! : undefined,
          });
        } else {
          const parsed = evt.response ? tryParseJsonResponse(evt.response) : null;
          entries.push({
            id: `ev:${thread.id}:${step.step_number}:${ei}`,
            event_type: "llm_call",
            thread_id: thread.id,
            message: evt.duration_ms ? `${(evt.duration_ms / 1000).toFixed(1)}s` : "",
            timestamp: evt.timestamp,
            step_number: step.step_number,
            move: step.move,
            agent: evt.agent || undefined,
            thread_status: thread.status,
            response: parsed?.text || undefined,
            tables: parsed?.tables,
            full_message: parsed?.text ? undefined : `LLM call${evt.agent ? ` (${evt.agent})` : ""}`,
          });
        }
      }

      if (step.result) {
        entries.push({
          id: `sc:${thread.id}:${step.step_number}`,
          event_type: "step_complete",
          thread_id: thread.id,
          message: step.result.slice(0, 80),
          timestamp:
            (step.events[step.events.length - 1]?.timestamp || 0) + 0.001,
          step_number: step.step_number,
          move: step.move,
          thread_status: thread.status,
          full_message: step.result,
        });
      }
    }

    if (thread.status === "complete") {
      entries.push({
        id: `tc:${thread.id}`,
        event_type: "thread_complete",
        thread_id: thread.id,
        message: "",
        timestamp: new Date(thread.updated_at).getTime() / 1000,
        thread_status: "complete",
        full_message: thread.summary || undefined,
      });
    } else if (thread.status === "waiting") {
      const waitParts: string[] = [];
      if (thread.running_summary) waitParts.push(thread.running_summary);
      if (thread.error) waitParts.push(`**Reason:** ${thread.error}`);
      const lastStep = thread.steps[thread.steps.length - 1];
      if (!waitParts.length && lastStep?.result) waitParts.push(lastStep.result);
      entries.push({
        id: `tw:${thread.id}`,
        event_type: "thread_waiting",
        thread_id: thread.id,
        message: thread.error ? thread.error.slice(0, 80) : "",
        timestamp: new Date(thread.updated_at).getTime() / 1000,
        thread_status: "waiting",
        full_message: waitParts.join("\n\n") || undefined,
      });
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

// --- Context ---

interface LatentInsightsContextValue {
  state: LatentInsightsState;
  loadSavedSession: (sessionId: string) => Promise<void>;
  loadLiveSession: (sessionId: string) => Promise<void>;
  uploadDataset: (file: File) => Promise<void>;
  replyToThread: (threadId: string, content: string) => Promise<void>;
  selectNode: (node: SelectedNode | null) => void;
  reset: () => void;
}

const LatentInsightsContext = createContext<LatentInsightsContextValue | null>(null);

export function LatentInsightsProvider({ children }: { children: React.ReactNode }) {
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

        const SSE_TYPES: SSEEventType[] = [
          "scout_done",
          "thread_start",
          "step_start",
          "llm_call",
          "tool_call",
          "step_complete",
          "thread_complete",
          "thread_waiting",
        ];

        for (const eventType of SSE_TYPES) {
          es.addEventListener(eventType, (e: MessageEvent) => {
            try {
              const data = JSON.parse(e.data);
              const sseEvent: SSEEvent = { event_type: eventType, ...data };

              const dedupeKey = `${data.thread_id}:${data.step_number ?? ""}:${eventType}:${data.timestamp}`;
              if (seenEventsRef.current.has(dedupeKey)) return;
              seenEventsRef.current.add(dedupeKey);

              dispatch({ type: "SSE_EVENT", event: sseEvent });
              dispatch({
                type: "ADD_FEED_ENTRY",
                entry: {
                  id: `sse-${Date.now()}-${Math.random()}`,
                  event_type: eventType,
                  thread_id: data.thread_id,
                  message: data.message || "",
                  timestamp: data.timestamp,
                  step_number: data.step_number,
                  move: data.move,
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
                },
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
    async (file: File) => {
      cleanup();
      dispatch({ type: "LOAD_START" });
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const session: SessionResponse = await res.json();
        dispatch({ type: "LOAD_SESSION", session, mode: "live" });
        dispatch({ type: "SET_FEED_ENTRIES", entries: [] });
        connectSSE(session.id);
      } catch (e) {
        dispatch({
          type: "LOAD_ERROR",
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [cleanup, connectSSE]
  );

  const replyToThread = useCallback(async (threadId: string, content: string) => {
    const res = await fetch(`${API_BASE}/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Reply failed: ${res.status}`);
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
