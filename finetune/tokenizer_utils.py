from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List, Mapping

from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from transformers import PreTrainedTokenizerFast


SPECIAL_TOKENS = ["<pad>", "<s>", "</s>", "<unk>"]


def collect_event_codes(manifest_paths: Iterable[Path]) -> List[str]:
    """
    Scan manifest rows to extract every distinct KeyboardEvent.code observed so far.

    Using manifests keeps the tokenizer vocabulary aligned with the normalized events
    that actually make it into training/eval splits instead of whatever happens to be
    present in raw key logs.
    """
    codes = set()
    for manifest_path in manifest_paths:
        if not manifest_path.exists():
            continue
        with open(manifest_path, "r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                for event in row.get("events", []):
                    code = event.get("code")
                    if code:
                        codes.add(code)
    if not codes:
        raise RuntimeError(
            "No keyboard event codes found in manifests; run sync_recordings first."
        )
    return sorted(codes)


def _build_vocab(codes: Iterable[str]) -> Mapping[str, int]:
    vocab = {}
    for idx, token in enumerate(SPECIAL_TOKENS):
        vocab[token] = idx
    next_idx = len(vocab)
    for code in codes:
        for state in ("DOWN", "UP"):
            token = f"{code}_{state}"
            if token not in vocab:
                vocab[token] = next_idx
                next_idx += 1
    return vocab


def materialize_tokenizer(
    codes: List[str], output_dir: Path
) -> PreTrainedTokenizerFast:
    """Create and save a WordLevel tokenizer tailored to DOWN/UP key tokens."""
    output_dir.mkdir(parents=True, exist_ok=True)
    vocab = _build_vocab(codes)
    tokenizer = Tokenizer(WordLevel(vocab=vocab, unk_token="<unk>"))
    tokenizer.pre_tokenizer = Whitespace()
    pt_tokenizer = PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        bos_token="<s>",
        eos_token="</s>",
        pad_token="<pad>",
        unk_token="<unk>",
    )
    pt_tokenizer.save_pretrained(output_dir)
    with open(output_dir / "codes.json", "w", encoding="utf-8") as handle:
        json.dump({"codes": codes}, handle, indent=2)
    return pt_tokenizer
