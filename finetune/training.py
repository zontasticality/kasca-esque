from __future__ import annotations

import json
import os
from collections import deque
from dataclasses import dataclass, asdict
from functools import wraps
import shutil
from pathlib import Path
from typing import Dict, List, Optional

# Torch 2.6 switched torch.load(weights_only=True) as the default which breaks
# Trainer's RNG/optimizer state restores. Force the legacy behavior so
# checkpoint resumes keep working until upstream adopts the new API.
os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

import torch
from peft import LoraConfig, TaskType, get_peft_model
from torch.utils.data import Dataset
from transformers import (
    PreTrainedTokenizerFast,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    TrainerCallback,
    TrainerControl,
    TrainerState,
    WhisperConfig,
    WhisperFeatureExtractor,
)

from . import checkpoints, metrics
from .config import AppConfig, TrainingHyperparams, get_config
from .features import precompute_example_features


class CachedFeatureDataset(Dataset):
    """Simple dataset that reads precomputed .pt feature blobs."""

    def __init__(self, tokens_dir: Path, split: str):
        split_dir = tokens_dir / split
        self.paths = sorted(split_dir.glob("*.pt"))
        if not self.paths:
            raise FileNotFoundError(f"No cached tensors found in {split_dir}")

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, idx: int):
        payload = torch.load(self.paths[idx], map_location="cpu")
        return {
            "input_features": payload["input_features"],
            "attention_mask": payload["attention_mask"],
            "labels": payload["labels"],
        }


@dataclass
class EventCodeCollator:
    pad_token_id: int

    def __call__(self, batch):
        input_features = torch.stack([example["input_features"] for example in batch])
        attention_mask = torch.stack([example["attention_mask"] for example in batch])
        labels = [example["labels"] for example in batch]
        labels_padded = torch.nn.utils.rnn.pad_sequence(
            labels,
            batch_first=True,
            padding_value=self.pad_token_id,
        )
        return {
            "input_features": input_features,
            "attention_mask": attention_mask,
            "labels": labels_padded,
        }


class TrainerSpecCallback(TrainerCallback):
    """Enforce spec-driven logging, early stopping, and checkpoint hygiene."""

    def __init__(self, app_config: AppConfig):
        self.config = app_config
        self.metrics_dir = app_config.checkpoints_base / "metrics"
        self.metrics_dir.mkdir(parents=True, exist_ok=True)
        self.best_token_accuracy = 0.0
        self.prev_token_accuracy: Optional[float] = None
        self.stall_counter = 0
        self.pending_best_step: Optional[int] = None
        self.saved_checkpoints: deque[Path] = deque()
        self.keep_last = app_config.hyperparams.max_saved_checkpoints
        self.latest_symlink = app_config.checkpoints_base / "latest"
        self.best_symlink = app_config.checkpoints_base / "best"
        self.best_checkpoint_path: Optional[Path] = None

    def on_evaluate(
        self,
        args,
        state: TrainerState,
        control: TrainerControl,
        metrics_dict=None,
        **kwargs,
    ):
        if not metrics_dict:
            return control
        step = int(state.global_step)
        metrics.log_metrics_to_wandb(metrics_dict, step, "eval", self.config)
        self._write_metrics_file(step, metrics_dict)

        token_acc = metrics_dict.get("token_accuracy")
        if token_acc is not None:
            if self.prev_token_accuracy is not None:
                drop = self.prev_token_accuracy - token_acc
                if drop > 0.05:
                    raise RuntimeError(
                        f"token_accuracy dropped by {drop:.3f} (>0.05) at step {step}; aborting run to protect checkpoints."
                    )
            improvement = token_acc - self.best_token_accuracy
            if improvement >= 0.005:
                self.best_token_accuracy = token_acc
                self.stall_counter = 0
                control.should_save = True
                self.pending_best_step = step
            else:
                self.stall_counter += 1
                if self.stall_counter >= self.config.hyperparams.patience_evals:
                    control.should_training_stop = True
            self.prev_token_accuracy = token_acc
        return control

    def on_save(self, args, state: TrainerState, control: TrainerControl, **kwargs):
        checkpoint_dir = Path(args.output_dir) / f"checkpoint-{state.global_step}"
        if checkpoint_dir.exists():
            self._register_checkpoint(checkpoint_dir)
            if self.pending_best_step is not None and int(state.global_step) == self.pending_best_step:
                self.best_checkpoint_path = checkpoint_dir
                self._update_symlink(checkpoint_dir, self.best_symlink)
                self.pending_best_step = None
        return control

    def register_manual_checkpoint(self, checkpoint_dir: Path) -> None:
        """Allow caller to register a checkpoint saved outside Trainer callbacks."""
        self._register_checkpoint(checkpoint_dir)

    def ensure_best_symlink(self) -> None:
        """Default best -> latest when no eval ever improved."""
        if not self.best_symlink.exists() and self.latest_symlink.exists():
            target = self.latest_symlink.resolve()
            self._update_symlink(target, self.best_symlink)

    def _write_metrics_file(self, step: int, metrics_dict: Dict[str, float]) -> None:
        metrics_path = self.metrics_dir / f"eval-step-{step:06d}.json"
        payload = {"step": step}
        payload.update(metrics_dict)
        with open(metrics_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, default=float)

    def _register_checkpoint(self, checkpoint_dir: Path) -> None:
        resolved = checkpoint_dir.resolve()
        if resolved in self.saved_checkpoints:
            self.saved_checkpoints.remove(resolved)
        self.saved_checkpoints.append(resolved)
        self._update_symlink(resolved, self.latest_symlink)
        self._prune_checkpoints()

    def _update_symlink(self, target: Path, link: Path) -> None:
        link.parent.mkdir(parents=True, exist_ok=True)
        try:
            if link.is_symlink() or link.exists():
                link.unlink()
        except FileNotFoundError:
            pass
        link.symlink_to(target, target_is_directory=True)

    def _prune_checkpoints(self) -> None:
        while len(self.saved_checkpoints) > self.keep_last:
            oldest = self.saved_checkpoints.popleft()
            if (
                self.best_checkpoint_path is not None
                and oldest == self.best_checkpoint_path.resolve()
            ):
                self.saved_checkpoints.append(oldest)
                break
            shutil.rmtree(oldest, ignore_errors=True)

    def on_log(self, args, state: TrainerState, control: TrainerControl, logs=None, **kwargs):
        if not logs:
            return control
        step = int(state.global_step)
        payload = {}
        if "loss" in logs:
            payload["train_loss"] = float(logs["loss"])
        if "learning_rate" in logs:
            payload["learning_rate"] = float(logs["learning_rate"])
        if payload:
            metrics.log_metrics_to_wandb(payload, step, "train", self.config)
        return control

