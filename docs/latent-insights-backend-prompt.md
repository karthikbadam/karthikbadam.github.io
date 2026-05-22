# Latent Insights service — SSE/JSON contract = render-ready `FeedEntry`

## Why this work exists

The companion frontend (`karthikbadam.github.io`, demo at
`/demos/latent-insights/`) is being refactored to do near-zero data
transformation. The new contract is simple: **every SSE event and every
event stored in the session snapshot is a complete, render-ready
`FeedEntry`**. The frontend appends; it does not reshape, parse, or
sort.

This change also fixes two production bugs whose root cause is that the
frontend currently has to reconstruct order/attachment from low-level
deltas.

## Bugs to fix on the way

### 1. Coordinator `step_start` emitted AFTER its `llm_call`

In `latent_insights/orchestration/runner.py:_on_coordinator_done`
(around lines 264–282), the coordinator's `llm_call` is emitted before
the `step_start` for that same step. The frontend reducer attaches
events to the "last started step", so this event misses its parent.

**Fix**: emit `recorder.step_start(...)` **before** the
`recorder.llm_call(...)` for the coordinator's planning step. Same data,
just swap the order.

### 2. `message_injected` race lets worker events land on the wrong step

When a human message is injected on a RUNNING thread
(`POST /api/threads/{id}/messages`, `POST /api/sessions/{id}/messages`
in `latent_insights/api/routes.py:273–405`), today's code pushes the
message to a pending queue and the runner commits a HUMAN_INPUT step at
its **next callback boundary**. In the gap, worker `tool_call` /
`llm_call` events for the *previous* step keep landing — and the
frontend's "last step" heuristic misattributes them to the not-yet-
committed HUMAN_INPUT slot.

