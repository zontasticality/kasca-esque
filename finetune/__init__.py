"""
kasca-esque finetuning package.

Modules here implement the specification described in SPEC.md and IMPL_DETAILS.md.
They are structured so each concern (sync, manifests, tokenizer, features, training,
inference) can be inspected independently by reviewers.
"""

from __future__ import annotations

__all__ = [
    "config",
    "sync_io",
    "manifests",
    "tokenizer_utils",
    "features",
    "checkpoints",
    "metrics",
    "training",
    "inference",
    "modal_app",
]
