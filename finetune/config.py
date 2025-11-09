from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _path(env_key: str, default: str) -> Path:
    return Path(os.environ.get(env_key, default)).expanduser()


@dataclass(frozen=True)
class VolumeLayout:
    """Canonical layout for the persisted Modal volume."""

    root: Path = Path("/vol/kasca-data")
    recordings: Path = field(default_factory=lambda: Path("/vol/kasca-data/recordings"))
    manifests: Path = field(default_factory=lambda: Path("/vol/kasca-data/manifests"))
    tokens: Path = field(default_factory=lambda: Path("/vol/kasca-data/tokens"))
    checkpoints: Path = field(default_factory=lambda: Path("/vol/kasca-data/checkpoints"))
    tokenizer: Path = field(default_factory=lambda: Path("/vol/kasca-data/tokenizer"))

    def ensure(self) -> None:
        """Materialize expected subdirectories."""
        for path in (self.recordings, self.manifests, self.tokens, self.checkpoints, self.tokenizer):
            path.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class LocalPaths:
    """Local fallbacks when running outside Modal."""

    project_root: Path = field(default_factory=lambda: Path(__file__).resolve().parents[1])
    recordings: Path = field(init=False)
    manifests: Path = field(init=False)
    tokens: Path = field(init=False)
    checkpoints: Path = field(init=False)
    tokenizer: Path = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "recordings", self.project_root / "recordings")
        object.__setattr__(self, "manifests", self.project_root / "finetune" / "manifests")
        object.__setattr__(self, "tokens", self.project_root / "finetune" / "tokens")
        object.__setattr__(self, "checkpoints", self.project_root / "finetune" / "checkpoints")
        object.__setattr__(self, "tokenizer", self.project_root / "finetune" / "tokenizer_artifacts")


@dataclass(frozen=True)
class TrainingHyperparams:
    base_model: str = "openai/whisper-small"
    learning_rate: float = 2e-4
    betas: tuple[float, float] = (0.9, 0.98)
    weight_decay: float = 0.01
    warmup_steps: int = 500
    gradient_clip: float = 1.0
    max_epochs: int = 10
    patience_evals: int = 3
    train_ratio: float = 0.9
    eval_interval_steps: int = 250
    checkpoint_interval_steps: int = 500
    effective_batch_size: int = 32
    per_device_batch_size: int = 8
    gradient_accumulation_steps: int = field(init=False)
    lora_rank: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "gradient_accumulation_steps",
            max(1, self.effective_batch_size // self.per_device_batch_size),
        )


@dataclass(frozen=True)
class AppConfig:
    """Top-level configuration object shared by modules."""

    base_url: str = os.environ.get("KASCA_RECORDINGS_URL", "https://kasca-esque.fly.dev")
    volume_layout: VolumeLayout = field(default_factory=VolumeLayout)
    local_paths: LocalPaths = field(default_factory=LocalPaths)
    hyperparams: TrainingHyperparams = field(default_factory=TrainingHyperparams)
    wandb_project: str = os.environ.get("WANDB_PROJECT", "kasca-whisper")
    wandb_entity: Optional[str] = os.environ.get("WANDB_ENTITY")
    manifest_schema_version: str = "2024-05-17"

    @property
    def recordings_base(self) -> Path:
        if self.volume_layout.root.exists():
            return self.volume_layout.recordings
        return self.local_paths.recordings

    @property
    def manifests_base(self) -> Path:
        if self.volume_layout.root.exists():
            return self.volume_layout.manifests
        return self.local_paths.manifests

    @property
    def tokens_base(self) -> Path:
        if self.volume_layout.root.exists():
            return self.volume_layout.tokens
        return self.local_paths.tokens

    @property
    def checkpoints_base(self) -> Path:
        if self.volume_layout.root.exists():
            return self.volume_layout.checkpoints
        return self.local_paths.checkpoints

    @property
    def tokenizer_base(self) -> Path:
        if self.volume_layout.root.exists():
            return self.volume_layout.tokenizer
        return self.local_paths.tokenizer


def get_config() -> AppConfig:
    """Factory to load configuration once."""
    return AppConfig()
