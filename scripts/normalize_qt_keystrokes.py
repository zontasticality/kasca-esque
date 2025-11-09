#!/usr/bin/env python3
"""
Convert an old_qt_*.json keystroke file into the normalized schema used by
recording_*.json and emit the result as the original qt_* filename so that it
continues to match the .webm asset.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable, List, Set

SHIFT_KEYS = {"Shift", "ShiftLeft", "ShiftRight"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize keystroke schema and key casing for qt recordings."
    )
    parser.add_argument(
        "input_file",
        type=Path,
        help="Path to an old_qt_*.json file.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without writing any files.",
    )
    return parser.parse_args()


def read_keystrokes(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    keystrokes = data.get("keystrokes")
    if not isinstance(keystrokes, list):
        raise ValueError(f"{path} missing keystrokes array")
    return data


def normalize_keystrokes(keystrokes: Iterable[dict]) -> List[dict]:
    normalized: List[dict] = []
    active_shift: Set[str] = set()

    for raw in keystrokes:
        timestamp = raw.get("timestamp", raw.get("time"))
        event_type = raw.get("event_type", raw.get("type"))
        key = raw.get("key")
        if timestamp is None or event_type is None or key is None:
            raise ValueError(f"Keystroke missing required fields: {raw}")

        should_lower = (
            len(key) == 1 and key.isalpha() and not active_shift
        )
        normalized_key = key.lower() if should_lower else key

        normalized.append(
            {
                "timestamp": timestamp,
                "key": normalized_key,
                "event_type": event_type,
            }
        )

        if key in SHIFT_KEYS:
            if event_type == "keydown":
                active_shift.add(key)
            elif event_type == "keyup":
                active_shift.discard(key)

    return normalized


def main() -> None:
    args = parse_args()
    input_path: Path = args.input_file
    if not input_path.name.startswith("old_qt_"):
        raise SystemExit("Expected an old_qt_*.json input file")
    if not input_path.exists():
        raise SystemExit(f"Input file {input_path} does not exist")

    output_path = input_path.with_name(input_path.name.replace("old_qt_", "qt_", 1))

    data = read_keystrokes(input_path)
    data["keystrokes"] = normalize_keystrokes(data["keystrokes"])

    if args.dry_run:
        print(f"[dry-run] Would write normalized keystrokes to {output_path}")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")
    tmp_path.replace(output_path)
    print(f"Wrote normalized keystrokes to {output_path}")


if __name__ == "__main__":
    main()
