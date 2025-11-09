## Javascript Keyboard Event Codes

```python
KEY_CODES = [
    # Writing system keys (alphanumeric section)
    "Backquote", "Backslash", "BracketLeft", "BracketRight", "Comma", "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Equal", "IntlBackslash", "IntlRo", "IntlYen", "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK", "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT", "KeyU", "KeyV", "KeyW", "KeyX", "KeyY", "KeyZ", "Minus", "Period", "Quote", "Semicolon", "Slash",

    # Functional keys in the alphanumeric section
    "AltLeft", "AltRight", "Backspace", "CapsLock", "ContextMenu", "ControlLeft", "ControlRight", "Enter", "MetaLeft", "MetaRight", "ShiftLeft", "ShiftRight", "Space", "Tab",

    # Extra functional keys (Japanese/Korean layouts)
    "Convert", "KanaMode", "Lang1", "Lang2", "Lang3", "Lang4", "Lang5", "NonConvert",

    # Control pad section
    "Delete", "End", "Help", "Home", "Insert", "PageDown", "PageUp",

    # Arrow pad section
    "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp",

    # Numpad section
    "NumLock", "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9",
    "NumpadAdd", "NumpadBackspace", "NumpadClear", "NumpadClearEntry", "NumpadComma", "NumpadDecimal", "NumpadDivide", "NumpadEnter",
    "NumpadEqual", "NumpadHash", "NumpadMemoryAdd", "NumpadMemoryClear", "NumpadMemoryRecall", "NumpadMemoryStore", "NumpadMemorySubtract",
    "NumpadMultiply", "NumpadParenLeft", "NumpadParenRight", "NumpadStar", "NumpadSubtract",

    # Function section
    "Escape", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
    "Fn", "FnLock", "PrintScreen", "ScrollLock", "Pause",

    # Media / browser / system keys
    "BrowserBack", "BrowserFavorites", "BrowserForward", "BrowserHome", "BrowserRefresh", "BrowserSearch", "BrowserStop",
    "Eject", "LaunchApp1", "LaunchApp2", "LaunchMail", "MediaPlayPause", "MediaSelect", "MediaStop", "MediaTrackNext",
    "MediaTrackPrevious", "Power", "Sleep", "AudioVolumeDown", "AudioVolumeMute", "AudioVolumeUp", "WakeUp",

    # Legacy / non-standard / special keys
    "Hyper", "Super", "Turbo", "Abort", "Resume", "Suspend", "Again", "Copy", "Cut", "Find",
    "Open", "Paste", "Props", "Select", "Undo", "Hiragana", "Katakana", "Unidentified",
]
```

## Directory Layout & Modal Storage
- Mount `modal.Volume.from_name("kasca-data", create_if_missing=True)` at `/vol/kasca-data`. All scripts treat this as the root for durable assets.
- Required subfolders (auto-created on startup if missing):
  - `/vol/kasca-data/recordings` — mirrored `.webm` audio and `.json` key logs.
  - `/vol/kasca-data/manifests` — manifests plus `split_map.json` (filename → split) and `manifest.meta.json` (hash + schema version).
  - `/vol/kasca-data/tokens/train|test` — feature caches; each example stores `input_features.pt`, `labels.pt`, `attention_mask.pt`, and `<stem>.meta.json`.
  - `/vol/kasca-data/checkpoints` — `latest/`, `best/`, and timestamped folders such as `step-05000/` with model + optimizer + scheduler states.
  - `/vol/kasca-data/tokenizer` — artifacts from `materialize_tokenizer`.
- After each mutation (sync, manifest build, checkpoint save) call `kasca_volume.commit()` so other Modal functions pick up the changes without manual intervention.

