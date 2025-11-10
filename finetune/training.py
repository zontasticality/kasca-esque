from __future__ import annotations

import json
from dataclasses import dataclass
from functools import wraps
from pathlib import Path
from typing import List, Optional

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


class WandbMetricsCallback(TrainerCallback):
    def __init__(self, app_config: AppConfig):
        self.config = app_config

    def on_evaluate(
        self,
        args,
        state: TrainerState,
        control: TrainerControl,
        metrics_dict=None,
        **kwargs,
    ):
        if metrics_dict:
            metrics.log_metrics_to_wandb(
                metrics_dict, int(state.global_step), "eval", self.config
            )
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


def _apply_lora(model, hyper: TrainingHyperparams):
    _ensure_whisper_forward_signature(model)
    lora_cfg = LoraConfig(
        task_type=TaskType.SEQ_2_SEQ_LM,
        r=hyper.lora_rank,
        lora_alpha=hyper.lora_alpha,
        lora_dropout=hyper.lora_dropout,
        bias="none",
        target_modules=["q_proj", "k_proj", "v_proj", "out_proj"],
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
    trainer.add_callback(WandbMetricsCallback(app_config))
    trainer.train(
        resume_from_checkpoint=str(resume_checkpoint) if resume_checkpoint else None
    )

    final_tag = f"step-{trainer.state.global_step:06d}"
    trainer_state = (
        trainer.state.to_dict()
        if hasattr(trainer.state, "to_dict")
        else dict(trainer.state.__dict__)
    )
    checkpoint_state = {
        "model": model,
        "optimizer": trainer.optimizer,
        "scheduler": trainer.lr_scheduler,
        "trainer_state": trainer_state,
    }
    checkpoints.save_checkpoint(
        checkpoint_state, app_config.checkpoints_base, final_tag
    )
    return trainer
