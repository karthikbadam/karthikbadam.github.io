#!/usr/bin/env node
// One-time / repeatable converter: SessionResponse JSON → flat FeedEntry[] JSON.
//
// The frontend now consumes a flat list of render-ready entries. Until the
// backend session ships `GET /sessions/{id}/feed` and the corresponding
// `scripts/export_feed.py` migration, this Node port keeps the saved-mode
// demo working. Output should match what the backend mapper will produce.
//
// Usage:
//   node scripts/build-saved-feeds.mjs              # process all *.json (skip *.feed.json)
//   node scripts/build-saved-feeds.mjs 746fa2380425 # one session id

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = "public/data/latent-insights";

const DUCKDB_TYPES = [
  "VARCHAR", "BIGINT", "INTEGER", "DOUBLE", "FLOAT", "BOOLEAN",
  "DATE", "TIMESTAMP", "TEXT", "SMALLINT", "TINYINT", "DECIMAL",
  "BLOB", "UUID", "TIME", "INTERVAL", "JSON",
];

function tryParseJsonResponse(raw) {
  if (!raw) return { text: null, tables: null };
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { text: raw, tables: null };
    const tables = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] !== null) {
        tables[k] = v;
      }
    }
    const text = obj.summary ?? obj.assessment ?? obj.text ?? null;
    return { text, tables: Object.keys(tables).length ? tables : null };
  } catch {
    const m = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return { text: m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'), tables: null };
    return { text: raw, tables: null };
  }
}

function formatColumnProfiles(text) {
  const typeAlt = DUCKDB_TYPES.join("|");
  const pattern = new RegExp(`(\\w+)\\s*\\|\\s*(${typeAlt})\\s*\\|\\s*([^|]+?)\\s*\\|\\s*`, "g");
  const matches = [];
  let m;
  while ((m = pattern.exec(text)) !== null) matches.push(m);
  if (matches.length < 2) return text;
  const entries = [];
  let lastIdx = 0;
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const start = cur.index + cur[0].length;
    const end = next ? next.index : text.length;
    entries.push({
      name: cur[1],
      type: cur[2],
      count: cur[3].trim(),
      desc: text.slice(start, end).trim().replace(/\|/g, "\\|").replace(/\n/g, " "),
    });
    lastIdx = end;
  }
  const header = "| Column | Type | Count | Profile |\n|---|---|---|---|";
  const rows = entries.map((e) => `| \`${e.name}\` | ${e.type} | ${e.count} | ${e.desc} |`);
  return [header, ...rows].join("\n") + text.slice(lastIdx);
}

function formatSchemaSummary(raw) {
  if (!raw) return raw;
  const m = raw.match(/Column profiles[:\s]*/i);
  if (!m) return raw;
  return formatColumnProfiles(raw.slice(m.index + m[0].length));
}