def _load_manifest_rows(manifest_path: Path) -> List[dict]:
    rows: List[dict] = []
    with open(manifest_path, "r", encoding="utf-8") as handle:
        for line in handle:
            rows.append(json.loads(line))
    return rows


def _ensure_feature_caches(
    rows: List[dict],
    tokens_dir: Path,
    tokenizer: PreTrainedTokenizerFast,
    base_model: str,
) -> None:
    feature_extractor = WhisperFeatureExtractor.from_pretrained(base_model)
    max_target_positions = WhisperConfig.from_pretrained(base_model).max_target_positions
    for row in rows:
        split = row["split"]
        stem = Path(row["audio_rel_path"]).stem
        cache_path = tokens_dir / split / f"{stem}.pt"
        if cache_path.exists():
            continue
        precompute_example_features(
            row,
            tokens_dir,
            feature_extractor,
            tokenizer,
            max_label_length=max_target_positions,
        )


def _encoder_attention_targets(model) -> List[str]:
    targets: List[str] = []
    suffixes = (
        "self_attn.q_proj",
        "self_attn.k_proj",
        "self_attn.v_proj",
        "self_attn.out_proj",
    )
    for name, _ in model.named_modules():
        if not name.startswith("model.encoder.layers"):
            continue
        if name.endswith(suffixes):
            targets.append(name)
    return targets


def _apply_lora(model, hyper: TrainingHyperparams):
    _ensure_whisper_forward_signature(model)
    target_modules = _encoder_attention_targets(model)
    if not target_modules:
        target_modules = ["q_proj", "k_proj", "v_proj", "out_proj"]
    lora_cfg = LoraConfig(
        task_type=TaskType.SEQ_2_SEQ_LM,
        r=hyper.lora_rank,
        lora_alpha=hyper.lora_alpha,
        lora_dropout=hyper.lora_dropout,
        bias="none",
        target_modules=target_modules,
    )
    return get_peft_model(model, lora_cfg)


def _ensure_whisper_forward_signature(model):
    if getattr(model, "_kasca_accepts_input_ids", False):
        return
    original_forward = model.forward

    @wraps(original_forward)
    def wrapped_forward(*args, **kwargs):
        kwargs.pop("input_ids", None)
        kwargs.pop("inputs_embeds", None)
        return original_forward(*args, **kwargs)

    model.forward = wrapped_forward
    setattr(model, "_kasca_accepts_input_ids", True)


