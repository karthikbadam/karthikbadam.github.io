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

Each STEP in the output corresponds to exactly one message in the source —
modelling the actual conversation trajectory rather than collapsing pairs:

  user (task)        first user message    → step name "task"
  user (observation) subsequent user msgs  → step name "observation"
  assistant          pure reasoning        → step name "thought"
  assistant w/ tool  tool-call message     → step name = tool function name
                                              (e.g. "web_search", "final_answer",
                                              "execute_bash", "file_editor")

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
import ast
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

# Maps an extracted function name (or pseudo-name like "task") to a category
# colour bucket. Used by the demo to colour sankey ribbons + step dots.
DEFAULT_CATEGORY_RULES = [
    (re.compile(r"^(task|user_task)$"), "task"),
    (re.compile(r"^(observation|user_observation|tool_response)$"), "observation"),
    (re.compile(r"^thought$"), "thought"),
    (re.compile(r"^final_answer$"), "submit"),
    (re.compile(r"^(submit|finish|done)$"), "submit"),
    (re.compile(r"^(web_search|google_search|bing_search|duckduckgo_search)$"), "search"),
    (re.compile(r"^(grep_search|codebase_search|find_file|grep|search)$"), "search"),
    (re.compile(r"^(visit_webpage|read_file|open_url|view_image)$"), "read"),
    (re.compile(r"^(file_editor)$"), "edit"),  # generic; subcommand decides view vs edit
    (re.compile(r"^(write_file|str_replace|patch|edit|create_file|append_file)$"), "edit"),
    (re.compile(r"^(execute_bash|bash|python|run_tests|pytest|run_code|shell)$"), "exec"),
    (re.compile(r"^(solve|simplify|symbols|Rational|Fraction|Eq|integrate|limit|factor|factorial|comb|sqrt|sin|cos|tan|log|exp|sympify)$"), "exec"),
    (re.compile(r"^(api_call|sql_query|calculator|requests|httpx|fetch)$"), "tool"),
    (re.compile(r"^(assert|diff_check|lint|verify)$"), "verify"),
]


def category_for(name: str) -> str:
    for pat, cat in DEFAULT_CATEGORY_RULES:
        if pat.search(name):
            return cat
    return "tool"


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
        "task_path": None,
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
# Tool-name extraction
# ---------------------------------------------------------------------------

# Builtins / control-flow we shouldn't surface as the "tool" of a step.
_BUILTIN_NAMES = {
    "print", "len", "range", "str", "int", "float", "list", "dict", "set",
    "tuple", "bool", "sum", "min", "max", "abs", "round", "type", "id",
    "isinstance", "enumerate", "zip", "map", "filter", "sorted", "reversed",
    "any", "all", "open", "input", "format", "iter", "next", "hasattr",
    "getattr", "setattr", "vars", "dir", "globals", "locals", "repr",
    "hash", "ord", "chr", "bin", "hex", "oct",
    "if", "for", "while", "with", "try", "except", "raise", "import",
    "from", "as", "return", "lambda",
    "slice", "complex", "frozenset", "bytes", "bytearray", "object",
    "Calling",
}

# Function-call regex used as a fallback when AST parsing fails.
_CALL_RE = re.compile(r"\b([a-zA-Z_][\w]*)\s*\(")


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


def _first_tool_call_in_code(code: str) -> str:
    """Find the first non-builtin function call in a Python code blob."""
    code = (code or "").strip()
    if not code:
        return ""
    # Prefer AST — robust to nested calls.
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                name = ""
                if isinstance(func, ast.Name):
                    name = func.id
                elif isinstance(func, ast.Attribute):
                    name = func.attr
                if name and name not in _BUILTIN_NAMES:
                    return name
    except SyntaxError:
        pass
    # Regex fallback — scan in textual order.
    for m in _CALL_RE.finditer(code):
        name = m.group(1)
        if name not in _BUILTIN_NAMES:
            return name
    return ""


def _parse_smolagents_tool_call(content: Any) -> tuple[str, str]:
    """Return (wrapper_function_name, code_string)."""
    text = _msg_text(content)
    if not text:
        return "", ""
    # Strip the "Calling tools:\n" prefix some exporters include.
    body = re.sub(r"^\s*Calling tools:\s*", "", text)
    # The remainder is a Python literal list of dicts.
    try:
        parsed = ast.literal_eval(body)
    except (ValueError, SyntaxError):
        return "", text
    if not isinstance(parsed, list) or not parsed:
        return "", text
    first = parsed[0]
    if not isinstance(first, dict):
        return "", text
    fn = first.get("function") or {}
    wrapper = str(fn.get("name", ""))
    code = str(fn.get("arguments", "") or "")
    return wrapper, code


# ---------------------------------------------------------------------------
# Per-message step extraction
# ---------------------------------------------------------------------------


