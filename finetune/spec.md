# Whisper LoRA Keyboard Event Detection - Technical Specification

## Overview

This project fine-tunes OpenAI's Whisper model to detect keyboard events from audio recordings. The approach uses LoRA (Low-Rank Adaptation) on Whisper's encoder while implementing a fully custom decoder designed specifically for predicting sequences of keyboard key-up and key-down events.

## Objective

Transform keyboard typing audio into precise sequences of key events (keydown/keyup), enabling reconstruction of typing behavior from audio alone.

## Architecture

### Transformers-First Requirement

All model, tokenizer, processor, and training orchestration code **must reuse Hugging Face's `transformers` library classes instead of recreating equivalent logic**. Concretely:
- Load and configure Whisper through `WhisperForConditionalGeneration`, `WhisperProcessor`, and related utilities (never write custom encoder/decoder layers that duplicate Whisper internals).
- Extend or wrap existing `transformers` abstractions (e.g., `PreTrainedTokenizer`, `GenerationConfig`, `Seq2SeqTrainer`) whenever customization is unavoidable.
- Use library-provided generation, scheduling, and optimization helpers rather than reimplementing them from scratch.
- Contribute any missing glue code via lightweight adapters that defer the heavy lifting to `transformers`.

### Encoder: Whisper with LoRA

**Base Model**: OpenAI Whisper (size TBD: tiny/base/small/medium/large)

**Adaptation Strategy**: LoRA applied to encoder only
- Target modules: Query, Key, Value projection matrices in self-attention layers
- Rank: 8-16 (to be determined via experimentation)
- Alpha: 16-32 (scaling factor)
- Dropout: 0.1

### Decoder: Whisper Decoder with Resized Vocabulary

**Approach**: Use Whisper's pretrained decoder with vocabulary resized to keyboard event tokens

**Implementation**:
- Load `WhisperForConditionalGeneration`
- Resize token embeddings to our vocabulary size (168 tokens)
- Replace Whisper's tokenizer with our custom KeyboardEventTokenizer
- Whisper's decoder architecture is preserved (6 layers for tiny, more for larger models)
- Only the embedding and output projection layers are reinitialized
- Generation logic (beam search, sampling, etc.) must call `model.generate` with a configured `GenerationConfig` instead of reimplementing decoders.

## Tokenization System

### Token Design Philosophy

Tokenization is based on **JavaScript KeyboardEvent.code** values, which represent physical keys on the keyboard rather than characters. This approach:
- Eliminates duplication between uppercase/lowercase (both 'a' and 'A' map to `KeyA`)
- Eliminates duplication between shifted symbols ('1' and '!' both map to `Digit1`)
- Uses standardized web API values
- Represents physical keyboard layout

Each token represents a unique combination of:
1. Physical key code (KeyboardEvent.code)
2. Event type (keydown or keyup)

Format: `{code}_{event_type}`

Examples: `KeyA_down`, `KeyA_up`, `ShiftLeft_down`, `ShiftLeft_up`, `Enter_down`, `Enter_up`

### Complete Token List

Each physical key generates two tokens: one for keydown event and one for keyup event.

**Special Tokens (2 tokens)**:
- `<BOS>` - Beginning of sequence (ID: 0)
- `<EOS>` - End of sequence (ID: 1)

**Physical Keys (83 keys → 166 event tokens)**:

**Alphanumeric Section (47 keys)**:
- Letters: `KeyA`, `KeyB`, `KeyC`, `KeyD`, `KeyE`, `KeyF`, `KeyG`, `KeyH`, `KeyI`, `KeyJ`, `KeyK`, `KeyL`, `KeyM`, `KeyN`, `KeyO`, `KeyP`, `KeyQ`, `KeyR`, `KeyS`, `KeyT`, `KeyU`, `KeyV`, `KeyW`, `KeyX`, `KeyY`, `KeyZ`
- Digits: `Digit0`, `Digit1`, `Digit2`, `Digit3`, `Digit4`, `Digit5`, `Digit6`, `Digit7`, `Digit8`, `Digit9`
- Punctuation: `Minus`, `Equal`, `BracketLeft`, `BracketRight`, `Backslash`, `Semicolon`, `Quote`, `Backquote`, `Comma`, `Period`, `Slash`