def _log_dataset_label_stats(name: str, dataset: CachedFeatureDataset):
    if len(dataset) == 0:
        print(f"[dataset:{name}] empty dataset")
        return
    label_mins = []
    label_maxes = []
    lengths = []
    sample_count = min(16, len(dataset))
    for idx in range(sample_count):
        example = dataset[idx]
        labels = example["labels"]
        label_mins.append(int(labels.min()))
        label_maxes.append(int(labels.max()))
        lengths.append(int(labels.shape[-1]))
    print(
        f"[dataset:{name}] samples={sample_count} "
        f"label_min={min(label_mins)} label_max={max(label_maxes)} "
        f"seq_len_min={min(lengths)} seq_len_max={max(lengths)}"
    )


def train_eventcode_model(config: Optional[AppConfig] = None):
    """Entrypoint used by Modal to run the full training job."""
    app_config = config or get_config()
    hyper = app_config.hyperparams
    metrics.ensure_wandb_available(app_config)

    train_manifest = app_config.manifests_base / "train.jsonl"
    eval_manifest = app_config.manifests_base / "eval.jsonl"
    if not train_manifest.exists() or not eval_manifest.exists():
        raise FileNotFoundError("Manifests missing; run prepare_dataset first.")
    if not app_config.tokenizer_base.exists():
        raise FileNotFoundError("Tokenizer missing; run prepare_dataset first.")

    tokenizer = PreTrainedTokenizerFast.from_pretrained(app_config.tokenizer_base)
    train_rows = _load_manifest_rows(train_manifest)
    eval_rows = _load_manifest_rows(eval_manifest)
    _ensure_feature_caches(
        train_rows + eval_rows, app_config.tokens_base, tokenizer, hyper.base_model
    )

    run_config = asdict(hyper)
    run_config.update(
        {
            "train_examples": len(train_rows),
            "eval_examples": len(eval_rows),
            "manifest_schema": app_config.manifest_schema_version,
            "tokenizer_dir": str(app_config.tokenizer_base),
        }
    )
    metrics.start_run(app_config, run_config=run_config, tags=["kasca", "whisper"])

    train_dataset = CachedFeatureDataset(app_config.tokens_base, "train")
    eval_dataset = CachedFeatureDataset(app_config.tokens_base, "test")
    _log_dataset_label_stats("train", train_dataset)
    _log_dataset_label_stats("eval", eval_dataset)

    model, resume_checkpoint = checkpoints.load_or_download_checkpoint(
        app_config.checkpoints_base, hyper.base_model
    )
    model = _apply_lora(model, hyper)

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(app_config.checkpoints_base),
        per_device_train_batch_size=hyper.per_device_batch_size,
        per_device_eval_batch_size=hyper.per_device_batch_size,
        gradient_accumulation_steps=hyper.gradient_accumulation_steps,
        learning_rate=hyper.learning_rate,
        weight_decay=hyper.weight_decay,
        warmup_steps=hyper.warmup_steps,
        num_train_epochs=hyper.max_epochs,
        max_steps=hyper.max_steps,
        logging_steps=50,
        evaluation_strategy="steps",
        save_strategy="steps",
        eval_steps=hyper.eval_interval_steps,
        save_steps=hyper.checkpoint_interval_steps,
        save_total_limit=3,
        predict_with_generate=True,
        generation_max_length=256,
        bf16=torch.cuda.is_available(),
        gradient_checkpointing=False,
        lr_scheduler_type="cosine",
        report_to=[],
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=EventCodeCollator(tokenizer.pad_token_id),
        tokenizer=tokenizer,
        compute_metrics=metrics.build_compute_metrics(tokenizer),
    )
    spec_callback = TrainerSpecCallback(app_config)
    trainer.add_callback(spec_callback)
    trainer.train(
        resume_from_checkpoint=str(resume_checkpoint) if resume_checkpoint else None
    )

    latest_link = app_config.checkpoints_base / "latest"
    if not latest_link.exists():
        final_checkpoint = (
            app_config.checkpoints_base
            / f"checkpoint-{int(trainer.state.global_step):06d}"
        )
        trainer.save_model(str(final_checkpoint))
        spec_callback.register_manual_checkpoint(final_checkpoint)
    spec_callback.ensure_best_symlink()
    return trainer
