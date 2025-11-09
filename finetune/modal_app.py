from __future__ import annotations

import json
from pathlib import Path

import modal
from transformers import WhisperConfig, WhisperFeatureExtractor

from . import inference, manifests, sync_io, tokenizer_utils, training
from .config import get_config
from .features import precompute_example_features

app = modal.App("whisper-eventcode")

BASE_IMAGE = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install(
        "numpy==1.26.4",
        "requests==2.31.0",
        "soundfile==0.12.1",
        "librosa==0.10.1",
        "datasets[audio]==2.19.0",
        "torch==2.9.0",
        "torchaudio==2.9.0",
        "transformers==4.44.0",
        "accelerate==0.33.0",
        "peft==0.12.0",
        "tokenizers==0.19.1",
        "evaluate==0.4.2",
        "wandb==0.16.6",
        "torchcodec==0.8.0",
    )
)

KASCA_VOLUME = modal.Volume.from_name("kasca-data", create_if_missing=True)
WANDB_SECRET = modal.Secret.from_name("wandb-secret")


def _iter_manifest_rows(path: Path):
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            yield json.loads(line)


@app.function(
    image=BASE_IMAGE,
    schedule=modal.Period(minutes=15),
    volumes={"/vol/kasca-data": KASCA_VOLUME},
)
def sync_recordings_fn(base_url: str | None = None):
    config = get_config()
    url = base_url or config.base_url
    summary = sync_io.sync_recordings(
        url, config.volume_layout.recordings, volume=KASCA_VOLUME
    )
    return summary


@app.function(
    image=BASE_IMAGE,
    volumes={"/vol/kasca-data": KASCA_VOLUME},
    secrets=[WANDB_SECRET],
)
def prepare_dataset():
    config = get_config()
    records_dir = config.volume_layout.recordings
    if not any(records_dir.glob("*.json")):
        raise RuntimeError(
            f"No recordings found in {records_dir}. Run sync_recordings_fn first or check the volume mount."
        )
    manifests.build_manifests(
        records_dir,
        config.volume_layout.manifests,
        train_ratio=config.hyperparams.train_ratio,
        schema_version=config.manifest_schema_version,
    )
    tokenizer = tokenizer_utils.materialize_tokenizer(
        tokenizer_utils.KEY_CODES, config.volume_layout.tokenizer
    )
    feature_extractor = WhisperFeatureExtractor.from_pretrained(
        config.hyperparams.base_model
    )
    whisper_config = WhisperConfig.from_pretrained(config.hyperparams.base_model)
    max_target_positions = whisper_config.max_target_positions
    for manifest_name in ("train.jsonl", "eval.jsonl"):
        manifest_path = config.volume_layout.manifests / manifest_name
        for row in _iter_manifest_rows(manifest_path):
            precompute_example_features(
                row,
                config.volume_layout.tokens,
                feature_extractor,
                tokenizer,
                max_label_length=max_target_positions,
            )
    KASCA_VOLUME.commit()


@app.function(
    image=BASE_IMAGE,
    gpu="A100-40GB",
    timeout=12 * 60 * 60,
    volumes={"/vol/kasca-data": KASCA_VOLUME},
    secrets=[WANDB_SECRET],
)
def train_model():
    training.train_eventcode_model()


@app.function(
    image=BASE_IMAGE,
    volumes={"/vol/kasca-data": KASCA_VOLUME},
    secrets=[WANDB_SECRET],
)
def decode_recording_fn(filename: str):
    config = get_config()
    audio_path = config.volume_layout.recordings / filename
    checkpoint_dir = config.volume_layout.checkpoints / "latest"
    tokens_dir = config.volume_layout.tokenizer
    tokens = inference.decode_recording(audio_path, checkpoint_dir, tokens_dir)
    return tokens
