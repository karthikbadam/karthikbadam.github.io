// Pure helper functions extracted from context and components

import type {
  FeedEntry,
  SelectedNode,
  SessionResponse,
} from "./types";
import { THREAD_SHADES_DARK, THREAD_SHADES_LIGHT } from "./config";

// --- JSON response parsing ---

export function tryParseJsonResponse(
  raw: string,
): { text: string; tables?: Record<string, unknown[]> } {
  try {
    const obj = JSON.parse(raw);
    const tables: Record<string, unknown[]> = {};
    for (const key of Object.keys(obj)) {
      if (
        Array.isArray(obj[key]) &&
        obj[key].length > 0 &&
        typeof obj[key][0] === "object"
      ) {
        tables[key] = obj[key];
      }
    }
    const text = obj.summary || obj.assessment || "";
    return { text, tables: Object.keys(tables).length > 0 ? tables : undefined };
  } catch {
    const summaryMatch = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (summaryMatch)
      return {
        text: summaryMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      };
    return { text: raw };
  }
}

// --- Build feed entries from a session snapshot ---

export function buildFeedFromSession(session: SessionResponse): FeedEntry[] {
  const entries: FeedEntry[] = [];
  if (!session.threads) return entries;

  for (const thread of session.threads) {
    const firstEventTs = thread.steps[0]?.events[0]?.timestamp;
    const threadStartTs = firstEventTs
      ? firstEventTs - 0.01
      : new Date(thread.updated_at).getTime() / 1000 - 1000;

    const seed = thread.seed_question ?? "";
    entries.push({
      id: `ts:${thread.id}`,
      event_type: "thread_start",
      thread_id: thread.id,
      message: seed,
      timestamp: threadStartTs,
      thread_status: thread.status,
      full_message: seed + (thread.motivation ? `\n\n${thread.motivation}` : ""),
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
            message: evt.duration_ms
              ? `${(evt.duration_ms / 1000).toFixed(1)}s`
              : "",
            timestamp: evt.timestamp,
            step_number: step.step_number,
            move: step.move,
            agent: evt.agent || "worker",
            thread_status: thread.status,
            sql: evt.sql || undefined,
            tool_result: hasToolResult ? evt.tool_result! : undefined,
          });
        } else {
          const parsed = evt.response
            ? tryParseJsonResponse(evt.response)
            : null;
          entries.push({
            id: `ev:${thread.id}:${step.step_number}:${ei}`,
            event_type: "llm_call",
            thread_id: thread.id,
            message: evt.duration_ms
              ? `${(evt.duration_ms / 1000).toFixed(1)}s`
              : "",
            timestamp: evt.timestamp,
            step_number: step.step_number,
            move: step.move,
            agent: evt.agent || undefined,
            thread_status: thread.status,
            response: parsed?.text || undefined,
            tables: parsed?.tables,
            full_message: parsed?.text
              ? undefined
              : `LLM call${evt.agent ? ` (${evt.agent})` : ""}`,
          });
        }
      }

      if (step.result) {
        entries.push({
          id: `sc:${thread.id}:${step.step_number}`,
          event_type: "step_complete",
          thread_id: thread.id,
          message: step.result,
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
        message: thread.error || thread.running_summary || "",
        timestamp: new Date(thread.updated_at).getTime() / 1000,
        thread_status: "waiting",
        full_message: waitParts.join("\n\n") || undefined,
      });
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

// --- EventFeed helpers ---

export function getThreadColor(
  threadId: string,
  threadIds: string[],
  isDark: boolean,
): string {
  const palette = isDark ? THREAD_SHADES_DARK : THREAD_SHADES_LIGHT;
  const idx = threadIds.indexOf(threadId);
  return palette[idx % palette.length];
}

export function hasExpandableContent(entry: FeedEntry): boolean {
  return !!(
    entry.full_message ||
    entry.sql ||
    entry.tool_result ||
    entry.response ||
    entry.tables ||
    entry.event_type === "thread_waiting" ||
    entry.event_type === "thread_start"
  );
}

export function feedEntryToSelectedNode(entry: FeedEntry): SelectedNode | null {
  const id = entry.id;
  if (id.startsWith("ts:")) {
    return { type: "thread", threadId: id.slice(3) };
  }
  if (id.startsWith("tc:")) {
    return { type: "thread_end", threadId: id.slice(3), threadStatus: "complete" };
  }
  if (id.startsWith("tw:")) {
    return { type: "thread_end", threadId: id.slice(3), threadStatus: "waiting" };
  }
  if (id.startsWith("ss:")) {
    const parts = id.slice(3).split(":");
    return { type: "step", threadId: parts[0], stepNumber: Number(parts[1]) };
  }
  if (id.startsWith("sc:")) {
    const parts = id.slice(3).split(":");
    return { type: "step", threadId: parts[0], stepNumber: Number(parts[1]) };
  }
  if (id.startsWith("ev:")) {
    const parts = id.slice(3).split(":");
    return {
      type: "event",
      threadId: parts[0],
      stepNumber: Number(parts[1]),
      eventIndex: Number(parts[2]),
    };
  }
  return null;
}

export function selectedNodeToFeedId(node: SelectedNode | null): string | null {
  if (!node) return null;
  switch (node.type) {
    case "thread":
      return node.threadId ? `ts:${node.threadId}` : null;
    case "thread_end":
      if (!node.threadId) return null;
      if (node.threadStatus === "waiting") return `tw:${node.threadId}`;
      return `tc:${node.threadId}`;
    case "step":
      return node.threadId && node.stepNumber !== undefined
        ? `ss:${node.threadId}:${node.stepNumber}`
        : null;
    case "event":
      return node.threadId &&
        node.stepNumber !== undefined &&
        node.eventIndex !== undefined
        ? `ev:${node.threadId}:${node.stepNumber}:${node.eventIndex}`
        : null;
    default:
      return null;
  }
}

// --- FlowViz helpers ---

export function moveAbbr(move: string | undefined): string {
  if (!move) return "";
  const upper = move.toUpperCase();
  const ABBR: Record<string, string> = {
    SCOPE: "SC",
    FORAGE: "FO",
    FRAME: "FR",
    INTERROGATE: "IN",
    SYNTHESIZE: "SY",
    ERROR: "ER",
    UNKNOWN: "??",
  };
  return ABBR[upper] || upper.slice(0, 2);
}
