from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable, List, Mapping, MutableMapping, Optional

import requests


def fetch_remote_listing(base_url: str, timeout: int = 30) -> List[Mapping[str, str]]:
    """Return the JSON listing of recordings from the fly.dev endpoint."""
    url = f"{base_url.rstrip('/')}/recordings"
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError(f"Unexpected recordings payload: {payload!r}")
    return payload


def _download_file(url: str, dest: Path, chunk_size: int = 1 << 16) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with open(dest, "wb") as handle:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    handle.write(chunk)


def _remove_absent(local_files: Iterable[Path], expected_names: set[str]) -> List[Path]:
    removed: List[Path] = []
    for path in local_files:
        if path.suffix not in {".json", ".webm"}:
            continue
        if path.name not in expected_names:
            path.unlink(missing_ok=True)
            removed.append(path)
    return removed


def sync_recordings(
    base_url: str,
    recordings_dir: Path,
    *,
    cache_subdir: str = "recordings",
    volume=None,
) -> MutableMapping[str, int | float | str | List[str]]:
    """
    Mirror remote recordings into recordings_dir.

    Returns a summary dict useful for logging; callers can serialize it to JSON.
    """
    recordings_dir.mkdir(parents=True, exist_ok=True)
    listing = fetch_remote_listing(base_url)
    expected_files = set()
    downloaded: List[str] = []

    for row in listing:
        audio = row.get("audio")
        keylog = row.get("keylog")
        if not audio or not keylog:
            continue
        for rel in (audio, keylog):
            expected_files.add(rel)
            target_path = recordings_dir / rel
            if target_path.exists():
                continue
            source_url = f"{base_url.rstrip('/')}/{rel}"
            _download_file(source_url, target_path)
            downloaded.append(rel)

    removed = _remove_absent(recordings_dir.glob("*"), expected_files)
    listing_bytes = json.dumps(listing, sort_keys=True).encode("utf-8")
    meta_path = recordings_dir / "sync.meta.json"
    summary = {
        "remote_count": len(listing),
        "downloaded": downloaded,
        "removed": [p.name for p in removed],
        "listing_sha256": hashlib.sha256(listing_bytes).hexdigest(),
        "cache_subdir": cache_subdir,
    }
    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    if volume is not None:
        try:
            volume.commit()
        except Exception as err:  # pragma: no cover - Modal specific side effect
            print(f"[warn] failed to commit volume: {err}")
    return summary