**Modifier Keys (9 keys)**:
`ShiftLeft`, `ShiftRight`, `ControlLeft`, `ControlRight`, `AltLeft`, `AltRight`, `MetaLeft`, `MetaRight`, `CapsLock`

**Whitespace & Editing (5 keys)**:
`Space`, `Tab`, `Enter`, `Backspace`, `Delete`

**Navigation Keys (10 keys)**:
`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `PageUp`, `PageDown`, `Insert`, `Escape`

**Function Keys (12 keys)**:
`F1`, `F2`, `F3`, `F4`, `F5`, `F6`, `F7`, `F8`, `F9`, `F10`, `F11`, `F12`

*Note*: Additional codes like IntlBackslash, NumpadXX, and media keys can be added if needed for international keyboards or extended functionality.

### Vocabulary Size Summary

| Category | Keys | Tokens (×2) |
|----------|------|-------------|
| Alphanumeric | 47 | 94 |
| Modifiers | 9 | 18 |
| Whitespace & Editing | 5 | 10 |
| Navigation | 10 | 20 |
| Function Keys | 12 | 24 |
| Special Tokens | — | 2 |
| **Total** | **83 physical keys** | **168 tokens** |

**Final Vocabulary Size**: 256 (power of 2, allows for future expansion)

### Tokenizer Implementation

```python
class KeyboardEventTokenizer(PreTrainedTokenizer):
    def __init__(self):
        self.event_types = ['down', 'up']
        self.special_tokens = ['<BOS>', '<EOS>']

        # Physical key codes (KeyboardEvent.code)
        self.codes = [
            # Letters (26)
            *[f'Key{chr(i)}' for i in range(ord('A'), ord('Z') + 1)],
            # Digits (10)
            *[f'Digit{i}' for i in range(10)],
            # Punctuation (11)
            'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
            'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash',
            # Modifiers (9)
            'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
            'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock',
            # Whitespace & Editing (5)
            'Space', 'Tab', 'Enter', 'Backspace', 'Delete',
            # Navigation (10)
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Escape',
            # Function Keys (12)
            *[f'F{i}' for i in range(1, 13)],
        ]

        # Mapping from event.key to event.code for legacy dataset compatibility
        self.key_to_code = {
            # Letters - lowercase map to KeyX
            **{chr(i): f'Key{chr(i).upper()}' for i in range(ord('a'), ord('z') + 1)},
            # Letters - uppercase map to KeyX (same as lowercase)
            **{chr(i): f'Key{chr(i)}' for i in range(ord('A'), ord('Z') + 1)},
            # Digits and their shifted symbols
            '0': 'Digit0', ')': 'Digit0',
            '1': 'Digit1', '!': 'Digit1',
            '2': 'Digit2', '@': 'Digit2',
            '3': 'Digit3', '#': 'Digit3',
            '4': 'Digit4', '$': 'Digit4',
            '5': 'Digit5', '%': 'Digit5',
            '6': 'Digit6', '^': 'Digit6',
            '7': 'Digit7', '&': 'Digit7',
            '8': 'Digit8', '*': 'Digit8',
            '9': 'Digit9', '(': 'Digit9',
            # Punctuation
            '-': 'Minus', '_': 'Minus',
            '=': 'Equal', '+': 'Equal',
            '[': 'BracketLeft', '{': 'BracketLeft',
            ']': 'BracketRight', '}': 'BracketRight',
            '\\': 'Backslash', '|': 'Backslash',
            ';': 'Semicolon', ':': 'Semicolon',
            "'": 'Quote', '"': 'Quote',
            '`': 'Backquote', '~': 'Backquote',
            ',': 'Comma', '<': 'Comma',
            '.': 'Period', '>': 'Period',
            '/': 'Slash', '?': 'Slash',
            # Whitespace & Editing
            ' ': 'Space',
            'Tab': 'Tab',
            'Enter': 'Enter',
            'Backspace': 'Backspace',
            'Delete': 'Delete', 'DELETE': 'Delete',
            # Modifiers
            'Shift': 'ShiftLeft',  # Generic shift maps to left
            'SHIFT_R': 'ShiftRight',
            'Control': 'ControlLeft',
            'CTRL_L': 'ControlLeft',
            'CTRL_R': 'ControlRight',
            'Alt': 'AltLeft',
            'ALT_GR': 'AltRight',
            'CMD': 'MetaLeft',
            'Meta': 'MetaLeft',
            'CAPS_LOCK': 'CapsLock',
            'CapsLock': 'CapsLock',
            # Navigation
            'ArrowLeft': 'ArrowLeft', 'LEFT': 'ArrowLeft',
            'ArrowRight': 'ArrowRight', 'RIGHT': 'ArrowRight',
            'ArrowUp': 'ArrowUp', 'UP': 'ArrowUp',
            'ArrowDown': 'ArrowDown', 'DOWN': 'ArrowDown',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown',
            'Insert': 'Insert',
            'Escape': 'Escape',
            # Function Keys
            **{f'F{i}': f'F{i}' for i in range(1, 13)},
        }

        # Build vocabulary
        self.vocab = {}
        self.id_to_token = {}

        # Add special tokens
        for i, token in enumerate(self.special_tokens):
            self.vocab[token] = i
            self.id_to_token[i] = token

        # Add key code event tokens
        idx = len(self.special_tokens)
        for code in self.codes:
            for event_type in self.event_types:
                token = f"{code}_{event_type}"
                self.vocab[token] = idx
                self.id_to_token[idx] = token
                idx += 1

    def encode(self, events):
        """Convert list of key events to token IDs

        Handles both legacy event.key format and new event.code format.
        """
        token_ids = [self.vocab['<BOS>']]
        for event in events:
            # Try to get code directly, or map from key
            code = event.get('code')
            if not code:
                key = event.get('key', '')
                code = self.key_to_code.get(key)

            if code:
                event_type = event['event_type'].replace('key', '')  # keydown -> down
                token = f"{code}_{event_type}"
                if token in self.vocab:
                    token_ids.append(self.vocab[token])
                # Skip unknown codes silently

        token_ids.append(self.vocab['<EOS>'])
        return token_ids

    def decode(self, token_ids):
        """Convert token IDs back to key events with code values"""
        events = []
        for token_id in token_ids:
            if token_id in [0, 1]:  # Skip <BOS> and <EOS>
                continue
            token = self.id_to_token.get(token_id)
            if token and '_' in token:
                code, event_type = token.rsplit('_', 1)
                events.append({
                    'code': code,
                    'event_type': f'key{event_type}'
                })
        return events
