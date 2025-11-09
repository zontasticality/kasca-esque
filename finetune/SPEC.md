# Finetuning Whisper with Custom Decoder

## Objective & Success Criteria
- Fine-tune `openai/whisper-small` so that its encoder feeds a custom decoder emitting JavaScript `KeyboardEvent.code` tokens (with DOWN/UP states) derived from live recordings hosted at `https://kasca-esque.fly.dev/recordings`.
- Maintain reproducible data ingest so re-training on new recordings never reshuffles existing train/test assignments.
- Achieve and sustain `token_accuracy ≥ 0.88` and `sequence_accuracy ≥ 0.65` on the deterministic test split within the last three evaluation windows.
- Run the full pipeline inside Modal, persisting artifacts to a `kasca-data` volume so training can resume after interruptions without re-downloading inputs.

## Data Lifecycle & Storage Layout
1. A scheduled Modal function runs `sync_recordings` every 15 minutes, mirroring `/recordings` into `kasca-data/recordings` and pruning stale files.
2. `build_manifests` transforms synchronized `.json/.webm` pairs into normalized event timelines and writes deterministic `train.jsonl` / `eval.jsonl` manifests under `kasca-data/manifests`.
3. `collect_event_codes` reads every manifest row to construct the exact vocabulary used by the decoder and tokenizer.
4. `precompute_example_features` materializes mel spectrogram tensors plus decoder labels into `kasca-data/tokens/<split>/` so experiments can memory-map cached tensors instead of recomputing audio features.
5. `train_eventcode_model` loads cached tensors, trains, checkpointing under `kasca-data/checkpoints`, and logs metrics + artifacts.

Directory contract inside the Modal volume:
- `recordings/` — mirrored raw `.webm` + `.json` downloads.
- `manifests/` — `train.jsonl`, `eval.jsonl`, plus metadata about split hashes.
- `tokens/train|test/` — `.pt` feature blobs + `.meta.json` describing each example.
- `checkpoints/` — Hugging Face-compatible checkpoints and optimizer states (latest, best, timestamped).
- `tokenizer/` — saved fast tokenizer + vocab JSON used by both training and inference.

## Dataset Snapshot (May 2024)
- Local `recordings/` holds 53 `.json/.webm` pairs totaling roughly **21 ,965 seconds (6.10 hours)** of audio and **195 ,354** logged keystrokes (≈3 ,686 tokens per recording). Stats came from a one-off `ffprobe` + JSON scan (`python scripts/dataset_stats.py`, run 2024‑05‑17); rerun after every sync to track growth.
- Two JSONs (`qt_1750019330494_email_1`, `qt_1750019330494_free_form`) are missing matching audio and should be pruned or re-synced before manifest rebuilds to avoid dangling labels.
- Dataset is well under 10 hours, so parameter-efficient finetuning (LoRA rank 16–32, α proportional to rank, dropout 0.05) remains the safer default; move to full-model updates only once we accumulate ≥30 hours or observe persistent underfitting.
- Expect about 200k decoder tokens per epoch; with effective batch size 32 the trainer sees ~6k optimizer steps over 10 epochs, so cadence targets (eval every 250 steps) trigger 20–25 evaluations per run.

## Modal Infrastructure
### Base Image
- Build a pinned Modal image from `modal.Image.debian_slim(python_version="3.12")` with `apt_install("ffmpeg")` and `uv_pip_install` of exact versions: `torch==2.9.0`, `torchaudio==2.9.0`, `transformers==4.44.0`, `accelerate==0.33.0`, `peft==0.12.0`, `tokenizers==0.15.2`, `datasets[audio]==2.19.0`, `evaluate==0.4.2`, `librosa==0.10.1`, `soundfile==0.12.1`, `wandb==0.16.6`, `torchcodec==0.8.0`. Publish the resulting image digest and reference it via `image=modal.Image.from_registry(...)` so retrains reuse the same stack until we intentionally bump versions.

### Volumes & Secrets
- Mount `modal.Volume.persisted("kasca-data", use_blob_storage=True)` at `/vol/kasca-data` for all long-lived assets.
- Require `modal.Secret.from_name("wandb-secret")` to inject `WANDB_API_KEY`; fail fast if the secret is absent.

### Functions, Scheduling & Cold Start
- `sync_recordings` runs on a CPU worker (`modal.Function(gpu=None, schedule=modal.Periodic("15m"))`) and commits the volume after every successful sync so training jobs always see fresh files.
- `prepare_dataset` (manual trigger) rebuilds manifests, tokenizer, and cached tensors after new recordings arrive; it aborts if feature/tokens directories and manifests are out of sync.
- `train_eventcode_model` executes on a single `modal.gpu.A100-40GB` with `allow_concurrent_inputs=1`, `timeout=12 * 60 * 60`, and `gpu_config.enable_memory_snapshot=True` to keep cold starts under 20s. Multi-GPU training is deliberately avoided for now because the dataset is small (<10 h) and LoRA keeps per-step memory <20 GB; scaling out would add DDP overhead without tangible wall-clock benefit until we exceed ~30 h or switch to full-model finetunes.
- `decode_recording_fn` provides an interactive endpoint (no GPU) for smoke tests using the latest checkpoint + tokenizer.

