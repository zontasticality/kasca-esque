# Fine‑tuning Gemini models on Vertex AI for audio tasks

## 1. What Vertex AI actually does when you “tune” Gemini

When you fine‑tune a Gemini model on Vertex AI, you are **not** retraining the base model end‑to‑end. Instead, Vertex AI uses **parameter‑efficient supervised fine‑tuning**, implemented internally via **LoRA‑style adapters**:

* The base Gemini model weights are frozen.
* A small set of low‑rank adapter matrices are inserted into attention and MLP layers.
* Only these adapters are trained during tuning.
* The result is a *tuned model resource* that references the base model + adapter weights.

Implications:

* Training is relatively fast and cheap compared to full retraining.
* You cannot export raw weights; the tuned model lives inside Vertex AI.
* Catastrophic forgetting is limited, but overfitting is still possible with small datasets.

Audio tuning uses the **same SFT pipeline** as text or image tuning—the only difference is the **input modality** in each training example.

Supported base models (as of Gemini 2.5):

* `gemini-2.5-flash`
* `gemini-2.5-pro`

Your link specifically targets **Gemini 2.5 Flash**, which is the recommended choice for audio tuning unless you need very deep reasoning.

---

## 2. What “audio tuning” means in practice

Audio tuning means:

> “Given an audio input (speech, sound, music, etc.), the model should produce a specific textual response.”

Typical objectives:

* Speech → transcription
* Speech → structured text (JSON, labels, tags)
* Sound → description
* Audio → instruction‑following behavior conditioned on sound

**Important**: Gemini audio tuning is *not* training a speech recognition acoustic model from scratch. Gemini already has an internal audio encoder. You are tuning **how the language model reacts to audio embeddings**.

This means:

* Dataset quality matters more than quantity.
* Alignment between audio and text must be extremely tight.

---

## 3. Dataset format (critical section)

Vertex AI expects **JSON Lines (JSONL)** format.
Each line = **one supervised training example**.

### 3.1 Core schema

Each example contains:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {"text": "<prompt or instruction>"},
        {
          "inline_data": {
            "mime_type": "audio/wav",
            "data": "<BASE64_AUDIO>"
          }
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {"text": "<target output text>"}
      ]
    }
  ]
}
```

Key points:

* `inline_data.data` **must** be base64‑encoded raw audio bytes.
* Supported audio MIME types:

  * `audio/wav`
  * `audio/mp3`
  * `audio/flac`
  * `audio/aac`
* Maximum request size is ~20 MB per example (keep audio short).

### 3.2 Minimal transcription example

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {"text": "Transcribe this audio verbatim."},
        {
          "inline_data": {
            "mime_type": "audio/wav",
            "data": "UklGRiQAAABXQVZFZm10IBAAAAABAAEA..."
          }
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {"text": "Hello, this is a test recording."}
      ]
    }
  ]
}
```

### 3.3 Design advice

* Keep the **prompt text identical** across examples unless variation is intentional.
* Do **not** include timestamps unless you want the model to learn timestamp formatting.
* Normalize transcripts (punctuation, casing) consistently.

---

## 4. Preparing a dataset from a directory of audio + text

Assume your local structure:

```
data/
├── sample001.wav
├── sample001.txt
├── sample002.wav
├── sample002.txt
└── ...
```

Where each `.txt` file contains the ground‑truth text for the audio.

### 4.1 Python script to generate JSONL

```python
import base64
import json
from pathlib import Path

DATA_DIR = Path("data")
OUTPUT = Path("train.jsonl")

PROMPT = "Transcribe this audio verbatim."

with OUTPUT.open("w") as out:
    for wav in DATA_DIR.glob("*.wav"):
        txt = wav.with_suffix(".txt")
        if not txt.exists():
            continue

        audio_bytes = wav.read_bytes()
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        target_text = txt.read_text().strip()

        example = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": PROMPT},
                        {
                            "inline_data": {
                                "mime_type": "audio/wav",
                                "data": audio_b64
                            }
                        }
                    ]
                },
                {
                    "role": "model",
                    "parts": [
                        {"text": target_text}
                    ]
                }
            ]
        }

        out.write(json.dumps(example) + "\n")
```

This produces a valid Vertex‑AI‑ready dataset.

---

## 5. Uploading the dataset to Google Cloud Storage

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Create bucket (once)
gsutil mb gs://YOUR_BUCKET_NAME

# Upload dataset
gsutil cp train.jsonl gs://YOUR_BUCKET_NAME/audio_tuning/train.jsonl
```

---

## 6. Starting the tuning job (Vertex AI SDK)

### 6.1 Python environment

```bash
pip install google-cloud-aiplatform
```

### 6.2 Launch tuning job

```python
from google.cloud import aiplatform

aiplatform.init(
    project="YOUR_PROJECT_ID",
    location="us-central1",
)

job = aiplatform.SupervisedTuningJob(
    display_name="gemini-audio-tune",
    source_model="gemini-2.5-flash",
    train_dataset_uri="gs://YOUR_BUCKET_NAME/audio_tuning/train.jsonl",
)

job.run()
```

Vertex AI will:

1. Validate dataset schema
2. Spin up tuning workers
3. Train LoRA adapters
4. Register a new tuned Gemini model

Typical training time: **minutes to ~1 hour** depending on dataset size.

---

## 7. Using the tuned model

Once complete, you receive a model resource ID:

```text
projects/…/locations/…/models/123456789
```

Inference example:

```python
from google.cloud import aiplatform

model = aiplatform.GenerativeModel(
    model_name="projects/.../models/123456789"
)

response = model.generate_content([
    {"text": "Transcribe this audio."},
    {
        "inline_data": {
            "mime_type": "audio/wav",
            "data": audio_b64
        }
    }
])

print(response.text)
```

---

## 8. Practical pitfalls and best practices

* **Audio length**: Keep under ~30s if possible.
* **Dataset size**: 100–1,000 high‑quality examples beats 10k noisy ones.
* **Evaluation set**: Hold out 5–10% of examples manually.
* **Prompt stability**: Changing prompts mid‑dataset confuses tuning.
* **Overfitting**: Watch for hallucinated filler text on short audio.

---

## 9. Mental model summary

Think of Gemini audio tuning as:

> “Teaching the language head how to *interpret* audio embeddings in a specific task‑shaped way, not teaching it how to hear from scratch.”

If you want, next we can:

* Design a **multi‑task** audio dataset (transcription + classification)
* Compare Gemini audio tuning vs Whisper‑style ASR
* Explore evaluation harnesses for audio LLMs
* Discuss cost scaling and dataset size curves