```

Implement the tokenizer as either a `PreTrainedTokenizer` subclass or a `PreTrainedTokenizerFast` wrapper so that it can be bundled inside a `WhisperProcessor` via `WhisperProcessor(feature_extractor=WhisperFeatureExtractor.from_pretrained(...), tokenizer=keyboard_tokenizer)`. This ensures downstream code can call `processor(audio=..., text=...)` and `model.generate` without custom preprocessing/postprocessing pipelines.

## Data Pipeline

### Input: Audio Files
- Format: WebM (from recordings)
- Sample rate: Convert to 16kHz (Whisper's expected input)
- Processing: Convert to log-mel spectrogram (80 bins, same as Whisper)

### Output: Key Event Sequences
- Format: JSON with keystrokes array
- Fields per event:
  - `code`: Physical key code (KeyboardEvent.code) - **preferred for new recordings**
  - `key`: Key character (KeyboardEvent.key) - legacy field, will be mapped to code
  - `event_type`: "keydown" or "keyup"

**Note**: The tokenizer supports both formats. Legacy recordings with only `key` field will be automatically mapped to `code` values using the key_to_code mapping.

### Dataset Structure

Located in `../recordings/`:
- Audio files: `{name}.webm`
- Event files: `{name}.json`

**Observed patterns**:
- `qt_{timestamp}_{type}.{ext}` (QuickType recordings)
- `recording_{timestamp}.{ext}` (generic recordings)
- Types: `email_1`, `free_form`

### Data Loading

```python
class KeyboardEventDataset:
    def __init__(self, recordings_dir):
        self.recordings_dir = recordings_dir
        self.pairs = self._find_pairs()
        self.tokenizer = KeyboardEventTokenizer.from_pretrained("local/keyboard-whisper-tokenizer")
        self.processor = WhisperProcessor(feature_extractor=WhisperFeatureExtractor(), tokenizer=self.tokenizer)

    def _find_pairs(self):
        # Match .webm and .json files
        pairs = []
        json_files = glob(f"{self.recordings_dir}/*.json")
        for json_path in json_files:
            if 'DELETED' in json_path:
                continue
            base = json_path.replace('.json', '')
            webm_path = f"{base}.webm"
            if os.path.exists(webm_path):
                pairs.append((webm_path, json_path))
        return pairs

    def __getitem__(self, idx):
        audio_path, json_path = self.pairs[idx]

        # Load audio
        audio, sr = librosa.load(audio_path, sr=16000)

        # Extract features (mel spectrogram)
        features = self.processor.feature_extractor(
            audio,
            sampling_rate=16000,
            return_tensors="pt"
        )

        # Load events
        with open(json_path, 'r') as f:
            data = json.load(f)

        # Tokenize events
        token_ids = self.tokenizer.encode(data['keystrokes'])

        return {
            'input_features': features.input_features[0],
            'labels': torch.tensor(token_ids),
        }