## Modal Image & App Skeleton
```python
import modal

app = modal.App("whisper-eventcode")

base_image = (
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

kasca_volume = modal.Volume.from_name("kasca-data", create_if_missing=True)
wandb_secret = modal.Secret.from_name("wandb-secret")
```
- After building the image once, push it to a tagged registry (`whisper-eventcode:2024-05-17`) and reference by digest in all Modal functions to keep retrains reproducible until dependencies are intentionally bumped.
- `sync_recordings` and `prepare_dataset` run CPU-only.
- `train_eventcode_model` uses `gpu="A100-40GB"` with `timeout=12*60*60` for fast cold-start recovery. Multi-GPU is intentionally deferred because LoRA keeps per-step memory <20 GB and the dataset is <10 h; DDP overhead would outweigh gains until we scale data or unfreeze the full encoder.
- `decode_recording_fn` is exposed via `@app.webhook("decode")` or `@app.function` for CLI use; it operates on CPU but reads the latest checkpoint.

## Synchronization & Partitioning
`sync_recordings(base_url, kasca_volume, cache_subdir="recordings")`
- Issue `GET {base_url}/recordings` with 30s timeout.
- Expect each row to contain `audio` and `keylog` filenames; download missing files via streaming chunks (`chunk_size = 1 << 16`).
- Remove local files absent from the remote listing to keep the cache authoritative.
- At the end, write `sync.meta.json` summarizing timestamp, remote count, and sha256 of the listing, then call `kasca_volume.commit()`.

`hash_partition(recording_name, train_ratio=0.9)`
- Normalize to lowercase stem, generate `blake2s(digest_size=16)`, and map to train/test by comparing against the quantile derived from the sorted unique hashes.
- Persist the computed map to `manifests/split_map.json` so later reruns never re-hash existing files.

`build_manifests(recordings_dir, manifest_dir)`
- Iterate over every `*.json` with a sibling `.webm`.
- Normalize timestamps relative to the first keystroke; store for each event `{time: float seconds, code: str, type: "down"|"up"}`.
- Attach metadata: `split`, `recording_sha256`, `duration`, `num_events`, `audio_rel_path`.
- Write newline-delimited JSON to `train.jsonl` and `eval.jsonl`, followed by `manifest.meta.json` containing dataset counts, schema version, and the git commit SHA that produced it.

## Tokenizer & Vocabulary
`collect_event_codes(recordings_dir)`
- Load every key log and accumulate unique codes; error if none are discovered.

