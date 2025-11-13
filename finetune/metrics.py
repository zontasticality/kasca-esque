from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Callable, Dict, Iterable, List, Optional, Sequence

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


_wandb = None
_wandb_announced = False


def _generate_run_name() -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"kasca-train-{ts}"


def _require_wandb(
    config: AppConfig,
    *,
    init_run: bool = False,
    run_config: Optional[Dict[str, object]] = None,
    tags: Optional[List[str]] = None,
):
    global _wandb, _wandb_announced
    if _wandb is None:
        try:
            import wandb as _wandb_module
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "wandb must be installed to run training; ensure it is included in the Modal image."
            ) from exc
        if not os.environ.get("WANDB_API_KEY"):
            raise RuntimeError(
                "WANDB_API_KEY is not set; configure the wandb secret so training can report metrics."
            )
        _wandb = _wandb_module
    if init_run and not _wandb.run:
        run_name = os.environ.get("WANDB_RUN_NAME") or _generate_run_name()
        _wandb.init(
            project=config.wandb_project,
            entity=config.wandb_entity,
            name=run_name,
            config=run_config,
            tags=tags,
        )
        if not _wandb_announced:
            url = getattr(_wandb.run, "url", None)
            print(
                f"[wandb] run active: name={_wandb.run.name} id={_wandb.run.id} url={url or 'pending'}",
                flush=True,
            )
            _wandb_announced = True
    elif init_run and _wandb.run and run_config:
        # Update config if run already exists (resumed run)
        try:
            _wandb.run.config.update(run_config, allow_val_change=True)
        except Exception:
            pass
    return _wandb


def ensure_wandb_available(config: AppConfig) -> None:
    """Fail fast if wandb or its API key are missing."""
    _require_wandb(config, init_run=False)


def start_run(
    config: AppConfig,
    run_config: Optional[Dict[str, object]] = None,
    tags: Optional[List[str]] = None,
) -> None:
    """Initialize wandb run (idempotent)."""
    _require_wandb(config, init_run=True, run_config=run_config, tags=tags)


def log_metrics_to_wandb(metrics: Dict[str, float], step: int, split: str, config: AppConfig) -> None:
    """Mandatory wandb logger; raises if wandb is unavailable."""
    wandb = _require_wandb(config, init_run=True)
    payload = {"step": step, "split": split}
    payload.update(metrics)
    wandb.log(payload)


def watch_model(model, config: AppConfig, log: str = "all", log_freq: int = 50) -> None:
    """Register the model with wandb.watch so gradients/weights are tracked."""
    wandb = _require_wandb(config, init_run=True)
    wandb.watch(model, log=log, log_freq=log_freq)
