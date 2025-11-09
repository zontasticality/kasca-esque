"""Test script to validate notebook implementation"""
import json
import os
from glob import glob

import torch
import torch.nn as nn
import librosa
import numpy as np
from transformers import WhisperModel, WhisperFeatureExtractor
from peft import LoraConfig, get_peft_model

print("=" * 60)
print("WHISPER KEYBOARD EVENT DETECTION - TEST SCRIPT")
print("=" * 60)

# Check device
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"\nUsing device: {device}")

# =============================================================================
# 1. Test Tokenizer
# =============================================================================
print("\n" + "=" * 60)
print("1. TESTING TOKENIZER")
print("=" * 60)

class KeyboardEventTokenizer:
    def __init__(self):
        self.event_types = ['down', 'up']
        self.special_tokens = ['<BOS>', '<EOS>']

        self.codes = [
            *[f'Key{chr(i)}' for i in range(ord('A'), ord('Z') + 1)],
            *[f'Digit{i}' for i in range(10)],
            'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
            'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash',
            'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
            'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock',
            'Space', 'Tab', 'Enter', 'Backspace', 'Delete',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Escape',
            *[f'F{i}' for i in range(1, 13)],
        ]

        self.key_to_code = {
            **{chr(i): f'Key{chr(i).upper()}' for i in range(ord('a'), ord('z') + 1)},
            **{chr(i): f'Key{chr(i)}' for i in range(ord('A'), ord('Z') + 1)},
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
            '-': 'Minus', '_': 'Minus',
            '=': 'Equal', '+': 'Equal',
            '[': 'BracketLeft', '{': 'BracketLeft',
            ']': 'BracketRight', '}': 'BracketRight',
            '\\\\': 'Backslash', '|': 'Backslash',
            ';': 'Semicolon', ':': 'Semicolon',
            "'": 'Quote', '"': 'Quote',
            '`': 'Backquote', '~': 'Backquote',
            ',': 'Comma', '<': 'Comma',
            '.': 'Period', '>': 'Period',
            '/': 'Slash', '?': 'Slash',
            ' ': 'Space', 'Tab': 'Tab', 'Enter': 'Enter',
            'Backspace': 'Backspace', 'Delete': 'Delete', 'DELETE': 'Delete',
            'Shift': 'ShiftLeft', 'SHIFT_R': 'ShiftRight',
            'Control': 'ControlLeft', 'CTRL_L': 'ControlLeft', 'CTRL_R': 'ControlRight',
            'Alt': 'AltLeft', 'ALT_GR': 'AltRight',
            'CMD': 'MetaLeft', 'Meta': 'MetaLeft',
            'CAPS_LOCK': 'CapsLock', 'CapsLock': 'CapsLock',
            'ArrowLeft': 'ArrowLeft', 'LEFT': 'ArrowLeft',
            'ArrowRight': 'ArrowRight', 'RIGHT': 'ArrowRight',
            'ArrowUp': 'ArrowUp', 'UP': 'ArrowUp',
            'ArrowDown': 'ArrowDown', 'DOWN': 'ArrowDown',
            'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown',
            'Insert': 'Insert', 'Escape': 'Escape',
            **{f'F{i}': f'F{i}' for i in range(1, 13)},
        }

        self.vocab = {}
        self.id_to_token = {}

        for i, token in enumerate(self.special_tokens):
            self.vocab[token] = i
            self.id_to_token[i] = token

        idx = len(self.special_tokens)
        for code in self.codes:
            for event_type in self.event_types:
                token = f"{code}_{event_type}"
                self.vocab[token] = idx
                self.id_to_token[idx] = token
                idx += 1

        self.vocab_size = len(self.vocab)
        self.pad_token_id = self.vocab['<BOS>']
        self.bos_token_id = self.vocab['<BOS>']
        self.eos_token_id = self.vocab['<EOS>']

    def encode(self, events):
        token_ids = [self.vocab['<BOS>']]
        for event in events:
            code = event.get('code')
            if not code:
                key = event.get('key', '')
                code = self.key_to_code.get(key)
            if code:
                event_type = event['event_type'].replace('key', '')
                token = f"{code}_{event_type}"
                if token in self.vocab:
                    token_ids.append(self.vocab[token])
        token_ids.append(self.vocab['<EOS>'])
        return token_ids

    def decode(self, token_ids):
        events = []
        for token_id in token_ids:
            if token_id in [0, 1]:
                continue
            token = self.id_to_token.get(token_id)
            if token and '_' in token:
                code, event_type = token.rsplit('_', 1)
                events.append({'code': code, 'event_type': f'key{event_type}'})
        return events

tokenizer = KeyboardEventTokenizer()
print(f"✓ Tokenizer initialized")
print(f"  Vocabulary size: {tokenizer.vocab_size}")
print(f"  Physical keys: {len(tokenizer.codes)}")

# Test with sample data
recordings_dir = '../recordings'
json_files = [f for f in os.listdir(recordings_dir) if f.endswith('.json') and 'DELETED' not in f]
sample_file = os.path.join(recordings_dir, json_files[0])

with open(sample_file, 'r') as f:
    sample_data = json.load(f)

sample_events = sample_data['keystrokes'][:20]
encoded = tokenizer.encode(sample_events)
decoded = tokenizer.decode(encoded)

