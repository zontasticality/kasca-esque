#!/usr/bin/env python3
"""
Quick utility to summarize kasca recordings: total duration and keystroke counts.

Usage:
    python scripts/dataset_stats.py [--recordings-dir recordings]
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Dict, List


def ffprobe_duration(path: Path) -> float:
    """Return media duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    try:
        out = subprocess.check_output(cmd, text=True)
        return float(out.strip())
    except Exception as err:  # pragma: no cover - diagnostic path
        print(f"[warn] failed to read duration for {path.name}: {err}")
        return 0.0


def summarize(recordings_dir: Path) -> Dict[str, float | int | List[str]]:
    json_paths = sorted(recordings_dir.glob("*.json"))
    webm_paths = sorted(recordings_dir.glob("*.webm"))

    total_duration = 0.0
    total_keystrokes = 0
    paired_records = 0
    missing_audio = []
    missing_json = []

    for json_path in json_paths:
        webm_path = json_path.with_suffix(".webm")
        if not webm_path.exists():
            missing_audio.append(json_path.name)
            continue
        paired_records += 1
        with open(json_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        keystrokes = len(payload.get("keystrokes", []))
        total_keystrokes += keystrokes
        total_duration += ffprobe_duration(webm_path)

    for webm_path in webm_paths:
        if not webm_path.with_suffix(".json").exists():
            missing_json.append(webm_path.name)

    avg_keys = total_keystrokes / paired_records if paired_records else 0.0
    return {
        "recordings_dir": str(recordings_dir.resolve()),
        "paired_records": paired_records,
        "total_duration_sec": total_duration,
        "total_duration_hours": total_duration / 3600,
        "total_keystrokes": total_keystrokes,
        "avg_keystrokes_per_record": avg_keys,
        "missing_audio": missing_audio,
        "missing_json": missing_json,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize kasca recording stats.")
    parser.add_argument(
        "--recordings-dir",
        type=Path,
        default=Path("recordings"),
        help="Directory containing .json/.webm pairs (default: ./recordings)",
    )
    args = parser.parse_args()
    stats = summarize(args.recordings_dir)
    for key, value in stats.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
