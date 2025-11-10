from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Mapping, MutableMapping, Optional, Sequence

import torch
from transformers import PreTrainedTokenizerBase, WhisperFeatureExtractor

from .audio_utils import load_audio_16k

def events_to_text(manifest_row: Mapping[str, object], vocab: Mapping[str, int]) -> str:
    """Convert normalized events into a whitespace-delimited string of tokens."""
    tokens = []
    for event in manifest_row.get("events", []):
        code = event.get("code", "Unidentified")
        state = event.get("type", "").upper()
        token = f"{code}_{state}"
        if token in vocab:
            tokens.append(token)
        else:
            tokens.append("<unk>")
    return " ".join(tokens)


@dataclass
class FeatureCachePaths:
    root: Path

    def example_dir(self, split: str) -> Path:
        path = self.root / split
        path.mkdir(parents=True, exist_ok=True)
        return path


def precompute_example_features(
    manifest_row: Mapping[str, object],
    tokens_dir: Path,
    feature_extractor: WhisperFeatureExtractor,
    tokenizer: PreTrainedTokenizerBase,
    max_label_length: Optional[int] = None,
) -> Path:
    """Materialize mel features + decoder labels for a single manifest row."""
    split = manifest_row["split"]
    audio_path = Path(manifest_row["audio_path"])
    stem = Path(manifest_row["audio_rel_path"]).stem
    cache_dir = tokens_dir / split
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{stem}.pt"
    meta_path = cache_dir / f"{stem}.meta.json"
    if cache_path.exists() and meta_path.exists():
        return cache_path

    waveform = load_audio_16k(audio_path)
    feat = feature_extractor(
        waveform,
        sampling_rate=16000,
        return_attention_mask=True,
        return_tensors="pt",
    )
    text = events_to_text(manifest_row, tokenizer.get_vocab())
    tokenizer_kwargs = {"return_tensors": "pt"}
    if max_label_length is not None:
        tokenizer_kwargs.update({"truncation": True, "max_length": max_label_length})
    labels = tokenizer(text, **tokenizer_kwargs).input_ids.squeeze(0)

    payload = {
        "input_features": feat.input_features.squeeze(0),
        "attention_mask": feat.attention_mask.squeeze(0),
        "labels": labels,
    }
    torch.save(payload, cache_path)
    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "duration": manifest_row.get("duration"),
                "num_frames": int(feat.input_features.shape[-1]),
                "num_labels": int(labels.shape[-1]),
                "split": split,
                "hash": manifest_row.get("recording_sha256"),
            },
            handle,
            indent=2,
        )
    return cache_path


_FALLBACK_CONTEXT: Dict[str, object] = {
    "feature_extractor": None,
    "tokenizer": None,
    "tokens_dir": None,
    "max_label_length": None,
}


def configure_feature_cache_fallback(
    *,
    feature_extractor: WhisperFeatureExtractor,
    tokenizer: PreTrainedTokenizerBase,
    tokens_dir: Path,
    max_label_length: Optional[int] = None,
) -> None:
    """Provide the artifacts needed for prepare_example to rebuild caches on demand."""
    _FALLBACK_CONTEXT["feature_extractor"] = feature_extractor
    _FALLBACK_CONTEXT["tokenizer"] = tokenizer
    _FALLBACK_CONTEXT["tokens_dir"] = tokens_dir
    _FALLBACK_CONTEXT["max_label_length"] = max_label_length


def prepare_example(batch: MutableMapping[str, object], feature_cache_root: Path) -> MutableMapping[str, object]:
    """Dataset map function: load cached tensors on the fly, recomputing if absent."""
    cache_path = feature_cache_root / batch["split"] / f"{Path(batch['audio_rel_path']).stem}.pt"
    if not cache_path.exists():
        feature_extractor = _FALLBACK_CONTEXT.get("feature_extractor")
        tokenizer = _FALLBACK_CONTEXT.get("tokenizer")
        tokens_dir = _FALLBACK_CONTEXT.get("tokens_dir")
        max_label_length = _FALLBACK_CONTEXT.get("max_label_length")
        if feature_extractor is None or tokenizer is None or tokens_dir is None:
            raise FileNotFoundError(f"Missing feature cache for {batch['audio_rel_path']}")
        print(f"[cache-miss] rebuilding features for {batch['audio_rel_path']}")
        precompute_example_features(
            batch,
            Path(tokens_dir),
            feature_extractor,
            tokenizer,
            max_label_length=max_label_length,
        )
    payload = torch.load(cache_path)
    batch.update(payload)
    return batch


def add_audio_path(example: MutableMapping[str, object], data_root: Path) -> MutableMapping[str, object]:
    """Attach absolute audio path to manifests when running locally."""
    rel = example.get("audio_rel_path")
    audio_path = data_root / rel
    if not audio_path.exists():
        fallback = data_root / f"{Path(rel).stem}_DELETED.webm"
        if not fallback.exists():
            raise FileNotFoundError(f"Audio missing for {rel}")
        audio_path = fallback
    example["audio_path"] = str(audio_path)
    return example
