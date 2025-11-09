from __future__ import annotations

from typing import Callable, Dict, Iterable, List, Sequence

import numpy as np
from transformers import EvalPrediction, PreTrainedTokenizerBase

from .config import AppConfig


def _decode_sequences(tokenizer: PreTrainedTokenizerBase, ids: Sequence[Sequence[int]]) -> List[str]:
    return tokenizer.batch_decode(ids, skip_special_tokens=True)


def _token_accuracy(pred_tokens: Iterable[str], label_tokens: Iterable[str]) -> float:
    total = 0
    correct = 0
    for pred, label in zip(pred_tokens, label_tokens):
        pred_seq = pred.split()
        label_seq = label.split()
        for p, l in zip(pred_seq, label_seq):
            total += 1
            if p == l:
                correct += 1
    return correct / total if total else 0.0


def _sequence_accuracy(pred_tokens: Iterable[str], label_tokens: Iterable[str]) -> float:
    comparisons = [int(p == l) for p, l in zip(pred_tokens, label_tokens)]
    return sum(comparisons) / len(comparisons) if comparisons else 0.0


def build_compute_metrics(tokenizer: PreTrainedTokenizerBase) -> Callable[[EvalPrediction], Dict[str, float]]:
    def compute_metrics(eval_prediction: EvalPrediction) -> Dict[str, float]:
        predictions = eval_prediction.predictions
        if isinstance(predictions, tuple):
            predictions = predictions[0]
        if predictions.ndim == 3:
            pred_ids = np.argmax(predictions, axis=-1)
        else:
            pred_ids = predictions
        label_ids = eval_prediction.label_ids
        label_ids[label_ids == -100] = tokenizer.pad_token_id
        pred_text = _decode_sequences(tokenizer, pred_ids)
        label_text = _decode_sequences(tokenizer, label_ids)
        return {
            "token_accuracy": _token_accuracy(pred_text, label_text),
            "sequence_accuracy": _sequence_accuracy(pred_text, label_text),
        }

    return compute_metrics


def log_metrics_to_wandb(metrics: Dict[str, float], step: int, split: str, config: AppConfig) -> None:
    """Lazy wandb logger (safe to call even if WANDB disabled)."""
    try:
        import wandb
    except ImportError:  # pragma: no cover - optional dependency
        return

    if not wandb.run:
        wandb.init(project=config.wandb_project, entity=config.wandb_entity)
    payload = {"step": step, "split": split}
    payload.update(metrics)
    wandb.log(payload)