`materialize_tokenizer(codes, output_dir)`
- Build vocab = special tokens (`<pad>`, `<s>`, `</s>`, `<unk>`) + `f"{code}_{state}"` for `state ∈ {"DOWN", "UP"}`.
- Use `tokenizers.Tokenizer(WordLevel(...))` + `PreTrainedTokenizerFast` wrapper, `padding_side="right"`.
- Save `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, plus `codes.json` for auditing.

`events_to_text(manifest_row, vocab)`
- Sort events by `time`, convert to `code_state` tokens, drop anything unknown (`<unk>` fallback), and store `labels_text`.

## Feature Cache & Dataset Preparation
`precompute_example_features(manifest_row, tokens_dir, feature_extractor, tokenizer)`
- Use `datasets.Audio` to load the audio array at 16 kHz.
- Run `WhisperFeatureExtractor(..., return_tensors="pt")` to produce mel features and attention masks.
- Tokenize `labels_text` with BOS/EOS; convert to tensors and save via `torch.save` to `tokens/<split>/<stem>.pt` (dictionary with `input_features`, `labels`, `attention_mask`).
- Write `<stem>.meta.json` capturing `duration`, `num_frames`, `num_labels`, `split`, `hash`.
- Skips existing cache entries if the meta file’s checksum matches the manifest; otherwise recompute.

`prepare_example(batch, feature_cache_root)`
- When mapping over a `Dataset`, attempt to load the cached tensor file; on miss, recompute features (and write them back) before returning the batch.
- Ensure outputs always include `input_features`, `labels`, and `attention_mask` as torch tensors on CPU.

`add_audio_path(example, data_root)`
- Resolve `example["audio_file"]` against `data_root`; if missing, try `_DELETED.webm`. Raises `FileNotFoundError` when neither exists.

## Training Loop & Checkpointing
`load_or_download_checkpoint(model_dir, base_model)`
- If `checkpoints/latest/` exists, load the saved `pytorch_model.bin`, `optimizer.pt`, `scheduler.pt`, `scaler.pt`, and return them with the latest step count.
- Otherwise download `base_model` via `WhisperForConditionalGeneration.from_pretrained` into a temp dir on ephemeral storage, copy into `/vol/kasca-data/base_models/base`, and initialize decoder weights plus LoRA adapters.

`train_eventcode_model`
- Build `Seq2SeqTrainer` or custom loop using `Accelerator(mixed_precision="bf16")` for the single A100.
- Consume cached datasets with `DataLoader` (`num_workers=4`, `pin_memory=True`, `persistent_workers=True`).
- Apply gradient accumulation to reach effective batch size 32; clip gradients at 1.0.
- Every 500 optimizer steps, call `save_checkpoint` to write `model`, `optimizer`, `scheduler`, `scaler`, and `trainer_state.json`.
- Maintain symlinks (or text files) `checkpoints/latest` and `checkpoints/best` pointing to folders.
- Default LoRA configuration: rank 16, α 32 (≈2×rank), dropout 0.05 on adapter outputs, adapters on encoder attention Q/K/V/O projections only. When validation metrics plateau below spec targets for ≥2 epochs (saturation), launch short sweeps with rank {16, 32}, α = 2×rank, dropout {0.05, 0.1}. Promote the best configuration if it yields >1–2% accuracy gains; otherwise consider expanding adapter coverage or unfreezing the encoder once more data is available.

`save_checkpoint(model_state, checkpoint_dir, tag)`
- Create `checkpoint_dir/tag`, write HF-compatible `pytorch_model.bin` plus `adapter_config.json` (for LoRA) and `tokenizer_config.json` copy.
- Update `latest` symlink, prune older checkpoints beyond the most recent three in addition to `best`.

## Metrics, Logging & Alerts
`compute_metrics(eval_pred)`
- Replace `-100` with pad token IDs, decode predictions and labels, compute sequence + token accuracy, and optionally compute Levenshtein distance for diagnostics.
- Return metrics dict enriched with `eval_loss` if provided by the trainer. `sequence_accuracy` should be treated as a whole-timeline match (all tokens correct, including DOWN/UP ordering) so it plays the role of “sentence accuracy” for keyboard sequences, while `token_accuracy` surfaces per-event drift.

`log_metrics_to_wandb(metrics, step, split)`
- Initialize wandb run once per process using `os.environ["WANDB_API_KEY"]` from the Modal secret.
- Log metrics with tags `{ "split": split }` plus config info (manifest hash, hyperparams).
- When `split ## "test"` and `token_accuracy` improves, log the checkpoint path as a wandb artifact.

If `token_accuracy_test` drops by more than 5% compared to the previous evaluation, emit a `wandb.alert` and raise `RuntimeError` to end the run early.

## Inference Utilities
`decode_recording(audio_path, checkpoint_dir, tokenizer_path, max_length=256)`
- Load waveform with `soundfile`; resample using `librosa` if sampling rate ≠ 16 kHz.
- Run `feature_extractor` to get `input_features`, move to GPU (or CPU for the webhook), and call `model.generate` with `generation_config = GenerationConfig(max_length=max_length, pad_token_id=tokenizer.pad_token_id, eos_token_id=tokenizer.eos_token_id)`.
- Decode tokens back to strings, split on whitespace, and return for downstream comparison.

`decode_recording_fn`
- HTTP/CLI entry point that accepts either an uploaded `.webm` or a filename referencing `/vol/kasca-data/recordings`.
- Loads the `best` checkpoint, runs `decode_recording`, and responds with both predicted tokens and the ground-truth sequence (if available) plus any mismatches.

## Automation Hooks
- `sync_recordings` is decorated with `@app.function(schedule=modal.Period(minutes=15), retries=3)` to keep data fresh.
- `prepare_dataset` can be exposed as `modal.Cron` or CLI to rebuild manifests/tokenizer/tokens; it validates that `len(tokens/train)` equals the number of manifest rows assigned to train.
- `train_eventcode_model` expects `prepare_dataset` to have run successfully; it asserts caches exist before launching training.