## Dataset Preparation & Precomputation
- Deterministic split: compute `hashlib.blake2s(recording_name.encode()).hexdigest()`, sort unique hashes, and place the lowest 90% in train, remaining 10% in test; store the map alongside manifests for auditability.
- Each manifest row stores: relative audio path, normalized event list, split, sha256 of raw JSON, and duration.
- Tokenizer generation duplicates every observed `KeyboardEvent.code` into `_DOWN` and `_UP` tokens plus `<pad>`, `<s>`, `</s>`, `<unk>`.
- Feature caches contain `input_features.pt`, `labels.pt`, `attention_mask.pt`, and `<stem>.meta.json` (`duration`, `num_frames`, `num_labels`, `split`, `hash`).
- `prepare_example` must be able to fall back to on-the-fly extraction if cache files are missing or corrupt, logging cache misses for follow-up.

## Training Configuration
- Model: initialize `WhisperForConditionalGeneration` with encoder weights from `openai/whisper-small`, replace decoder with randomly initialized head sized to the tokenizer vocab, and disable language/task forcing.
- Parameter-efficient tuning: apply LoRA rank 16, alpha 32 on the encoder self-attention projections while the decoder trains fully.
- Optimization: `AdamW` (`lr=2e-4`, `betas=(0.9, 0.98)`, `weight_decay=0.01`), cosine schedule with 500-step warmup, gradient clipping at `1.0`, effective batch size 32 (accumulate gradients if per-device batch is smaller).
- Training stops after 10 epochs OR 3 consecutive evaluations without `token_accuracy` improvement ≥ 0.005.
- Checkpoint cadence: keep `latest`, `best`, and last three epoch checkpoints; write a checkpoint every 500 optimizer steps and after each evaluation that improves the metric.
- Resume logic: before downloading a base model, check `checkpoints/latest` and restore model, optimizer, scheduler, and gradient scaler state if present.

### Training Strategy & LoRA Sweeps
- Default adapter hyperparams: rank 16, α 32 (≈2×rank), dropout 0.05 on LoRA outputs, targeting encoder attention projections only. These settings keep memory low and match current dataset scale (<10 h).
- Define “saturation” as validation token/sequence accuracy plateauing below spec targets even after ≥2 full epochs and no optimizer instability. When this happens, run a short grid of adapter configs: rank {16, 32}, α = 2×rank, dropout {0.05, 0.1}. Use the cached dataset so sweeps are cheap.
- If higher-rank/ lower-dropout adapters produce measurable gains (>1–2% accuracy), adopt the best configuration and re-run a full training job. If all sweeps plateau, escalate to broader changes (expanding LoRA coverage to cross-attention/MLP or unfreezing the full encoder) only after confirming data quality.
- Keep sweep metadata (rank, α, dropout, best eval metrics, manifest hash) in wandb configs so later runs know which adapter capacity bound was last explored.

## Evaluation, Monitoring & Logging
- Run evaluation on both train and test splits every 250 optimizer steps or every 15 minutes, whichever happens first.
- Metrics: `sequence_accuracy`, `token_accuracy`, `avg_decode_latency_ms`, plus loss curves reported to stdout and wandb; store raw metric JSON next to checkpoints. `sequence_accuracy` is an all-or-nothing match over entire key timelines (akin to “sentence accuracy”) and guards against subtle DOWN/UP ordering regressions, while `token_accuracy` provides per-event granularity.
- wandb logging: project `kasca-whisper`, job name derived from date + git commit, config contains hyperparameters and manifest hashes.
- Surface alerts: if `token_accuracy_test` drops by >5% relative to the previous evaluation, mark the run as `failed` and stop early to prevent regressing checkpoints.

## Inference Smoke Tests
- After each successful evaluation, `decode_recording_fn` should automatically run on three randomly sampled test recordings, store decoded tokens next to ground-truth JSON, and upload short comparisons to wandb artifacts for manual review.

## Component Functions
- `sync_recordings(base_url: str, kasca_volume: Path, cache_subdir: str = "recordings")`
- `hash_partition(recording_name: str, train_ratio: float = 0.9) -> Literal["train", "test"]`
- `build_manifests(recordings_dir: Path, manifest_dir: Path) -> Tuple[Path, Path]`
- `collect_event_codes(recordings_dir: Path) -> List[str]`
- `materialize_tokenizer(codes: List[str], output_dir: Path) -> PreTrainedTokenizerFast`
- `events_to_text(manifest_row: dict, vocab: Mapping[str, int]) -> dict`
- `precompute_example_features(manifest_row: dict, tokens_dir: Path, feature_extractor, tokenizer) -> None`
- `prepare_example(batch: dict, feature_cache_root: Path) -> dict`
- `add_audio_path(example: dict, data_root: Path) -> dict`
- `load_or_download_checkpoint(model_dir: Path, base_model: str) -> Tuple[nn.Module, Optional[Path]]`
- `save_checkpoint(model_state: dict, checkpoint_dir: Path, tag: str) -> Path`
- `compute_metrics(eval_pred) -> Dict[str, float]`
- `log_metrics_to_wandb(metrics: dict, step: int, split: str) -> None`
- `decode_recording(audio_path: str, checkpoint_dir: Path, tokenizer_path: Path, max_length: int = 256) -> List[str]`
