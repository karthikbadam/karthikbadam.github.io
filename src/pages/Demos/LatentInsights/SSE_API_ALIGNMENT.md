# SSE ↔ API Response Alignment: Improvement Proposals

The UI builds two versions of the same data: one from the REST snapshot
(`GET /sessions/{id}`) and one incrementally from SSE events. Several fields
are missing or inconsistent in the SSE stream, forcing the UI to guess,
defer, or show degraded information during live streaming that only corrects
on page refresh.

---

## 0. `seed_threads` session config is ignored on upload

**Problem:** When the user sets `seed_threads: 1` in the session config during
upload, the backend still spawns one thread per scout-generated question (7–10
threads). The `seed_threads` parameter has no visible effect.

**Current UI workaround:** Send `seed_threads` as a form field, a `config`
JSON string, and a query parameter — in case the backend expects any of those
shapes.

**Proposed fix (backend):**
- Accept `seed_threads` via `POST /sessions` form data or JSON body
- Cap the number of spawned threads at `min(seed_threads, len(scout_questions))`
- Document clearly whether `seed_threads` controls initial thread count or
  maximum concurrent threads
- Consider renaming to `max_threads` or `initial_threads` for clarity

---

## 1. `step_start` should not include a `move` field (or mark it provisional)

**Problem:** `step_start` SSE events send a `move` (often `"forage"`) before
the coordinator has decided the real move. The UI displayed the wrong move type
for every step during live streaming. We now ignore the `step_start` move
entirely and wait for `step_complete`.

**Proposed fix (backend):** Either:
- Remove `move` from `step_start` events entirely, or
- Add a `provisional: true` flag so the UI can render it dimmed/italic

**Fields affected:** `step_start.move`

---

## 2. `step_complete` should always include the final `move`

**Problem:** `step_complete` SSE events sometimes omit the `move` field. When
this happens, the step keeps whatever move was set by `step_start` (which we
now set to empty). On refresh, the snapshot has the correct move.

**Proposed fix (backend):** Always include `move` in `step_complete` events.
This is the authoritative source of the step's move type.

**Fields affected:** `step_complete.move` (make required, not optional)

---

## 3. `step_complete` should include `instruction` and `result`

**Problem:** The snapshot `StepResponse` has `instruction` (what the
coordinator told the worker) and `result` (the final output). SSE
`step_complete` has `result` but not `instruction`. During live streaming,
expanding a step shows no instruction.

**Proposed fix (backend):** Include `instruction` in `step_complete`:
```json
{
  "event": "step_complete",
  "thread_id": "...",
  "step_number": 3,
  "move": "INTERROGATE",
  "instruction": "Check whether PM2.5 correlates with...",
  "result": "Found a 0.73 correlation..."
}
```

**Fields affected:** `step_complete.instruction` (new)

---

## 4. `llm_call` and `tool_call` events need structured response data

**Problem:** SSE `llm_call` events put everything in a flat `message` string.
The snapshot `StepEvent` has separate `response`, `sql`, `tool_result`,
`agent`, `model`, `duration_ms`, `input_tokens`, `output_tokens` fields.
During live streaming, the UI can't distinguish LLM assessment text from SQL
results, and can't parse tables from JSON responses.

**Proposed fix (backend):** Add structured fields to SSE events:
```json
{
  "event": "llm_call",
  "thread_id": "...",
  "step_number": 2,
  "agent": "coordinator",
  "model": "claude-3.5-haiku",
  "duration_ms": 1523,
  "input_tokens": 450,
  "output_tokens": 120,
  "response": "{\"assessment\": \"...\", \"next_move\": \"forage\"}"
}
```
```json
{
  "event": "tool_call",
  "thread_id": "...",
  "step_number": 2,
  "agent": "worker",
  "duration_ms": 234,
  "sql": "SELECT borough, AVG(pm25) ...",
  "tool_result": "[{\"borough\": \"Manhattan\", \"avg_pm25\": 8.2}, ...]"
}
```