```

### Data Preprocessing

1. **Audio normalization**: Normalize to [-1, 1] range
2. **Sequence length**: Pad/truncate to max length (e.g., 1024 tokens)
3. **Train/val split**: 80/20 or by file pattern

## Training Configuration

### Loss Function

**Primary**: Cross-entropy loss on token predictions

**Considerations**:
- Ignore padding tokens in loss calculation

### Optimization

- **Optimizer**: AdamW
- **Learning rate**: 1e-4 to 5e-4 (warm-up over 500 steps)
- **Weight decay**: 0.01
- **Batch size**: 4-16 (depending on GPU memory)
- **Gradient accumulation**: 2-4 steps if needed
- **Mixed precision**: FP16 or BF16 training

### Training Strategy

1. **Freeze encoder**: Initially freeze Whisper encoder, train decoder only
2. **Unfreeze LoRA**: After decoder converges, enable LoRA training
3. **Joint training**: Fine-tune encoder (LoRA) + decoder together
4. **Gradient checkpointing**: Enable if memory constrained
5. **Trainer orchestration**: Prefer `Seq2SeqTrainer`/`Trainer` from `transformers` for training loops so evaluation, checkpointing, and LR scheduling reuse hardened implementations.

### Hyperparameters

- **Max sequence length**: 1024 tokens
- **Warmup steps**: 500
- **Total steps**: 10,000-50,000 (depends on dataset size)
- **Evaluation frequency**: Every 500 steps
- **Early stopping**: Patience of 5 evaluations

### Hardware Requirements

- **Minimum**: 1× GPU with 8GB VRAM (e.g., RTX 3070, T4)
- **Recommended**: 1× GPU with 16GB+ VRAM (e.g., A100, V100)
- **Training time**: ~4-12 hours (depending on dataset size and GPU)

## Evaluation Metrics

### 1. Token-Level Accuracy
- Exact match of predicted token vs. ground truth
- Calculated excluding padding tokens

### 2. Event-Level Metrics
- **Precision**: What fraction of predicted events are correct?
- **Recall**: What fraction of actual events were predicted?
- **F1 Score**: Harmonic mean of precision and recall

### 3. Sequence-Level Metrics
- **Edit distance**: Levenshtein distance between predicted and actual sequences
- **Sequence accuracy**: Percentage of completely correct sequences

### 4. Key-Specific Metrics
- Per-key accuracy (e.g., how well does it detect "a" vs "Shift"?)
- Confusion matrix for common errors

## Technical Stack

### Required Libraries
- `torch` (>= 2.0.0)
- `transformers` (>= 4.30.0)
- `peft` (for LoRA)
- `datasets` (for data loading)
- `librosa` (for audio processing)
- `soundfile` (audio I/O)
- `wandb` or `tensorboard` (logging)
- `evaluate` (metrics)

### Development Environment
- Python 3.10+
- CUDA 11.8+ (for GPU training)
- uv (project dependency management)
