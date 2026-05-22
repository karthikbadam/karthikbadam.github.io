// Pure helpers — colors and id<->selection mapping. All derivation
// (LLM JSON parsing, schema formatting, feed building, timestamp sorting)
// now lives on the backend; the frontend just renders.

import type { FeedEntry, SelectedNode } from "./types";
import {
  THREAD_SHADES_DARK,
  THREAD_SHADES_LIGHT,
  MOVE_COLORS_DARK,
  MOVE_COLORS_LIGHT,
  NEUTRAL_FILL_DARK,
  NEUTRAL_FILL_LIGHT,
  type MoveColor,
} from "./config";

// --- Colors ---

export function getThreadColor(
  threadId: string,
  threadIds: string[],
  isDark: boolean,
): string {
  const palette = isDark ? THREAD_SHADES_DARK : THREAD_SHADES_LIGHT;
  const idx = threadIds.indexOf(threadId);
  return palette[Math.max(0, idx) % palette.length];
}

export function getMoveColor(
  move: string | null | undefined,
  isDark: boolean,
): MoveColor {
  const table = isDark ? MOVE_COLORS_DARK : MOVE_COLORS_LIGHT;
  const neutral = isDark ? NEUTRAL_FILL_DARK : NEUTRAL_FILL_LIGHT;
  if (!move) return neutral;
  return table[move.toUpperCase()] ?? neutral;
}

// --- Expanded-row affordance ---

export function hasExpandableContent(entry: FeedEntry): boolean {
  return !!(
    entry.full_message ||
    entry.sql ||
    entry.tool_result ||
    entry.response_text ||
    entry.response_tables ||
    entry.content ||
    entry.scout_questions ||
    entry.source_threads ||
    entry.event_type === "thread_waiting" ||
    entry.event_type === "thread_start" ||
    entry.event_type === "thread_resumed" ||
    entry.event_type === "session_ready"
  );
}

// --- Graph node <-> feed id mapping ---
//
// Feed ids follow the backend's scheme:
//   schema:{session_id}
//   scout:{session_id}
//   session:{session_id}:ready
//   synthesis:{session_id}:{thread_id}
//   thread:{tid}:start | :complete | :waiting | :resumed:{N}
//   step:{tid}:{N}:start | :complete
//   human:{tid}:{N}            (HUMAN_INPUT — single row)
//   ev:{tid}:{N}:{I}

export function feedEntryToSelectedNode(entry: FeedEntry): SelectedNode | null {
  const parts = entry.id.split(":");
  const kind = parts[0];

  if (kind === "thread") {
    const threadId = parts[1];
    if (!threadId) return null;
    if (parts[2] === "complete")
      return { type: "thread_end", threadId, threadStatus: "complete" };
    if (parts[2] === "waiting")
      return { type: "thread_end", threadId, threadStatus: "waiting" };
    return { type: "thread", threadId };
  }
  if (kind === "step" || kind === "human") {
    const threadId = parts[1];
    const stepNumber = Number(parts[2]);
    if (!threadId || Number.isNaN(stepNumber)) return null;
    return { type: "step", threadId, stepNumber };
  }
  if (kind === "ev") {
    return {
      type: "event",
      threadId: parts[1],
      stepNumber: Number(parts[2]),
      eventIndex: Number(parts[3]),
    };
  }
  return null;
}

// Returns a primary feed id for a graph selection. Callers should fall
// back to searching by (thread_id, step_number) if the exact row was
// filtered out (e.g., a step has only step_complete, no step_start).
export function selectedNodeToFeedId(node: SelectedNode | null): string | null {
  if (!node || !node.threadId) return null;
  switch (node.type) {
    case "thread":
      return `thread:${node.threadId}:start`;
    case "thread_end":
      return node.threadStatus === "waiting"
        ? `thread:${node.threadId}:waiting`
        : `thread:${node.threadId}:complete`;
    case "step":
      return node.stepNumber !== undefined
        ? `step:${node.threadId}:${node.stepNumber}:start`
        : null;
    case "event":
      return node.stepNumber !== undefined && node.eventIndex !== undefined
        ? `ev:${node.threadId}:${node.stepNumber}:${node.eventIndex}`
        : null;
    default:
      return null;
  }
}
