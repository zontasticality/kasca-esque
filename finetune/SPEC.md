# Finetuning Whisper with Custom Decoder

Goal:
 - Finetune a Whisper checkpoint of a certain size on the recordings available at https://kasca-esque.fly.dev/recordings
 - Whisper encoder model will be fully trained together with a custom decoder that specifically outputs tokens corresponding to javascript's key event codes.

Implementation Guidance:
 - Use the `kasca-data` volume to store and load training periodically in a `checkpoints` subfolder. Check if checkpoint exists before downloading base model.
 - Actively download and synchronize recordings between the fly.dev server and a `kasca-data` volume subfolder called `recordings` to avoid re-downloading at startup. This should be a separate script that is callable from the main script (or comment-out-able if we know there are no new recordings).
 - Mel diagram and token data for all data examples should be pre-computed and stored to a `kasca-data` `tokens` subfolder so training is fast to resume.
 - These token files should be clearly marked train or test, and this marking should be based on the hash of the name of the original file from `recordings` for reproducibility of train/test split. To get a split, hash all the names, sort them, and then take the top `90%` of the hashes to train, the rest for test.
 - Training should at the start and periodically after that calculate train and test validation, sending to wandb. Use the secrets capabilities of modal, the secret name is `wandb-secret`.

## Component Functions

- `sync_recordings(base_url: str, kasca_volume: Path, cache_subdir: str = "recordings")`: hits `/recordings` on the deployed app, mirrors any listed `.webm`/`.json` into the local volume, and prunes local files not advertised upstream so cached assets always match production without manual cleanup.
- `hash_partition(recording_name: str, train_ratio: float = 0.9) -> Literal["train", "test"]`: deterministically maps each recording filename to the train/test split by hashing, sorting, and comparing against the configured ratio so future runs reuse the same partitioning.
- `build_manifests(recordings_dir: Path, manifest_dir: Path)`: walks synchronized recordings, normalizes key timestamps relative to the first event, enforces that every JSON has a sibling audio file, and writes train/test JSONL manifests whose split membership comes directly from `hash_partition`.
- `collect_event_codes(recordings_dir: Path) -> List[str]`: scans every cached key log to build the definitive set of observed `KeyboardEvent.code` values that drive both the tokenizer vocabulary and the decoder head configuration.
- `events_to_text(manifest_row: dict, vocab: Mapping[str, int]) -> dict`: sorts each manifest row’s events chronologically, converts them into `CODE_DOWN` / `CODE_UP` tokens, replaces anything outside the known vocab with `<unk>`, and returns a space-delimited label string for downstream tokenization.
- `precompute_example_features(manifest_row: dict, tokens_dir: Path, feature_extractor, tokenizer)`: materializes mel spectrogram tensors and decoder label IDs to disk (under `tokens/train` or `tokens/test` based on the hashed split) so training or resumption can memory-map cached features instead of recomputing them.
- `prepare_example(batch: dict) -> dict`: the map-style dataset hook that loads cached audio, runs the Whisper feature extractor with `return_tensors="pt"`, tokenizes the label text with BOS/EOS markers, and outputs tensors the trainer expects.
- `compute_metrics(eval_pred) -> Dict[str, float]`: decodes predictions/labels back to token strings, computes both exact sequence accuracy and token-level accuracy, and feeds results into wandb.
- `decode_recording(audio_path: str, max_length: int = 256) -> List[str]`: lightweight inference helper that loads a `.webm`, resamples to 16 kHz, runs `model.generate`, and returns the decoded key tokens for smoke tests on newly recorded audio.
- `add_audio_path(example: dict, data_root: Path) -> dict`: when reading historical JSON dumps, resolves the correct `.webm` path (falling back to `_DELETED` suffixed files) and stamps it into the dataset’s `audio` column before casting with `datasets.Audio`.
