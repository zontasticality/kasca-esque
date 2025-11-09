from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Literal, Tuple


def hash_partition(recording_name: str, train_ratio: float = 0.9) -> Literal["train", "test"]:
    """Deterministically assign a recording to train/test via blake2s."""
    cleaned = recording_name.lower().strip()
    digest = hashlib.blake2s(cleaned.encode("utf-8"), digest_size=16).hexdigest()
    value = int(digest, 16) / float(2 ** (16 * 8))
    return "train" if value < train_ratio else "test"


def _audio_duration_seconds(webm_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(webm_path),
    ]
    try:
        out = subprocess.check_output(cmd)
        return float(out.strip())
    except Exception:
        return 0.0


def _normalize_events(events: Iterable[dict]) -> List[dict]:
    events = list(events)
    if not events:
        return []
    base_ts = events[0].get("timestamp", 0)
    normalized = []
    for event in events:
        ts = event.get("timestamp", base_ts)
        delta = (ts - base_ts) / 1000.0
        event_type = event.get("event_type", "").lower()
        state = "down" if "down" in event_type else "up"
        normalized.append(
            {
                "time": delta,
                "code": event.get("key", "Unidentified"),
                "type": state,
            }
        )
    return normalized


def _write_jsonl(rows: Iterable[dict], dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with open(dest, "w", encoding="utf-8") as handle:
        for row in rows:
            json.dump(row, handle)
            handle.write("\n")
            count += 1
    return count


def build_manifests(
    recordings_dir: Path,
    manifest_dir: Path,
    *,
    train_ratio: float = 0.9,
    schema_version: str = "2024-05-17",
) -> Tuple[Path, Path]:
    """Create train/eval manifest JSONL files covering every json/webm pair."""
    recordings_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir.mkdir(parents=True, exist_ok=True)
    train_path = manifest_dir / "train.jsonl"
    eval_path = manifest_dir / "eval.jsonl"
    split_map_path = manifest_dir / "split_map.json"
    meta_path = manifest_dir / "manifest.meta.json"

    train_rows: List[dict] = []
    eval_rows: List[dict] = []
    split_map: Dict[str, str] = {}

    for json_path in sorted(recordings_dir.glob("*.json")):
        audio_path = json_path.with_suffix(".webm")
        if not audio_path.exists():
            continue
        with open(json_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        keystrokes = payload.get("keystrokes", [])
        events = _normalize_events(keystrokes)
        split = hash_partition(json_path.stem, train_ratio=train_ratio)
        entry = {
            "recording": json_path.name,
            "audio_rel_path": audio_path.name,
            "audio_path": str(audio_path.resolve()),
            "split": split,
            "events": events,
            "duration": _audio_duration_seconds(audio_path),
            "num_events": len(events),
            "recording_sha256": hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest(),
        }
        split_map[json_path.name] = split
        if split == "train":
            train_rows.append(entry)
        else:
            eval_rows.append(entry)

    train_count = _write_jsonl(train_rows, train_path)
    eval_count = _write_jsonl(eval_rows, eval_path)
    with open(split_map_path, "w", encoding="utf-8") as handle:
        json.dump(split_map, handle, indent=2)

    meta = {
        "schema_version": schema_version,
        "train_count": train_count,
        "eval_count": eval_count,
        "total_events": sum(row["num_events"] for row in train_rows + eval_rows),
    }
    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump(meta, handle, indent=2)
    return train_path, eval_path
