

== Javascript Keyboard Event Codes

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

== Data Synchronization and Partitioning

`sync_recordings(base_url: str, cache_dir: Path) -> Path`
- Issues a JSON request to `<base_url>/recordings`, expecting each entry to expose `audio` and `keylog` filenames.
- Streams any missing files into `cache_dir` (chunk size 64 KiB) and deletes local artifacts whose names are no longer advertised, keeping the cache identical to production.
- Returns the resolved cache path so downstream steps (manifest building, token caching) can rely on a single canonical directory.

`hash_partition(recording_name: str, train_ratio: float = 0.9) -> str`
- Normalizes the provided filename (lowercase stem, no extension), hashes it with `hashlib.blake2s(digest_size=16)` for deterministic ordering, and compares the hash’s hex value against the global percentile cut.
- Returns the literal string `"train"` when the hash rank is below `train_ratio`, `"test"` otherwise; the mapping is stable across machines and avoids randomness.

== Manifest and Vocabulary Builders

`build_manifests(recordings_dir: Path, manifest_dir: Path) -> Tuple[Path, Path]`
- Walks every `*.json` under `recordings_dir`, ensures a sibling `.webm` exists, and loads its keystrokes/events array.
- Re-bases timestamps so the first event starts at `time = 0.0`, encodes event types as `{code, type}` where `type ∈ {"down", "up"}`, and attaches the hashed split from `hash_partition`.
- Writes newline-delimited JSON into `train.jsonl` / `eval.jsonl`, preserving on-disk `audio` paths so later stages can resolve files without additional lookup.

`collect_event_codes(recordings_dir: Path) -> List[str]`
- Scans every cached key log, accumulating distinct `KeyboardEvent.code` values and sorting them alphanumerically.
- Raises `RuntimeError` when the cache contains zero recognizable codes to fail fast before tokenizer creation.

`add_audio_path(example: dict, data_root: Path) -> dict`
- Accepts a manifest row, ensures the referenced `.webm` lives under `data_root`, and falls back to a `_DELETED.webm` variant when the original is soft-deleted.
- Mutates the row by inserting an absolute `audio` key so Hugging Face’s `Audio` feature can lazily decode and resample during dataset mapping.

== Tokenization and Feature Caching

`events_to_text(example: dict, vocab: Mapping[str, int]) -> dict`
- Sorts each example’s events chronologically, expands them into `"{code}_DOWN"` / `"{code}_UP"` tokens, and replaces unknown codes with `<unk>` before joining into a single space-delimited label string.
- Stores the serialized labels under `labels_text` while leaving the original structured events intact for potential visualization/debug passes.

`precompute_example_features(example: dict, tokens_dir: Path, feature_extractor, tokenizer) -> None`
- Ensures there is a split-specific folder such as `tokens/train` or `tokens/test`, keyed off the example’s deterministic split assignment.
- Runs `feature_extractor(..., return_tensors="pt")` on the raw audio array to get mel spectrograms, tokenizes `labels_text` with BOS/EOS markers, and saves both tensors via `torch.save` using the recording stem as the filename.
- Writes a compact sidecar JSON (e.g., `<stem>.meta.json`) capturing checksum, duration, and label length so resume jobs can quickly skip already-materialized entries.

`prepare_example(batch: dict) -> dict`
- Intended for `Dataset.map`, it loads the cached audio (already resampled to 16 kHz by `Audio`), runs the Whisper feature extractor, and flattens the resulting tensors to `batch["input_features"]`.
- Tokenizes `labels_text` with `add_special_tokens=True`, stores the integer list under `batch["labels"]`, and returns the enriched batch so the Trainer receives ready-to-batch PyTorch objects.

== Training Metrics and Evaluation

`compute_metrics(eval_pred) -> Dict[str, float]`
- Accepts the `(preds, labels)` tuple supplied by `Seq2SeqTrainer`, replaces `-100` positions in `labels` with the tokenizer’s pad token ID, and decodes both arrays with `skip_special_tokens=True`.
- Calculates full-sequence exact match accuracy plus token-level accuracy (position-wise comparison up to the shorter sequence length) and returns those floats for logging to stdout and wandb.

== Inference Utilities

`decode_recording(audio_path: str, max_length: int = 256) -> List[str]`
- Uses `soundfile` to load the waveform, resamples with `librosa` when the sample rate differs from 16 kHz, and feeds the tensor through the Whisper feature extractor before calling `model.generate`.
- Decodes the generated IDs back to strings and splits on whitespace, yielding an ordered list of predicted key tokens that downstream evaluation code can compare against ground truth logs.