Currently, `message` is overloaded — it carries the SQL for tool calls
sometimes, the LLM response text other times, or a summary. Having explicit
`sql`, `tool_result`, and `response` fields on SSE events (matching the
snapshot schema) would eliminate all client-side guessing.

**Fields affected:** Add `sql`, `tool_result`, `response` to SSE event payload.
Currently only `message`, `sql` (sometimes), `agent` (sometimes) are sent.

---

## 5. `thread_start` should include `motivation`

**Problem:** The snapshot `ThreadResponse` has `motivation` (why this question
matters). SSE `thread_start` only sends `message` (the seed question). The UI
can't show motivation during live streaming.

**Proposed fix (backend):**
```json
{
  "event": "thread_start",
  "thread_id": "...",
  "message": "How does PM2.5 vary across boroughs?",
  "motivation": "Understanding spatial distribution helps..."
}
```

**Fields affected:** `thread_start.motivation` (new)

---

## 6. `thread_complete` should include `summary`

**Problem:** The snapshot `ThreadResponse` has `summary` (final thread
conclusion). SSE `thread_complete` doesn't include it. The UI shows an
empty expanded view for completed threads during live streaming.

**Proposed fix (backend):**
```json
{
  "event": "thread_complete",
  "thread_id": "...",
  "summary": "PM2.5 levels are highest in the Bronx..."
}
```

**Fields affected:** `thread_complete.summary` (new)

---

## 7. `thread_waiting` should include `running_summary`

**Problem:** When a thread enters waiting state, the snapshot has
`running_summary` and `error`. SSE `thread_waiting` has `error` and
`message` but not the running summary built from completed steps.

**Proposed fix (backend):**
```json
{
  "event": "thread_waiting",
  "thread_id": "...",
  "error": "Need clarification on date range",
  "running_summary": "So far found that..."
}
```

**Fields affected:** `thread_waiting.running_summary` (new)

---

## 8. `duration_ms` units should be documented/consistent

**Problem:** The field is named `duration_ms` but the UI previously had to
guess whether the value was milliseconds or seconds. Both snapshot and SSE
should use the same unit.

**Proposed fix (backend):** Document that `duration_ms` is always
milliseconds (integer). If the backend computes time in seconds, multiply
by 1000 before sending.

---

## 9. Add a `schema_summary_ready` SSE event

**Problem:** `schema_summary` is only available via the REST snapshot. If the
user opens a session before the profiler finishes, the summary panel stays
empty until page refresh.

**Proposed fix (backend):**
```json
{
  "event": "schema_summary_ready",
  "session_id": "...",
  "schema_summary": "Dataset has 12 columns..."
}
```

The UI would update `session.schema_summary` in the reducer and show the
panel without requiring a refresh.

---

## Summary: SSE fields vs Snapshot fields

| Field | Snapshot | SSE | Gap |
|-------|----------|-----|-----|
| `step.move` | Always present | Missing on `step_complete`, unreliable on `step_start` | Fix #1, #2 |
| `step.instruction` | Always present | Never sent via SSE | Fix #3 |
| `step.result` | Always present | Sent on `step_complete` | OK |
| `event.sql` | Always present | Sometimes in `message`, sometimes in `sql` | Fix #4 |
| `event.tool_result` | Always present | Never sent separately | Fix #4 |
| `event.response` | Always present | Sent as `message` | Fix #4 |
| `event.agent` | Always present | Sometimes missing | Fix #4 |
| `event.duration_ms` | Always present | Sometimes missing | Fix #4 |
| `thread.motivation` | Always present | Not in `thread_start` | Fix #5 |
| `thread.summary` | Always present | Not in `thread_complete` | Fix #6 |
| `thread.running_summary` | Present when waiting | Not in `thread_waiting` | Fix #7 |
| `session.schema_summary` | Present after profiling | No SSE event | Fix #9 |