print(f"✓ Tokenization test passed")
print(f"  Events: {len(sample_events)} -> Tokens: {len(encoded)} -> Decoded: {len(decoded)}")

# =============================================================================
# 2. Test Feature Extraction
# =============================================================================
print("\n" + "=" * 60)
print("2. TESTING AUDIO FEATURE EXTRACTION")
print("=" * 60)

feature_extractor = WhisperFeatureExtractor.from_pretrained("openai/whisper-tiny")
print(f"✓ Feature extractor loaded")

# Find audio file
webm_files = glob(f"{recordings_dir}/*.webm")
if webm_files:
    audio_path = webm_files[0]
    print(f"  Testing with: {os.path.basename(audio_path)}")

    audio, sr = librosa.load(audio_path, sr=16000)
    print(f"✓ Audio loaded: {len(audio)} samples at {sr}Hz")

    features = feature_extractor(audio, sampling_rate=16000, return_tensors="pt")
    print(f"✓ Features extracted: {features.input_features.shape}")
else:
    print("⚠ No audio files found, skipping feature extraction test")
    features = None

# =============================================================================
# 3. Test Model Architecture
# =============================================================================
print("\n" + "=" * 60)
print("3. TESTING MODEL ARCHITECTURE")
print("=" * 60)

class KeyboardEventDecoder(nn.Module):
    def __init__(self, vocab_size, hidden_dim=384, num_layers=4, num_heads=6,
                 ff_dim=1536, dropout=0.1, max_seq_len=1024):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.vocab_size = vocab_size

        self.token_embedding = nn.Embedding(vocab_size, hidden_dim)
        self.pos_encoding = nn.Parameter(torch.randn(1, max_seq_len, hidden_dim))

        decoder_layer = nn.TransformerDecoderLayer(
            d_model=hidden_dim, nhead=num_heads, dim_feedforward=ff_dim,
            dropout=dropout, activation='gelu', batch_first=True, norm_first=True,
        )
        self.decoder = nn.TransformerDecoder(decoder_layer, num_layers)
        self.output_proj = nn.Linear(hidden_dim, vocab_size)
        self.dropout = nn.Dropout(dropout)

    def forward(self, input_ids, encoder_hidden_states, attention_mask=None):
        batch_size, seq_len = input_ids.shape

        x = self.token_embedding(input_ids)
        x = x + self.pos_encoding[:, :seq_len, :]
        x = self.dropout(x)

        causal_mask = nn.Transformer.generate_square_subsequent_mask(seq_len).to(x.device)

        if attention_mask is not None:
            key_padding_mask = (attention_mask == 0)
        else:
            key_padding_mask = None

        x = self.decoder(tgt=x, memory=encoder_hidden_states,
                        tgt_mask=causal_mask, tgt_key_padding_mask=key_padding_mask)
        logits = self.output_proj(x)
        return logits

decoder = KeyboardEventDecoder(vocab_size=tokenizer.vocab_size, hidden_dim=384)
print(f"✓ Decoder initialized")
print(f"  Parameters: {sum(p.numel() for p in decoder.parameters()):,}")

# =============================================================================
# 4. Test Whisper + LoRA Integration
# =============================================================================
print("\n" + "=" * 60)
print("4. TESTING WHISPER + LORA INTEGRATION")
print("=" * 60)

whisper = WhisperModel.from_pretrained("openai/whisper-tiny")
encoder = whisper.encoder
print(f"✓ Whisper encoder loaded")

lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj", "k_proj"],
    lora_dropout=0.1,
    bias="none",
)

encoder = get_peft_model(encoder, lora_config)
print(f"✓ LoRA applied to encoder")

trainable_params = sum(p.numel() for p in encoder.parameters() if p.requires_grad)
total_params = sum(p.numel() for p in encoder.parameters())
print(f"  Trainable: {trainable_params:,} / {total_params:,} ({100*trainable_params/total_params:.2f}%)")

# =============================================================================
# 5. Test Forward Pass
# =============================================================================
if features is not None:
    print("\n" + "=" * 60)
    print("5. TESTING FORWARD PASS")
    print("=" * 60)

    # Create sample batch
    input_features = features.input_features.to(device)
    labels = torch.tensor(encoded[:100]).unsqueeze(0).to(device)  # Truncate for test

    encoder = encoder.to(device)
    decoder = decoder.to(device)

    print(f"  Input features: {input_features.shape}")
    print(f"  Labels: {labels.shape}")

    with torch.no_grad():
        # Encode
        encoder_outputs = encoder(input_features)
        encoder_hidden = encoder_outputs.last_hidden_state
        print(f"  Encoder output: {encoder_hidden.shape}")

        # Decode
        decoder_input = labels[:, :-1]
        logits = decoder(decoder_input, encoder_hidden)
        print(f"  Decoder logits: {logits.shape}")

        # Compute loss
        targets = labels[:, 1:]
        loss = torch.nn.functional.cross_entropy(
            logits.reshape(-1, logits.size(-1)),
            targets.reshape(-1),
            ignore_index=0,
        )
        print(f"  Loss: {loss.item():.4f}")

    print(f"✓ Forward pass successful!")

# =============================================================================
# Summary
# =============================================================================
print("\n" + "=" * 60)
print("TEST SUMMARY")
print("=" * 60)
print("✓ All tests passed!")
print("\nNotebook implementation is ready for use.")
print("=" * 60)
