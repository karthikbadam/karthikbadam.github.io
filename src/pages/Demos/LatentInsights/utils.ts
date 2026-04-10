// Pure helper functions extracted from context and components

import type { FeedEntry, SelectedNode, SessionResponse } from "./types";
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
  move: string | undefined,
  isDark: boolean,
): MoveColor {
  const table = isDark ? MOVE_COLORS_DARK : MOVE_COLORS_LIGHT;
  const neutral = isDark ? NEUTRAL_FILL_DARK : NEUTRAL_FILL_LIGHT;
  if (!move) return neutral;
  return table[move.toUpperCase()] || neutral;
}

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

// --- Column profiles → markdown table ---
// Backend returns schema summary with a "Column profiles" section containing
// pipe-separated column descriptions with no newlines, like:
//   pl_name | VARCHAR | 6150/6150 | 6150 unique. Top: ... hostname | VARCHAR | ...
// We detect this pattern and reformat it as a markdown table.

const DUCKDB_TYPES = [
  "VARCHAR", "BIGINT", "INTEGER", "DOUBLE", "FLOAT", "BOOLEAN",
  "DATE", "TIMESTAMP", "TEXT", "SMALLINT", "TINYINT", "DECIMAL",
  "BLOB", "UUID", "TIME", "INTERVAL", "JSON",
];

function formatColumnProfiles(text: string): string {
  // Split into column entries using the pattern: <name> | <TYPE> |
  const typeAlt = DUCKDB_TYPES.join("|");
  const pattern = new RegExp(
    `(\\w+)\\s*\\|\\s*(${typeAlt})\\s*\\|\\s*([^|]+?)\\s*\\|\\s*`,
    "g",
  );
  const entries: { name: string; type: string; count: string; desc: string }[] = [];
  let lastIdx = 0;
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    matches.push(m);
  }
  if (matches.length < 2) return text; // not enough to reformat

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const descStart = cur.index + cur[0].length;
    const descEnd = next ? next.index : text.length;
    const desc = text.slice(descStart, descEnd).trim();
    entries.push({
      name: cur[1],
      type: cur[2],
      count: cur[3].trim(),
      desc: desc.replace(/\|/g, "\\|").replace(/\n/g, " "),
    });
    lastIdx = descEnd;
  }

  const header = "| Column | Type | Count | Profile |\n|---|---|---|---|";
  const rows = entries.map(
    (e) => `| \`${e.name}\` | ${e.type} | ${e.count} | ${e.desc} |`,
  );
  return [header, ...rows].join("\n") + text.slice(lastIdx);
}

export function formatSchemaSummary(raw: string): string {
  if (!raw) return raw;
  // Find "Column profiles" heading then format the rest as a table
  const match = raw.match(/(Column profiles)[:\s]*/i);
  if (!match) return raw;
  const headerEnd = match.index! + match[0].length;
  const before = raw.slice(0, headerEnd).replace(/Column profiles/i, "**Column profiles**\n\n");
  const after = raw.slice(headerEnd);
  return before + formatColumnProfiles(after);
}

// --- Selection mapping ---

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
  if (id.startsWith("ts:")) return { type: "thread", threadId: id.slice(3) };
  if (id.startsWith("tc:"))
    return { type: "thread_end", threadId: id.slice(3), threadStatus: "complete" };
  if (id.startsWith("tw:"))
    return { type: "thread_end", threadId: id.slice(3), threadStatus: "waiting" };
  if (id.startsWith("ss:") || id.startsWith("sc:")) {
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
  if (!node || !node.threadId) return null;
  switch (node.type) {
    case "thread":
      return `ts:${node.threadId}`;
    case "thread_end":
      return node.threadStatus === "waiting"
        ? `tw:${node.threadId}`
        : `tc:${node.threadId}`;
    case "step":
      return node.stepNumber !== undefined
        ? `ss:${node.threadId}:${node.stepNumber}`
        : null;
    case "event":
      return node.stepNumber !== undefined && node.eventIndex !== undefined
        ? `ev:${node.threadId}:${node.stepNumber}:${node.eventIndex}`
        : null;
    default:
      return null;
  }
}

// --- Build feed entries from a session snapshot ---

function formatDuration(ms: number | null | undefined): string {
  return ms ? `${(ms / 1000).toFixed(1)}s` : "";
}

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

      step.events.forEach((evt, ei) => {
        const base = {
          id: `ev:${thread.id}:${step.step_number}:${ei}`,
          thread_id: thread.id,
          message: formatDuration(evt.duration_ms),
          timestamp: evt.timestamp,
          step_number: step.step_number,
          move: step.move,
          thread_status: thread.status,
        };

        const isToolCall = evt.type === "tool_call" || (!!evt.sql && !!evt.tool_result);
        if (isToolCall) {
          entries.push({
            ...base,
            event_type: "tool_call",
            agent: evt.agent || "worker",
            sql: evt.sql || undefined,
            tool_result: evt.tool_result || undefined,
          });
        } else {
          const parsed = evt.response ? tryParseJsonResponse(evt.response) : null;
          entries.push({
            ...base,
            event_type: "llm_call",
            agent: evt.agent || undefined,
            response: parsed?.text || undefined,
            tables: parsed?.tables,
            full_message: parsed?.text
              ? undefined
              : `LLM call${evt.agent ? ` (${evt.agent})` : ""}`,
          });
        }
      });

      if (step.result) {
        entries.push({
          id: `sc:${thread.id}:${step.step_number}`,
          event_type: "step_complete",
          thread_id: thread.id,
          message: step.result,
          timestamp: (step.events[step.events.length - 1]?.timestamp || 0) + 0.001,
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
      const parts: string[] = [];
      if (thread.running_summary) parts.push(thread.running_summary);
      if (thread.error) parts.push(`**Reason:** ${thread.error}`);
      const lastStep = thread.steps[thread.steps.length - 1];
      if (!parts.length && lastStep?.result) parts.push(lastStep.result);
      entries.push({
        id: `tw:${thread.id}`,
        event_type: "thread_waiting",
        thread_id: thread.id,
        message: thread.error || thread.running_summary || "",
        timestamp: new Date(thread.updated_at).getTime() / 1000,
        thread_status: "waiting",
        full_message: parts.join("\n\n") || undefined,
      });
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}
