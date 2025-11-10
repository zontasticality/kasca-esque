from __future__ import annotations

from pathlib import Path

import librosa
import numpy as np
import soundfile as sf


def load_audio_16k(audio_path: Path) -> np.ndarray:
    """
    Load an audio file into a mono float32 numpy array at 16 kHz.

    Falls back to librosa when soundfile fails (e.g., webm with unusual encoding)
    so inference/training share identical behavior.
    """
    try:
        audio, sr = sf.read(audio_path)
    except Exception:
        audio, sr = librosa.load(audio_path, sr=None)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    if sr != 16000:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    return audio.astype(np.float32)
