import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../config";

export interface LocalSession {
  id: string;
  dataset_path?: string;
  thread_count: number;
  created_at: string;
  status: string;
}

export function useLocalSessions() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(false);

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
          status: (s.status as string) || "running",
        })),
      );
    } catch {
      // server not reachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, refresh };
}
