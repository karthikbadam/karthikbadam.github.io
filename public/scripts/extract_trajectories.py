#!/usr/bin/env python3
"""
Extract agent trajectories from a JSONL file into a Parquet file for the
Trajectory Atlas demo.

The script handles two distinct trajectory formats:

1. smolagents-style: each record carries a structured ``log_data.messages``
   list with explicit ``tool-call`` / ``tool-response`` roles.
2. raw-messages-style (DeepSWE / Kimi K2): each record carries a flat
   ``messages`` list where tool calls are embedded as inline XML blocks
   (``<function=name>...</function>``) inside assistant ``content``.

Every column path is exposed as a CLI flag, so new trajectory schemas can
be processed without code edits.

Usage examples:

    # smolagents (Qwen)
    python public/scripts/extract_trajectories.py \\
        ~/Downloads/Qwen2.5-32B-Instruct_agent_trajectories_2k_prefix.jsonl \\
        --output public/data/trajectory-atlas/qwen-hotpotqa-math.parquet \\
        --source-tag qwen --format smolagents

    # raw-messages (DeepSWE Kimi-K2)
    python public/scripts/extract_trajectories.py \\
        ~/Downloads/DeepSWE-Agent-Kimi-K2-Trajectories-2.8K.jsonl \\
        --output public/data/trajectory-atlas/deepswe-kimi.parquet \\
        --source-tag deepswe --format raw_messages \\
        --model-default kimi-k2 --outcome-mode terminal-tool
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import pyarrow as pa
import pyarrow.parquet as pq


# ---------------------------------------------------------------------------
# JSONPath-lite resolver
# Supports the subset we need: $.a.b.c and $.a[0].b
# ---------------------------------------------------------------------------

_JSONPATH_TOKEN = re.compile(r"\.([A-Za-z_][\w-]*)|\[(\d+)\]")


def jsonpath_get(obj: Any, path: str | None, default: Any = None) -> Any:
    if not path or path in ("$", ""):
        return obj if path else default
    if not path.startswith("$"):
        path = "$" + path if path.startswith(".") else "$." + path
    cursor = obj
    for m in _JSONPATH_TOKEN.finditer(path):
        key, idx = m.group(1), m.group(2)
        # Auto-decode JSON-encoded string nodes when descending further (some
        # smolagents exports stash log_data as a JSON string rather than a dict).
        if isinstance(cursor, str) and (key is not None or idx is not None):
            try:
                cursor = json.loads(cursor)
            except json.JSONDecodeError:
                return default
        if key is not None:
            if not isinstance(cursor, dict) or key not in cursor:
                return default
            cursor = cursor[key]
        elif idx is not None:
            try:
                cursor = cursor[int(idx)]
            except (KeyError, IndexError, TypeError):
                return default
    return cursor


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_CATEGORY_RULES = [
    # (regex, category) – first match wins; applied to extracted code/command
    (re.compile(r"^\s*final_answer\s*\("), "submit"),
    (re.compile(r"^\s*(submit|finish|done)\b"), "submit"),
    (re.compile(r"\bweb_search\s*\("), "search"),
    (re.compile(r"\bgoogle_search\s*\("), "search"),
    (re.compile(r"\bvisit_webpage\s*\("), "read"),
    (re.compile(r"\b(grep_search|codebase_search|find_file|grep)\b"), "search"),
    (re.compile(r"\bfile_editor\b.*\b(view|open)\b"), "read"),
    (re.compile(r"\bfile_editor\b.*\b(str_replace|create|insert|write)\b"), "edit"),
    (re.compile(r"\b(read_file|open_url|view_image)\s*\("), "read"),
    (re.compile(r"\b(write_file|str_replace|patch|edit)\s*\("), "edit"),
    (re.compile(r"\bexecute_bash\b"), "exec"),
    (re.compile(r"\b(bash|run_tests|pytest)\b"), "exec"),
    (re.compile(r"\b(solve|simplify|symbols|Rational|Fraction|Eq|integrate|limit|factor|factorial|comb|sqrt|sin|cos|tan|log)\s*\("), "exec"),
    (re.compile(r"\b(api_call|sql_query|calculator|requests\.get|httpx)\b"), "tool"),
    (re.compile(r"\b(assert|diff_check|lint)\s*\("), "verify"),
]


FORMAT_PRESETS = {
    "smolagents": {
        "messages_path": "$.log_data.messages",
        "task_path": "$.question",
        "model_path": "$.model_id",
        "dataset_path": "$.dataset_name",
        "score_path": "$.score",
        "gold_path": "$.true_answer",
        "pred_path": "$.generated_answer",
        "cost_path": "$.cost",
        "tool_call_mode": "structured",
        "outcome_mode": "score+match",
    },
    "raw_messages": {
        "messages_path": "$.messages",
        "task_path": None,            # fall back to first user message
        "model_path": None,
        "dataset_path": None,
        "score_path": None,
        "gold_path": None,
        "pred_path": None,
        "cost_path": None,
        "tool_call_mode": "inline_xml",
        "outcome_mode": "terminal-tool",
    },
}


CATEGORY_LABELS = {
    "plan": "Plan",
    "search": "Search",
    "read": "Read",
    "edit": "Edit",
    "exec": "Execute",
    "tool": "API",
    "verify": "Verify",
    "submit": "Submit",
    "error": "Error",
}


INLINE_XML_PATTERN_DEFAULT = re.compile(
    r"<function=([^>\s]+)\s*>(?P<body>.*?)</function>", re.DOTALL
)
INLINE_XML_PARAM_PATTERN = re.compile(
    r"<parameter=([^>\s]+)\s*>(?P<val>.*?)</parameter>", re.DOTALL
)


# ---------------------------------------------------------------------------
# Loose-match for outcome heuristics
# ---------------------------------------------------------------------------

_BOXED_RE = re.compile(r"\\boxed\{([^{}]*)\}")
_WS_RE = re.compile(r"\s+")


def _strip_for_match(s: str) -> str:
    if s is None:
        return ""
    s = str(s)
    m = _BOXED_RE.search(s)
    if m:
        s = m.group(1)
    s = _WS_RE.sub(" ", s).strip().casefold()
    return s


def loose_match(pred: str, gold: str) -> bool:
    p, g = _strip_for_match(pred), _strip_for_match(gold)
    if not p or not g:
        return False
    if p == g or p in g or g in p:
        return True
    # Try numeric equivalence if both look like numbers / fractions
    try:
        from fractions import Fraction

        def _to_frac(v: str):
            v = v.replace(",", "").replace("$", "")
            if "/" in v:
                a, b = v.split("/", 1)
                return Fraction(int(a.strip()), int(b.strip()))
            return Fraction(v)

        return _to_frac(p) == _to_frac(g)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Step extraction
# ---------------------------------------------------------------------------


def _msg_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for c in content:
            if isinstance(c, dict):
                out.append(c.get("text") or c.get("content") or "")
            else:
                out.append(str(c))
        return "\n".join(out)
    return str(content)


def _classify(code: str, rules: list[tuple[re.Pattern, str]]) -> tuple[str, str]:
    """Return (category, tool_name). tool_name is the leading function name."""
    code = code.strip()
    if not code:
        return "plan", ""
    tool_match = re.match(r"\s*([A-Za-z_][\w]*)", code)
    tool = tool_match.group(1) if tool_match else ""
    for pat, cat in rules:
        if pat.search(code):
            return cat, tool
    return "tool", tool


def _est_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _est_duration_ms(tokens: int) -> int:
    return tokens * 50


def extract_steps_smolagents(
    messages: list[dict],
    rules: list[tuple[re.Pattern, str]],
    code_arg_key: str = "arguments",
) -> list[dict]:
    """Pair assistant Thought messages with the following tool-call + tool-response."""
    steps: list[dict] = []
    pending_assistant: dict | None = None
    pending_tool_call: dict | None = None
    step_idx = 0

    def _flush():
        nonlocal pending_assistant, pending_tool_call, step_idx
        if pending_assistant is None and pending_tool_call is None:
            return
        # First step is always plan; subsequent steps classified by tool call code
        code = ""
        tool = ""
        ok = True
        if pending_tool_call is not None:
            tc_text = _msg_text(pending_tool_call.get("content"))
            # Look for tool calls list inline
            try:
                # The text is a Python literal-looking string; search for arguments.
                m = re.search(
                    rf"'name':\s*'([^']+)'\s*,\s*'arguments':\s*'(.*?)(?<!\\)'\s*\}}",
                    tc_text,
                    flags=re.DOTALL,
                )
                if m:
                    tool = m.group(1)
                    code = bytes(m.group(2), "utf-8").decode("unicode_escape", errors="replace")
                else:
                    code = tc_text
            except Exception:
                code = tc_text
        cat, code_tool = _classify(code, rules) if code else ("plan", "")
        tool = tool or code_tool or "thought"
        if step_idx == 0 and not code:
            cat = "plan"
        # Token + duration estimates from concatenated assistant + tool response text
        text_blob = ""
        if pending_assistant is not None:
            text_blob += _msg_text(pending_assistant.get("content"))
        # Note: response is consumed in main loop; we estimate from code length here.
        text_blob += "\n" + code
        toks = _est_tokens(text_blob)
        dur = _est_duration_ms(toks)
        steps.append(
            {
                "idx": step_idx,
                "category": cat,
                "tool": tool,
                "tokens": toks,
                "duration": dur,
                "ok": ok,
            }
        )
        step_idx += 1
        pending_assistant = None
        pending_tool_call = None

    for m in messages:
        role = m.get("role")
        if role == "assistant":
            if pending_assistant is not None:
                _flush()
            pending_assistant = m
        elif role in ("tool-call", "tool_call", "tool"):
            pending_tool_call = m
        elif role in ("tool-response", "tool_response"):
            # Mark step ok=False if response contains error markers
            resp_text = _msg_text(m.get("content"))
            ok = not bool(re.search(r"\b(Error|Traceback|exception)\b", resp_text, re.IGNORECASE))
            _flush()
            if steps:
                steps[-1]["ok"] = steps[-1]["ok"] and ok
                # Add response tokens to the last step
                extra_tokens = _est_tokens(resp_text)
                steps[-1]["tokens"] += extra_tokens
                steps[-1]["duration"] = _est_duration_ms(steps[-1]["tokens"])
        # ignore system / user
    if pending_assistant is not None or pending_tool_call is not None:
        _flush()
    return steps


def extract_steps_inline_xml(
    messages: list[dict],
    rules: list[tuple[re.Pattern, str]],
    xml_pattern: re.Pattern,
) -> list[dict]:
    steps: list[dict] = []
    step_idx = 0
    last_was_assistant = False

    for i, m in enumerate(messages):
        role = m.get("role")
        if role != "assistant":
            # Annotate previous step with error signal if user response indicates error
            if role == "user" and steps:
                resp_text = _msg_text(m.get("content"))
                if re.search(r"(traceback|error:|exit code:\s*[1-9])", resp_text, re.IGNORECASE):
                    steps[-1]["ok"] = False
                # Add response tokens to previous step
                extra = _est_tokens(resp_text)
                steps[-1]["tokens"] += extra
                steps[-1]["duration"] = _est_duration_ms(steps[-1]["tokens"])
            last_was_assistant = False
            continue

        text = _msg_text(m.get("content"))
        # Tool blocks
        funcs = list(xml_pattern.finditer(text))
        if not funcs:
            cat = "plan"
            tool = "thought"
            code = ""
        else:
            # Use the first function block as the dominant tool for this step
            f = funcs[0]
            tool = f.group(1)
            body = f.group("body") or ""
            params = INLINE_XML_PARAM_PATTERN.findall(body)
            param_blob = " ".join(f"{k}={v}" for k, v in params)
            code = f"{tool}({param_blob})"
            cat, _ = _classify(code, rules)
        toks = _est_tokens(text)
        dur = _est_duration_ms(toks)
        steps.append(
            {
                "idx": step_idx,
                "category": cat,
                "tool": tool,
                "tokens": toks,
                "duration": dur,
                "ok": True,
            }
        )
        step_idx += 1
        last_was_assistant = True

    return steps


# ---------------------------------------------------------------------------
# Outcome heuristics
# ---------------------------------------------------------------------------


def outcome_score_match(score: Any, pred: Any, gold: Any, has_submit: bool) -> str:
    if not has_submit:
        return "fail"
    truthy = score in (True, 1, "1", "True", "true", 1.0) or (
        isinstance(score, (int, float)) and float(score) > 0
    )
    if not truthy:
        return "fail" if pred is None else "partial"
    # Score truthy. Check loose match.
    if pred is not None and gold is not None:
        return "success" if loose_match(pred, gold) else "partial"
    return "success"


def outcome_terminal_tool(steps: list[dict], message_cap: int = 80) -> str:
    if not steps:
        return "fail"
    last = steps[-1]
    if last["category"] == "submit":
        return "success"
    if last["category"] == "error" or any(not s["ok"] for s in steps[-3:]):
        return "fail"
    if len(steps) >= message_cap:
        return "fail"
    return "partial"


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


STEP_STRUCT = pa.struct(
    [
        ("idx", pa.int32()),
        ("category", pa.string()),
        ("tool", pa.string()),
        ("tokens", pa.int32()),
        ("duration", pa.int32()),
        ("ok", pa.bool_()),
    ]
)


SCHEMA = pa.schema(
    [
        ("id", pa.string()),
        ("dataset", pa.string()),
        ("model", pa.string()),
        ("task", pa.string()),
        ("outcome", pa.string()),
        ("step_count", pa.int32()),
        ("tokens", pa.int32()),
        ("duration", pa.int32()),
        ("reward", pa.float32()),
        ("cost", pa.float64()),
        ("tools_used", pa.list_(pa.string())),
        ("steps", pa.list_(STEP_STRUCT)),
    ]
)


def _parse_first_user_task(messages: list[dict]) -> str:
    for m in messages:
        if m.get("role") == "user":
            text = _msg_text(m.get("content"))
            issue = re.search(r"<github_issue>(.*?)</github_issue>", text, re.DOTALL)
            if issue:
                return _WS_RE.sub(" ", issue.group(1).strip())[:200]
            return _WS_RE.sub(" ", text)[:200]
    return ""


def detect_format(record: dict) -> str:
    if "log_data" in record and "score" in record:
        return "smolagents"
    if "messages" in record and "log_data" not in record:
        return "raw_messages"
    return "smolagents"


def detect_tool_call_mode(messages: list[dict]) -> str:
    for m in messages:
        if m.get("role") in ("tool-call", "tool_call"):
            return "structured"
    # Look for inline xml in assistant content
    for m in messages:
        if m.get("role") == "assistant":
            text = _msg_text(m.get("content"))
            if INLINE_XML_PATTERN_DEFAULT.search(text):
                return "inline_xml"
    return "structured"


def _short_dataset(name: str | None, source_tag: str) -> str:
    if not name:
        return source_tag
    return name.split("-")[0].lower()[:8] or source_tag


def iter_records(path: Path) -> Iterable[dict]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                print(f"warn: skipping malformed json line: {e}", file=sys.stderr)


def load_category_rules(path: str | None) -> list[tuple[re.Pattern, str]]:
    if not path:
        return list(DEFAULT_CATEGORY_RULES)
    overlay = json.loads(Path(path).read_text())
    rules: list[tuple[re.Pattern, str]] = []
    for pattern, category in overlay.items():
        rules.append((re.compile(pattern), category))
    rules.extend(DEFAULT_CATEGORY_RULES)
    return rules


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", type=Path, help="Path to source JSONL")
    p.add_argument("--output", type=Path, required=True, help="Output .parquet path")
    p.add_argument("--source-tag", default="traj", help="Short tag prefixed to trajectory ids")
    p.add_argument("--format", choices=["auto", "smolagents", "raw_messages"], default="auto")

    p.add_argument("--messages-path")
    p.add_argument("--task-path")
    p.add_argument("--model-path")
    p.add_argument("--model-default", default=None)
    p.add_argument("--dataset-path")
    p.add_argument("--score-path")
    p.add_argument("--gold-path")
    p.add_argument("--pred-path")
    p.add_argument("--cost-path")

    p.add_argument("--tool-call-mode", choices=["structured", "inline_xml", "auto"], default="auto")
    p.add_argument("--inline-xml-pattern", default=None)
    p.add_argument("--code-arg-key", default="arguments")

    p.add_argument("--category-rules", default=None)
    p.add_argument("--outcome-mode", choices=["score+match", "terminal-tool", "custom"], default="score+match")
    p.add_argument("--outcome-rules", default=None)

    p.add_argument("--batch-size", type=int, default=500)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--print-summary", action=argparse.BooleanOptionalAction, default=True)

    args = p.parse_args()

    if not args.input.exists():
        print(f"error: input not found: {args.input}", file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Pre-flight: detect format from first record if --format auto
    first_record = next(iter_records(args.input), None)
    if first_record is None:
        print("error: input has no records", file=sys.stderr)
        return 2

    fmt = args.format if args.format != "auto" else detect_format(first_record)
    preset = FORMAT_PRESETS[fmt]

    # Resolve column paths (CLI flags override preset)
    paths = {
        "messages": args.messages_path or preset["messages_path"],
        "task": args.task_path if args.task_path is not None else preset["task_path"],
        "model": args.model_path if args.model_path is not None else preset["model_path"],
        "dataset": args.dataset_path if args.dataset_path is not None else preset["dataset_path"],
        "score": args.score_path if args.score_path is not None else preset["score_path"],
        "gold": args.gold_path if args.gold_path is not None else preset["gold_path"],
        "pred": args.pred_path if args.pred_path is not None else preset["pred_path"],
        "cost": args.cost_path if args.cost_path is not None else preset["cost_path"],
    }

    tool_call_mode = (
        args.tool_call_mode
        if args.tool_call_mode != "auto"
        else preset["tool_call_mode"]
    )

    # If still auto, sniff from messages of the first record
    if tool_call_mode == "auto":
        msgs0 = jsonpath_get(first_record, paths["messages"], []) or []
        tool_call_mode = detect_tool_call_mode(msgs0)

    outcome_mode = (
        args.outcome_mode
        if args.outcome_mode != "score+match" or fmt == "smolagents"
        else preset["outcome_mode"]
    )

    rules = load_category_rules(args.category_rules)
    inline_pattern = (
        re.compile(args.inline_xml_pattern, re.DOTALL)
        if args.inline_xml_pattern
        else INLINE_XML_PATTERN_DEFAULT
    )

    print(
        f"[extract_trajectories] format={fmt} tool_call_mode={tool_call_mode} "
        f"outcome_mode={outcome_mode} output={args.output}",
        file=sys.stderr,
    )

    # Streaming write
    writer = pq.ParquetWriter(args.output, SCHEMA)

    batch: list[dict] = []
    n = 0
    outcome_hist = Counter()
    category_hist = Counter()
    step_hist = Counter()

    def flush_batch():
        nonlocal batch
        if not batch:
            return
        cols = {name: [] for name in SCHEMA.names}
        for r in batch:
            for k in cols:
                cols[k].append(r[k])
        table = pa.Table.from_pydict(cols, schema=SCHEMA)
        writer.write_table(table)
        batch = []

    for idx, record in enumerate(iter_records(args.input)):
        if args.limit is not None and idx >= args.limit:
            break

        messages = jsonpath_get(record, paths["messages"], []) or []
        if not isinstance(messages, list):
            continue

        # Steps
        if tool_call_mode == "structured":
            steps = extract_steps_smolagents(messages, rules, args.code_arg_key)
        else:
            steps = extract_steps_inline_xml(messages, rules, inline_pattern)

        # First step → plan if there's no explicit reasoning category yet
        if steps:
            if steps[0]["category"] not in ("plan",):
                # If the first assistant turn had no tool call we kept it as "plan";
                # otherwise force the entry step semantics for icicle: keep it.
                pass
            tools_used = sorted({s["tool"] for s in steps if s["tool"]})
        else:
            tools_used = []

        # Trajectory metadata
        task_text = jsonpath_get(record, paths["task"]) if paths["task"] else None
        if not task_text:
            task_text = _parse_first_user_task(messages)
        task_text = (str(task_text) if task_text else "")[:200]

        model = (
            jsonpath_get(record, paths["model"]) if paths["model"] else None
        ) or args.model_default or "unknown"

        dataset = (
            jsonpath_get(record, paths["dataset"]) if paths["dataset"] else None
        ) or args.source_tag

        score = jsonpath_get(record, paths["score"]) if paths["score"] else None
        gold = jsonpath_get(record, paths["gold"]) if paths["gold"] else None
        pred = jsonpath_get(record, paths["pred"]) if paths["pred"] else None
        cost = jsonpath_get(record, paths["cost"]) if paths["cost"] else None

        has_submit = any(s["category"] == "submit" for s in steps)

        if outcome_mode == "score+match":
            outcome = outcome_score_match(score, pred, gold, has_submit)
        elif outcome_mode == "terminal-tool":
            outcome = outcome_terminal_tool(steps)
        else:
            outcome = outcome_score_match(score, pred, gold, has_submit)

        reward = {"success": 1.0, "partial": 0.5, "fail": 0.0}[outcome]
        tokens_total = sum(s["tokens"] for s in steps)
        duration_total = sum(s["duration"] for s in steps)

        ds_short = _short_dataset(str(dataset) if dataset else None, args.source_tag)
        traj_id = f"{ds_short}-{idx:05d}"

        batch.append(
            {
                "id": traj_id,
                "dataset": str(dataset) if dataset is not None else args.source_tag,
                "model": str(model),
                "task": task_text,
                "outcome": outcome,
                "step_count": len(steps),
                "tokens": tokens_total,
                "duration": duration_total,
                "reward": float(reward),
                "cost": float(cost) if cost is not None else 0.0,
                "tools_used": tools_used,
                "steps": steps,
            }
        )

        outcome_hist[outcome] += 1
        for s in steps:
            category_hist[s["category"]] += 1
        step_hist[len(steps)] += 1
        n += 1

        if len(batch) >= args.batch_size:
            flush_batch()

    flush_batch()
    writer.close()

    if args.print_summary:
        print(f"\n[extract_trajectories] wrote {n:,} trajectories to {args.output}", file=sys.stderr)
        print(f"  format         = {fmt}", file=sys.stderr)
        print(f"  tool_call_mode = {tool_call_mode}", file=sys.stderr)
        print(f"  outcome_mode   = {outcome_mode}", file=sys.stderr)
        print(f"  outcomes       = {dict(outcome_hist)}", file=sys.stderr)
        print(f"  categories     = {dict(category_hist.most_common())}", file=sys.stderr)
        print(
            f"  step counts    = min={min(step_hist) if step_hist else 0} "
            f"max={max(step_hist) if step_hist else 0} "
            f"avg={sum(k*v for k,v in step_hist.items())/max(1,n):.2f}",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