def extract_steps_smolagents(messages: list[dict]) -> list[dict]:
    steps: list[dict] = []
    seen_user = False
    pending_tool_call: dict | None = None

    for m in messages:
        role = m.get("role")
        content = m.get("content")
        text = _msg_text(content)

        if role == "system":
            continue

        if role == "user":
            kind = "task" if not seen_user else "observation"
            seen_user = True
            steps.append(_make_step(len(steps), name=kind, role="user", text=text))
            continue

        if role == "assistant":
            steps.append(_make_step(len(steps), name="thought", role="assistant", text=text))
            continue

        if role in ("tool-call", "tool_call"):
            pending_tool_call = m
            wrapper, code = _parse_smolagents_tool_call(content)
            tool_name = _first_tool_call_in_code(code) or wrapper or "tool_call"
            steps.append(
                _make_step(
                    len(steps),
                    name=_canonicalize_tool(tool_name),
                    role="tool",
                    text=code or text,
                ),
            )
            continue

        if role in ("tool-response", "tool_response"):
            ok = not bool(re.search(r"\b(Error|Traceback|Exception)\b", text, re.IGNORECASE))
            # Treat tool responses as observations for the trajectory shape.
            step = _make_step(len(steps), name="observation", role="user", text=text, ok=ok)
            steps.append(step)
            pending_tool_call = None
            continue

    return steps


def extract_steps_inline_xml(messages: list[dict], xml_pattern: re.Pattern) -> list[dict]:
    steps: list[dict] = []
    seen_user = False

    for m in messages:
        role = m.get("role")
        text = _msg_text(m.get("content"))

        if role == "system":
            continue

        if role == "user":
            kind = "task" if not seen_user else "observation"
            seen_user = True
            ok = not bool(re.search(r"(traceback|error:|exit code:\s*[1-9])", text, re.IGNORECASE))
            steps.append(_make_step(len(steps), name=kind, role="user", text=text, ok=ok))
            continue

        if role == "assistant":
            funcs = list(xml_pattern.finditer(text))
            if not funcs:
                steps.append(_make_step(len(steps), name="thought", role="assistant", text=text))
                continue
            # Each <function=NAME>...</function> block becomes its own tool step.
            # Most assistant turns have one block; some multi-step exports include
            # several, and we want to surface each.
            for f in funcs:
                tool = _canonicalize_tool(f.group(1))
                body = f.group("body") or ""
                params = INLINE_XML_PARAM_PATTERN.findall(body)
                blob = " ".join(f"{k}={v[:60]}" for k, v in params)
                # Disambiguate file_editor by sub-command if present.
                if tool == "file_editor":
                    cmd_match = re.search(r"command\s*=\s*([A-Za-z_]+)", blob)
                    if cmd_match:
                        sub = cmd_match.group(1)
                        if sub in ("view", "open"):
                            tool = "file_editor.view"
                        elif sub in ("str_replace", "create", "insert", "write"):
                            tool = f"file_editor.{sub}"
                steps.append(_make_step(len(steps), name=tool, role="tool", text=blob))
            continue

        # Other roles ignored.

    return steps


# Map equivalent tool/role names to a canonical form so the same concept
# doesn't appear under multiple labels.
_TOOL_ALIASES = {
    "think": "thought",
    "thinking": "thought",
    "thoughts": "thought",
    "reasoning": "thought",
    "reflection": "thought",
}


def _canonicalize_tool(name: str) -> str:
    return _TOOL_ALIASES.get(name, name)


def _make_step(idx: int, name: str, role: str, text: str, ok: bool = True) -> dict:
    cat = category_for(name)
    return {
        "idx": idx,
        "name": name,
        "category": cat,
        "tool": name,                # alias kept for backwards-compat readers
        "role": role,
        "tokens": max(1, len(text or "") // 4),
        "duration": 0,               # no per-message timing in source data
        "ok": ok,
    }


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
    if pred is not None and gold is not None:
        return "success" if loose_match(pred, gold) else "partial"
    return "success"


def outcome_terminal_tool(steps: list[dict], message_cap: int = 100) -> str:
    if not steps:
        return "fail"
    # Look at the last 3 steps for a submit-category call. With per-message
    # extraction the trailing step is often an `observation` after `finish`.
    tail = steps[-3:]
    if any(s["category"] == "submit" for s in tail):
        # Any failure signal in the last few steps demotes to partial.
        if any(not s["ok"] for s in tail):
            return "partial"
        return "success"
    if any(s["category"] == "error" for s in tail) or any(not s["ok"] for s in tail):
        return "fail"
    if len(steps) >= message_cap:
        return "fail"
    return "partial"


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------


STEP_STRUCT = pa.struct(
    [
        ("idx", pa.int32()),
        ("name", pa.string()),
        ("category", pa.string()),
        ("tool", pa.string()),
        ("role", pa.string()),
        ("tokens", pa.int32()),
        ("duration", pa.int32()),
        ("ok", pa.bool_()),
    ]
)


# Number of pre-computed sequential tool-step columns. The sankey's depth
# slider can request any 1..MAX_TOOL_STEPS of these.
MAX_TOOL_STEPS = 8


def _tool_step_fields() -> list[tuple[str, pa.DataType]]:
    return [(f"step_{i + 1}", pa.string()) for i in range(MAX_TOOL_STEPS)]


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
        ("step_tools", pa.list_(pa.string())),
        # Comma-joined mirror of step_tools — primitive string is easier
        # for downstream tools (e.g. AnyTable's DuckDBStore) to round-trip
        # than Arrow List<Utf8>.
        ("step_tools_str", pa.string()),
        # Sequential tool-step columns: step_1 = first tool call (excluding
        # meta + submit terminators), step_2 = second, etc. Trajectories
        # shorter than k tool calls have '(none)' at positions ≥ k. The
        # sankey's depth slider picks how many of these to render.
        *_tool_step_fields(),
        ("steps", pa.list_(STEP_STRUCT)),
    ]
)


