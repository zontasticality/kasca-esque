from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Optional, Tuple

import torch
from transformers import WhisperForConditionalGeneration


def load_or_download_checkpoint(
    checkpoint_dir: Path,
    base_model: str,
) -> Tuple[WhisperForConditionalGeneration, Optional[Path]]:
    """
    Load the latest checkpoint if available; otherwise fetch the base model.

    Returns the model and the checkpoint path used to resume Trainer state.
    """
    latest = checkpoint_dir / "latest"
    if latest.exists() and latest.is_dir():
        model = WhisperForConditionalGeneration.from_pretrained(latest)
        return model, latest
    model = WhisperForConditionalGeneration.from_pretrained(base_model)
    return model, None


def _write_symlink(src: Path, dest: Path) -> None:
    if dest.is_symlink() or dest.exists():
        dest.unlink()
    dest.symlink_to(src, target_is_directory=True)


def save_checkpoint(
    model_state: dict[str, Any],
    checkpoint_dir: Path,
    tag: str,
) -> Path:
    """
    Persist a checkpoint under checkpoint_dir/tag and update helper pointers.

    model_state should contain keys like model, optimizer, scheduler, scaler.
    """
    target = checkpoint_dir / tag
    target.mkdir(parents=True, exist_ok=True)
    model = model_state.get("model")
    if model is not None:
        model.save_pretrained(target)
    if optimizer := model_state.get("optimizer"):
        torch.save(optimizer.state_dict(), target / "optimizer.pt")
    if scheduler := model_state.get("scheduler"):
        torch.save(scheduler.state_dict(), target / "scheduler.pt")
    if scaler := model_state.get("scaler"):
        torch.save(scaler.state_dict(), target / "scaler.pt")
    trainer_state = model_state.get("trainer_state")
    if trainer_state:
        with open(target / "trainer_state.json", "w", encoding="utf-8") as handle:
            json.dump(trainer_state, handle, indent=2)

    latest = checkpoint_dir / "latest"
    _write_symlink(target, latest)
    return target
