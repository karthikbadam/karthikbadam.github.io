import { atom } from "jotai";
import { atomWithReducer } from "jotai/utils";
import {
  FeedEntry,
  ScoutQuestion,
  SelectedNode,
  SessionConfig,
  SessionMeta,
  SessionMode,
} from "./types";
import { API_BASE } from "./config";

export interface LatentInsightsState {
  status: "idle" | "loading" | "ready" | "error";
  mode: SessionMode | null;
  meta: SessionMeta | null;
  feedEntries: FeedEntry[];
  selectedNode: SelectedNode | null;
  error: string | null;
}

const initialState: LatentInsightsState = {
  status: "idle",
  mode: null,
  meta: null,
  feedEntries: [],
  selectedNode: null,
  error: null,
};

type Action =
  | { type: "LOAD_START" }
  | {
      type: "LOAD_DONE";
      meta: SessionMeta;
      entries: FeedEntry[];
      mode: SessionMode;
    }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "APPEND_FEED_ENTRY"; entry: FeedEntry }
  | { type: "SCOUT_QUESTIONS"; questions: ScoutQuestion[] }
  | { type: "SELECT_NODE"; node: SelectedNode | null }
  | { type: "RESET" };

function reducer(
  state: LatentInsightsState,
  action: Action,
): LatentInsightsState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, status: "loading", error: null };

    case "LOAD_DONE":
      return {
        ...state,
        status: "ready",
        mode: action.mode,
        meta: action.meta,
        feedEntries: action.entries,
        error: null,
      };

    case "LOAD_ERROR":
      return { ...state, status: "error", error: action.error };

    case "APPEND_FEED_ENTRY": {
      // Replace-by-id if a row with this id already exists (e.g.,
      // step_complete updating a step_start row's status).
      const i = state.feedEntries.findIndex((e) => e.id === action.entry.id);
      if (i >= 0) {
        const next = state.feedEntries.slice();
        next[i] = { ...next[i], ...action.entry };
        return { ...state, feedEntries: next };
      }
      return { ...state, feedEntries: [...state.feedEntries, action.entry] };
    }

    case "SCOUT_QUESTIONS":
      return {
        ...state,
        meta: state.meta
          ? { ...state.meta, scout_questions: action.questions }
          : state.meta,
      };

    case "SELECT_NODE":
      return { ...state, selectedNode: action.node };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

export const stateAtom = atomWithReducer<LatentInsightsState, Action>(
  initialState,
  reducer,
);

export const metaAtom = atom((get) => get(stateAtom).meta);
export const feedEntriesAtom = atom((get) => get(stateAtom).feedEntries);
export const selectedNodeAtom = atom((get) => get(stateAtom).selectedNode);
export const schemaSummaryAtom = atom((get) => {
  const entries = get(stateAtom).feedEntries;
  const entry = entries.find((e) => e.event_type === "schema_summary_ready");
  return entry?.schema_summary_markdown ?? null;
});

// --- SSE plumbing ---

interface SSEHandle {
  es: EventSource | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export const sseHandleAtom = atom<SSEHandle | null>(null);

export const cleanupSSEAtom = atom(null, (get, set) => {
  const h = get(sseHandleAtom);
  if (!h) return;
  if (h.es) h.es.close();
  if (h.reconnectTimer) clearTimeout(h.reconnectTimer);
  set(sseHandleAtom, null);
});

// The backend emits one event type per FeedEntry. The frontend listens for
// all of them and appends the parsed entry. The 'message' event is the
// generic fallback (some SSE servers default to that).
const SSE_EVENT_NAMES = [
  "schema_summary_ready",
  "thread_start",
  "thread_resumed",
  "step_start",
  "llm_call",
  "tool_call",
  "step_complete",
  "human_message",
  "thread_complete",
  "thread_waiting",
  "scout_done",
  "feed_entry",
  "message",
] as const;

export const connectSSEAtom = atom(null, (_get, set, sessionId: string) => {
  set(cleanupSSEAtom);
  const handle: SSEHandle = { es: null, reconnectTimer: null };
  let backoff = 1000;

  const connect = () => {
    const es = new EventSource(`${API_BASE}/sessions/${sessionId}/events`);
    handle.es = es;

    const onMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.event_type === "scout_done" && Array.isArray(data.questions)) {
          set(stateAtom, { type: "SCOUT_QUESTIONS", questions: data.questions });
          return;
        }
        if (data && data.event_type && data.id !== undefined) {
          set(stateAtom, { type: "APPEND_FEED_ENTRY", entry: data as FeedEntry });
          backoff = 1000;
        }
      } catch {
        // ignore parse errors
      }
    };

    for (const name of SSE_EVENT_NAMES) {
      es.addEventListener(name, onMessage as EventListener);
    }

    es.onerror = () => {
      es.close();
      handle.es = null;
      handle.reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30000);
    };
  };

  connect();
  set(sseHandleAtom, handle);
});

// --- Loaders ---

interface SessionInfo {
  id: string;
  dataset_path?: string | null;
  created_at?: string | null;
  scout_questions?: ScoutQuestion[] | null;
}

async function fetchMetaAndFeed(
  sessionId: string,
  metaUrl: string,
  feedUrl: string,
): Promise<{ meta: SessionMeta; entries: FeedEntry[] }> {
  const [metaRes, feedRes] = await Promise.all([
    fetch(metaUrl),
    fetch(feedUrl),
  ]);
  if (!metaRes.ok) throw new Error(`Session not found (${metaRes.status})`);
  if (!feedRes.ok) throw new Error(`Feed not found (${feedRes.status})`);
  const metaJson: SessionInfo = await metaRes.json();
  const entries: FeedEntry[] = await feedRes.json();
  const meta: SessionMeta = {
    id: metaJson.id ?? sessionId,
    dataset_path: metaJson.dataset_path ?? null,
    created_at: metaJson.created_at ?? null,
    scout_questions: metaJson.scout_questions ?? null,
  };
  return { meta, entries };
}

export const loadSavedSessionAtom = atom(
  null,
  async (_get, set, sessionId: string) => {
    set(cleanupSSEAtom);
    set(stateAtom, { type: "LOAD_START" });
    try {
      // Saved sessions ship as a SessionResponse snapshot (for metadata)
      // and a flat FeedEntry list. The static host serves both.
      const { meta, entries } = await fetchMetaAndFeed(
        sessionId,
        `/data/latent-insights/${sessionId}.json`,
        `/data/latent-insights/${sessionId}.feed.json`,
      );
      set(stateAtom, { type: "LOAD_DONE", meta, entries, mode: "saved" });
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
      const { meta, entries } = await fetchMetaAndFeed(
        sessionId,
        `${API_BASE}/sessions/${sessionId}`,
        `${API_BASE}/sessions/${sessionId}/feed`,
      );
      set(stateAtom, { type: "LOAD_DONE", meta, entries, mode: "live" });
      set(connectSSEAtom, sessionId);
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