function sessionToFeed(session) {
  const out = [];
  let idx = 0;
  const emit = (e) => {
    out.push({ ...e, feed_index: idx++ });
  };

  const sessionTs = session.created_at
    ? new Date(session.created_at).getTime() / 1000
    : 0;

  if (session.schema_summary) {
    emit({
      id: `schema:${session.id}`,
      event_type: "schema_summary_ready",
      thread_id: "",
      timestamp: sessionTs,
      message: "Dataset profiled.",
      schema_summary_markdown: formatSchemaSummary(session.schema_summary),
      dataset_path: session.dataset_path ?? null,
    });
  }

  if (session.scout_questions && session.scout_questions.length) {
    emit({
      id: `scout:${session.id}`,
      event_type: "scout_done",
      thread_id: "",
      timestamp: sessionTs,
      message: `Scout found ${session.scout_questions.length} questions`,
      scout_questions: session.scout_questions,
      question_count: session.scout_questions.length,
    });
  }

  for (const thread of session.threads ?? []) {
    const firstEventTs = thread.steps?.[0]?.events?.[0]?.timestamp;
    const threadStartTs = firstEventTs
      ? firstEventTs - 0.01
      : new Date(thread.updated_at).getTime() / 1000 - 1000;

    const seed = thread.seed_question ?? "";
    emit({
      id: `thread:${thread.id}:start`,
      event_type: "thread_start",
      thread_id: thread.id,
      message: seed,
      timestamp: threadStartTs,
      thread_status: thread.status,
      seed_question: seed,
      motivation: thread.motivation ?? null,
      full_message: seed + (thread.motivation ? `\n\n${thread.motivation}` : ""),
    });

    let cursor = threadStartTs;

    for (const step of thread.steps ?? []) {
      if (step.step_number < 0) continue; // legacy placeholder; should not occur in saved snapshots

      const stepTs = step.started_at ?? step.events?.[0]?.timestamp ?? cursor + 0.001;

      if (step.move === "HUMAN_INPUT") {
        emit({
          id: `step:${thread.id}:${step.step_number}`,
          event_type: "human_message",
          thread_id: thread.id,
          message: step.result || "",
          timestamp: stepTs,
          step_number: step.step_number,
          move: step.move,
          agent: step.instruction === "session" ? "broadcast" : "user",
          content: step.result ?? "",
          target: step.instruction ?? "thread",
          thread_status: thread.status,
        });
        cursor = stepTs;
        continue;
      }

      if (step.move === "WAITING_FOR_HUMAN") {
        const parts = [];
        if (thread.running_summary) parts.push(thread.running_summary);
        if (step.result) parts.push(step.result);
        if (step.instruction) parts.push(step.instruction);
        emit({
          id: `thread:${thread.id}:waiting`,
          event_type: "thread_waiting",
          thread_id: thread.id,
          message: thread.error ?? step.result ?? "",
          timestamp: stepTs,
          step_number: step.step_number,
          move: step.move,
          thread_status: "waiting",
          reason: thread.error ?? null,
          running_summary: thread.running_summary ?? null,
          full_message: parts.length ? parts.join("\n\n") : null,
        });
        cursor = stepTs;
        continue;
      }

      emit({
        id: `step:${thread.id}:${step.step_number}:start`,
        event_type: "step_start",
        thread_id: thread.id,
        message: "",
        timestamp: stepTs,
        step_number: step.step_number,
        move: step.move,
        thread_status: thread.status,
        instruction: step.instruction ?? null,
        full_message: step.instruction ?? null,
      });

      (step.events ?? []).forEach((evt, ei) => {
        const base = {
          id: `ev:${thread.id}:${step.step_number}:${ei}`,
          thread_id: thread.id,
          message: evt.duration_ms ? `${(evt.duration_ms / 1000).toFixed(1)}s` : "",
          timestamp: evt.timestamp,
          step_number: step.step_number,
          move: step.move,
          thread_status: thread.status,
          duration_ms: evt.duration_ms ?? null,
          agent: evt.agent ?? null,
          model: evt.model ?? null,
          input_tokens: evt.input_tokens ?? null,
          output_tokens: evt.output_tokens ?? null,
        };

        if (evt.type === "tool_call" || evt.sql) {
          emit({
            ...base,
            event_type: "tool_call",
            agent: evt.agent ?? "worker",
            sql: evt.sql ?? null,
            tool_result: evt.tool_result ?? null,
          });
        } else if (evt.type === "human_message") {
          emit({
            ...base,
            event_type: "human_message",
            agent: evt.target === "session" ? "broadcast" : "user",
            content: evt.content ?? "",
            target: evt.target ?? "thread",
          });
        } else {
          const parsed = evt.response ? tryParseJsonResponse(evt.response) : { text: null, tables: null };
          emit({
            ...base,
            event_type: "llm_call",
            response_text: parsed.text,
            response_tables: parsed.tables,
            full_message: parsed.text || `LLM call${evt.agent ? ` (${evt.agent})` : ""}`,
          });
        }
      });

      const lastEvtTs = step.events?.[step.events.length - 1]?.timestamp ?? stepTs;
      cursor = lastEvtTs;

      if (step.result) {
        emit({
          id: `step:${thread.id}:${step.step_number}:complete`,
          event_type: "step_complete",
          thread_id: thread.id,
          message: step.result,
          timestamp: lastEvtTs + 0.001,
          step_number: step.step_number,
          move: step.move,
          duration_ms: step.duration_ms ?? null,
          thread_status: thread.status,
          full_message: step.result,
        });
        cursor = lastEvtTs + 0.001;
      }
    }

    if (thread.status === "complete") {
      emit({
        id: `thread:${thread.id}:complete`,
        event_type: "thread_complete",
        thread_id: thread.id,
        message: thread.summary ?? "",
        timestamp: new Date(thread.updated_at).getTime() / 1000,
        thread_status: "complete",
        full_message: thread.summary ?? null,
      });
    }
  }

  return out;
}

const onlyId = process.argv[2];
const files = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".feed.json"))
  .filter((f) => (onlyId ? f === `${onlyId}.json` : true));

for (const f of files) {
  const inPath = path.join(DATA_DIR, f);
  const outPath = path.join(DATA_DIR, f.replace(/\.json$/, ".feed.json"));
  const session = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const feed = sessionToFeed(session);
  fs.writeFileSync(outPath, JSON.stringify(feed, null, 2) + "\n");
  console.log(`${inPath} → ${outPath} (${feed.length} entries)`);
}
