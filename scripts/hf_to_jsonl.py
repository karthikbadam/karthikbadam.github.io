#!/usr/bin/env python3
"""Stream N rows from a HuggingFace dataset config to JSONL for
extract_trajectories.py. Usage:

    python scripts/hf_to_jsonl.py <repo> --config <c> --split train \
        --n 2000 --out /tmp/<name>.jsonl
"""
import argparse
import json
import sys
from itertools import islice

from datasets import load_dataset


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("repo")
    p.add_argument("--config", default=None)
    p.add_argument("--split", default="train")
    p.add_argument("--n", type=int, default=2000)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    ds = load_dataset(
        args.repo, args.config, split=args.split, streaming=True
    )
    written = 0
    with open(args.out, "w", encoding="utf-8") as f:
        for row in islice(ds, args.n):
            f.write(json.dumps(row, default=str) + "\n")
            written += 1
            if written % 500 == 0:
                print(f"  {written}", file=sys.stderr)
    print(f"wrote {written} rows to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
