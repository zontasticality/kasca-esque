from __future__ import annotations

from pathlib import Path
from typing import List

import torch
from transformers import GenerationConfig, PreTrainedTokenizerFast, WhisperFeatureExtractor, WhisperForConditionalGeneration

from .audio_utils import load_audio_16k


def decode_recording(
    audio_path: Path,
    checkpoint_dir: Path,
    tokenizer_dir: Path,
    *,
    base_model: str = "openai/whisper-small",
    max_length: int = 256,
) -> List[str]:
    """Load the latest checkpoint and decode a single recording into key tokens."""
    tokenizer = PreTrainedTokenizerFast.from_pretrained(tokenizer_dir)
    feature_extractor = WhisperFeatureExtractor.from_pretrained(base_model)
    model = WhisperForConditionalGeneration.from_pretrained(checkpoint_dir)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    waveform = load_audio_16k(audio_path)
    features = feature_extractor(waveform, sampling_rate=16000, return_tensors="pt")
    input_features = features.input_features.to(device)
    gen_config = GenerationConfig(
        max_length=max_length,
        pad_token_id=tokenizer.pad_token_id,
        eos_token_id=tokenizer.eos_token_id,
    )
    with torch.no_grad():
        generated = model.generate(input_features, generation_config=gen_config)
    decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
    return decoded[0].split()
