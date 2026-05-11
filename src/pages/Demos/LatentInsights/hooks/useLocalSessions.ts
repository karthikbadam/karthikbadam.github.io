import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../config";

export interface LocalSession {
  id: string;
  dataset_path?: string;
  thread_count: number;
  created_at: string;
  status: string;
}

function deriveSessionStatus(
  statusCounts: Record<string, number> | undefined,
): string {
  if (!statusCounts || Object.keys(statusCounts).length === 0) return "idle";
  if (statusCounts.running) return "running";
  if (statusCounts.waiting) return "waiting";
  if (statusCounts.error) return "error";
  if (statusCounts.complete) return "complete";
  return "idle";
}

export function useLocalSessions() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.sessions ?? []);
      setSessions(
        list.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          dataset_path: s.dataset_path as string,
          thread_count:
            s.thread_count ??
            s.num_threads ??
            (Array.isArray(s.threads) ? s.threads.length : 0),
          created_at: s.created_at as string,
          status: deriveSessionStatus(
            s.status_counts as Record<string, number> | undefined,
          ),
        })),
      );
    } catch {
      // server not reachable
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, ready, refresh };
}
