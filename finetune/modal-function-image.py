import modal

app = modal.App("whisper-eventcode")

whisper_image = (
    modal.Image.debian_slim(python_version="3.12")
    # System deps: ffmpeg for audio / media, useful for torchcodec + audio pipelines
    .apt_install("ffmpeg")
    # Python deps: notebook requirements + torchcodec
    .uv_pip_install(
        # Core numeric / HTTP
        "numpy",
        "requests",
        # Audio / IO stack
        "soundfile",  # import soundfile as sf
        "librosa",
        "datasets[audio]>=2.19.0",  # for datasets.Audio
        # Modeling stack
        "torch==2.9.0",
        "torchaudio==2.9.0",
        "transformers>=4.44.0",
        "accelerate>=0.33.0",
        "peft>=0.12.0",
        "tokenizers>=0.15.0",
        "evaluate",
        # Media decoding
        "torchcodec==0.8.*",
    )
)


@app.function(image=whisper_image)
def run_notebook_bits():
    # Copy code cells from whisper-eventcode-plan.ipynb into functions like this.
    # Keep imports inside the function body so they resolve inside the Modal image.
    import torch
    import librosa
    import soundfile as sf
    from datasets import Audio, load_dataset
    from peft import LoraConfig, TaskType, get_peft_model
    from tokenizers import Tokenizer
    from tokenizers.models import WordLevel
    from tokenizers.pre_tokenizers import Whitespace
    from torch import nn
    from transformers import GenerationConfig

    # ...
    return "ok"