**Fix**: commit the HUMAN_INPUT step **inline** in the request handler
via `recorder.human_input_step(content, target=…)` *before* pushing to
pending. The `_drain_pending_as_steps` path becomes a no-op for
already-committed messages (filter on a marker, or just stop pushing
when we've committed inline). For RUNNING threads, the runner's next
boundary still pivots cleanly; for WAITING/COMPLETE threads, `resume()`
proceeds with no leftover pending work.

Once HUMAN_INPUT is committed inline, drop the standalone
`message_injected` SSE event entirely (or keep it as an internal-only
marker not surfaced to clients). The `human_input_step` recorder call
already emits `step_start` + `step_complete` for the row.

---

## New module: `latent_insights/api/feed.py`

Defines the single render-ready wire/storage type and the mapper from
the existing `SessionResponse` hierarchy.

```python
from pydantic import BaseModel

class FeedEntry(BaseModel):
    id: str                # "ev:{thread_id}:{step_number}:{event_index}"
                           # or "step:{thread_id}:{step_number}"
                           # or "thread:{thread_id}:start" / ":complete" / ":waiting"
                           # or "schema:{session_id}"
    feed_index: int        # monotonic per session, assigned at emit time

    event_type: str        # "thread_start" | "step_start" | "llm_call" |
                           # "tool_call" | "step_complete" | "human_message" |
                           # "thread_complete" | "thread_waiting" |
                           # "schema_summary_ready"

    thread_id: str         # "" for session-level rows (schema_summary_ready)
    timestamp: float

    message: str           # short label for the row header
    full_message: str | None = None    # long body text (step result, LLM response, etc.)

    # step / event identity
    step_number: int | None = None
    move: str | None = None
    agent: str | None = None
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    duration_ms: int | None = None

    # tool_call payload
    sql: str | None = None
    tool_result: str | None = None

    # llm_call payload — pre-parsed for the frontend
    response_text: str | None = None
    response_tables: dict[str, list] | None = None

    # human_message payload
    content: str | None = None
    target: str | None = None          # "thread" | "session" | "new_thread"

    # thread_start / thread_complete / thread_waiting
    seed_question: str | None = None
    motivation: str | None = None
    thread_status: str | None = None
    reason: str | None = None          # WaitReason
    running_summary: str | None = None

    # schema_summary_ready
    schema_summary_markdown: str | None = None

    # step_start coordinator extras
    instruction: str | None = None
    assessment: str | None = None
    rationale: str | None = None
    status: str | None = None
```

### Mapper

```python
def session_to_feed(session: SessionResponse) -> list[FeedEntry]:
    """Flatten a SessionResponse into ordered render-ready feed entries."""
```

Responsibilities (port the frontend's current `buildFeedFromSession` —
see `src/pages/Demos/LatentInsights/utils.ts:191` in the frontend repo
for the existing logic, which is being deleted as part of this refactor):

- Emit `schema_summary_ready` once at the top if `session.schema_summary` is set.
- For each thread (in `session.threads` order):
  - Synthesize a `thread_start` row from thread metadata.
  - For each step (in `thread.steps` order):
    - If `step.move == "HUMAN_INPUT"` → emit a single `human_message`
      row (no step_start/complete). `content` = step.result,
      `target` = step.instruction.
    - Else if `step.move == "WAITING_FOR_HUMAN"` → skip; the trailing
      `thread_waiting` row covers it.
    - Else: emit `step_start`, then each event in `step.events` (in
      list order, which IS emit order — do not sort by timestamp),
      then `step_complete`.
  - If thread.status == "complete" → emit `thread_complete`.
  - If thread.status == "waiting" → emit `thread_waiting` with reason
    derived from thread.error.
- Assign `feed_index = 0, 1, 2, …` to entries in emission order.

### LLM response parsing (move from frontend)

For `llm_call` entries, attempt to parse `event.response` as JSON.
Today the frontend does this in `tryParseJsonResponse`
(`src/pages/Demos/LatentInsights/utils.ts:38`). Port it:

```python
def _parse_llm_response(raw: str) -> tuple[str | None, dict[str, list] | None]:
    """Returns (response_text, response_tables)."""
    if not raw:
        return None, None
    # Try to extract a JSON object from the raw string
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Try to find a JSON object substring (LLMs sometimes prepend text)
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            return raw, None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return raw, None
    if not isinstance(parsed, dict):
        return raw, None
    # Pick text from common keys
    text = parsed.get("text") or parsed.get("answer") or parsed.get("summary") \
        or parsed.get("response") or parsed.get("message") or None
    tables = parsed.get("tables") if isinstance(parsed.get("tables"), dict) else None
    return text, tables
```

### Schema summary → markdown (move from frontend)

Port `formatSchemaSummary` + `formatColumnProfiles` from
`src/pages/Demos/LatentInsights/utils.ts:71–125`. The raw input has
sections like:

```
## Dataset summary
- **Table:** star_classification
- **Rows:** 100000
…
## Column profiles
obj_ID | DOUBLE | 100000/100000 | min=…, max=…, mean=…
…
```

The output should keep `## Dataset summary` as-is and rewrite the
`## Column profiles` block as a markdown table with columns:
`Column | Type | Filled | Stats`. Use `formatSchemaSummary` as the
spec — the goal is byte-equivalence with what the frontend used to
render.

---

## New endpoint: `GET /api/sessions/{id}/feed`

In `latent_insights/api/routes.py`. Returns `list[FeedEntry]` in
insertion order, computed by `session_to_feed(get_session(id))`.

Optional but nice: support `?since=<feed_index>` to return entries
after a given index, for SSE reconnect resume.

Keep `GET /api/sessions/{id}` returning `SessionResponse` as-is — it's
still useful for debugging and the saved-session JSON files.

---

## SSE: emit `FeedEntry` as the event payload

In `latent_insights/core/recorder.py`, every method
(`thread_start`, `step_start`, `step_complete`, `llm_call`, `tool_call`,
`human_input_step`, `thread_waiting`, `thread_complete`,
`thread_resumed`, `schema_summary_ready`) currently builds a
`StreamEvent(event_type=…, message=…, data={…})`. Replace the
`data` dict with a complete `FeedEntry` (use a shared
`_make_entry()` helper that fills in `feed_index` from a per-session
counter held on the `Queue` or `Recorder`).

The SSE wire format becomes:

```
event: step_complete
data: {"id":"step:abc:5","feed_index":42,"event_type":"step_complete","thread_id":"abc","step_number":5,"move":"FORAGE","message":"Filtered to top 10 …","full_message":"Filtered to top 10 results by signal strength.\n\nFound that …","duration_ms":3210,"timestamp":1736000000.123}
```

Critically: **`step_complete` must include `full_message`** containing
the step's `result` text. Today the SSE step_complete only ships
`step_number` + `duration_ms` — the frontend needs the full result text
to render the row body. Same for `llm_call` (full `response`, plus the
pre-parsed `response_text` and `response_tables`) and `tool_call`
(full `tool_result` and `sql`).

Drop `message_injected` from the public stream. The
`human_input_step` recorder call already emits a `human_message`
FeedEntry; that's the canonical event.

---

## CLI: `scripts/export_feed.py`

Small Python CLI to convert saved `SessionResponse` JSONs to flat feed
JSONs. The frontend repo currently has three saved sessions at
`public/data/latent-insights/{746fa2380425,846f0bbfefc0,a59dfbbd0fee}.json`.

```
uv run python scripts/export_feed.py path/to/{id}.json > {id}.feed.json
```

The script just calls `session_to_feed()` on the deserialized JSON and
prints the result. Three `.feed.json` files will be checked into the
frontend repo so the saved-session demo works without the backend.

---

## Verification

1. `uv run pytest` — recorder tests will need updates for the new emit
   shape. Add new tests for `feed.py` (mapper + parser).

2. Smoke-test SSE wire format:

   ```
   uv run uvicorn latent_insights.app:app --reload
   # in another terminal:
   curl -N localhost:8000/api/sessions/$ID/events
   ```

   Each `data:` line should parse as a `FeedEntry`. Confirm
   `step_complete` carries `full_message` (non-null, the step's result
   text).

3. Mid-run human injection:

   ```
   curl -X POST localhost:8000/api/threads/$TID/messages \
     -H content-type:application/json \
     -d '{"content":"focus on subtype X"}'
   ```

   Confirm a `human_message` FeedEntry appears in the SSE stream
   **immediately** (during the request handler), and that any
   subsequent worker `tool_call` events carry the post-injection
   `step_number`, not the pre-injection one.

4. Coordinator ordering: confirm that for every coordinator step, the
   SSE order is `step_start` → `llm_call` → `step_complete` (not
   `llm_call` → `step_start` → `step_complete`).

5. Snapshot ↔ stream equivalence:

   ```
   curl localhost:8000/api/sessions/$ID/feed > /tmp/feed.json
   # vs. accumulated SSE entries
   ```

   The two should be identical (modulo `timestamp` precision).

6. Export saved sessions: run `scripts/export_feed.py` against the
   three existing saved sessions (the user will provide them or point
   to data/sessions/). Verify the output's structure visually for one
   session, then hand the three `.feed.json` files to the frontend
   session for inclusion in `public/data/latent-insights/`.

---

## Files you'll touch

- New: `latent_insights/api/feed.py` (~150 lines: FeedEntry schema +
  mapper + LLM response parser + schema markdown formatter).
- New: `scripts/export_feed.py` (~40 lines).
- `latent_insights/api/routes.py`: add `/sessions/{id}/feed` route;
  inline `recorder.human_input_step()` calls in `POST /messages`
  handlers; drop `message_injected` emissions.
- `latent_insights/core/recorder.py`: every method builds a
  `FeedEntry` (via shared `_make_entry()`); attach `feed_index` from a
  per-session counter; ensure `step_complete`/`llm_call`/`tool_call`
  emit `full_message` and other long-form fields.
- `latent_insights/orchestration/runner.py`: swap `step_start` ↔
  `llm_call` order in `_on_coordinator_done`. Also audit any other
  emit sites that emit `llm_call` before `step_start` for the same
  step.
- `latent_insights/models.py` (if needed): per-session feed_index
  counter on `Session` or `Queue` (whichever owns session-scoped
  state).
- `latent_insights/api/sse.py` (or wherever SSE serialization lives):
  the SSE `data:` line should be the FeedEntry's `model_dump_json()`.

Hand back: the three `.feed.json` files generated from the saved
sessions, plus confirmation that the SSE wire format matches the
contract above. The frontend session is refactoring against this exact
shape and will start failing fast if anything diverges.