# ---------------------------------------------------------------------------
# IO helpers
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", type=Path)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--source-tag", default="traj")
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

    p.add_argument("--outcome-mode", choices=["score+match", "terminal-tool", "auto"], default="auto")

    p.add_argument("--flat-csv", type=Path, default=None)
    p.add_argument("--flat-csv-where", default=None)
    p.add_argument("--batch-size", type=int, default=500)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--print-summary", action=argparse.BooleanOptionalAction, default=True)

    args = p.parse_args()

    if not args.input.exists():
        print(f"error: input not found: {args.input}", file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)

    first_record = next(iter_records(args.input), None)
    if first_record is None:
        print("error: input has no records", file=sys.stderr)
        return 2

    fmt = args.format if args.format != "auto" else detect_format(first_record)
    preset = FORMAT_PRESETS[fmt]

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
        args.tool_call_mode if args.tool_call_mode != "auto" else preset["tool_call_mode"]
    )
    outcome_mode = args.outcome_mode if args.outcome_mode != "auto" else preset["outcome_mode"]

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

    writer = pq.ParquetWriter(args.output, SCHEMA)

    batch: list[dict] = []
    n = 0
    outcome_hist = Counter()
    name_hist = Counter()
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

        if tool_call_mode == "structured":
            steps = extract_steps_smolagents(messages)
        else:
            steps = extract_steps_inline_xml(messages, inline_pattern)

        tools_used = sorted({s["name"] for s in steps if s["name"]})
        step_tools = [s["name"] for s in steps]

        # Sequential tool-step columns — the i-th tool call in this
        # trajectory (excluding meta + submit terminators). Pads with '(none)'
        # when the trajectory has fewer than MAX_TOOL_STEPS tool calls. The
        # sankey's depth slider chooses how many of these columns to render.
        _META_OR_SUBMIT = {
            "task", "thought", "observation",
            "final_answer", "finish", "submit", "done",
        }
        action_names = [s["name"] for s in steps if s["name"] not in _META_OR_SUBMIT]
        tool_step_values = [
            action_names[i] if i < len(action_names) else "(none)"
            for i in range(MAX_TOOL_STEPS)
        ]

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
        else:
            outcome = outcome_terminal_tool(steps)

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
                "step_tools": step_tools,
                "step_tools_str": ",".join(step_tools),
                **{f"step_{i + 1}": tool_step_values[i] for i in range(MAX_TOOL_STEPS)},
                "steps": steps,
            }
        )

        outcome_hist[outcome] += 1
        for s in steps:
            name_hist[s["name"]] += 1
        step_hist[len(steps)] += 1
        n += 1

        if len(batch) >= args.batch_size:
            flush_batch()

    flush_batch()
    writer.close()

    # Flat (id, outcome, step_1..step_K) projection consumed by the Sankeykey
    # demo as CSV, which duckdb-wasm reads without the parquet extension.
    if args.flat_csv:
        import duckdb

        cols = ", ".join(f"step_{i}" for i in range(1, MAX_TOOL_STEPS + 1))
        where = f" WHERE {args.flat_csv_where}" if args.flat_csv_where else ""
        duckdb.connect().execute(
            f"COPY (SELECT id, outcome, {cols} FROM read_parquet('{args.output}'){where}) "
            f"TO '{args.flat_csv}' (HEADER, DELIMITER ',')"
        )
        if args.print_summary:
            print(f"[extract_trajectories] wrote flat csv to {args.flat_csv}", file=sys.stderr)

    if args.print_summary:
        print(f"\n[extract_trajectories] wrote {n:,} trajectories to {args.output}", file=sys.stderr)
        print(f"  format         = {fmt}", file=sys.stderr)
        print(f"  outcomes       = {dict(outcome_hist)}", file=sys.stderr)
        print(f"  top step names = {dict(name_hist.most_common(15))}", file=sys.stderr)
        if step_hist:
            print(
                f"  step counts    = min={min(step_hist)} max={max(step_hist)} "
                f"avg={sum(k*v for k,v in step_hist.items())/max(1,n):.2f}",
                file=sys.stderr,
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
