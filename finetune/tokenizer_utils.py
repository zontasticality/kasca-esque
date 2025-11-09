from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List, Mapping

from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from transformers import PreTrainedTokenizerFast


SPECIAL_TOKENS = ["<pad>", "<s>", "</s>", "<unk>"]


def collect_event_codes(recordings_dir: Path) -> List[str]:
    """Scan keylog JSON files to extract every distinct KeyboardEvent.code."""
    codes = set()
    for json_path in recordings_dir.glob("*.json"):
        with open(json_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        for event in payload.get("keystrokes", []):
            code = event.get("key")
            if code:
                codes.add(code)
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


def materialize_tokenizer(codes: List[str], output_dir: Path) -> PreTrainedTokenizerFast:
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
