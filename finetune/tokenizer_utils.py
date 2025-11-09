from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List, Mapping

from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from transformers import PreTrainedTokenizerFast


SPECIAL_TOKENS = ["<pad>", "<s>", "</s>", "<unk>"]

KEY_CODES = sorted(
    [
        # Writing system keys (alphanumeric section)
        "Backquote",
        "Backslash",
        "BracketLeft",
        "BracketRight",
        "Comma",
        "Digit0",
        "Digit1",
        "Digit2",
        "Digit3",
        "Digit4",
        "Digit5",
        "Digit6",
        "Digit7",
        "Digit8",
        "Digit9",
        "Equal",
        "IntlBackslash",
        "IntlRo",
        "IntlYen",
        "KeyA",
        "KeyB",
        "KeyC",
        "KeyD",
        "KeyE",
        "KeyF",
        "KeyG",
        "KeyH",
        "KeyI",
        "KeyJ",
        "KeyK",
        "KeyL",
        "KeyM",
        "KeyN",
        "KeyO",
        "KeyP",
        "KeyQ",
        "KeyR",
        "KeyS",
        "KeyT",
        "KeyU",
        "KeyV",
        "KeyW",
        "KeyX",
        "KeyY",
        "KeyZ",
        "Minus",
        "Period",
        "Quote",
        "Semicolon",
        "Slash",
        # Functional keys in the alphanumeric section
        "AltLeft",
        "AltRight",
        "Backspace",
        "CapsLock",
        "ContextMenu",
        "ControlLeft",
        "ControlRight",
        "Enter",
        "MetaLeft",
        "MetaRight",
        "ShiftLeft",
        "ShiftRight",
        "Space",
        "Tab",
        # Extra functional keys (Japanese/Korean layouts)
        "Convert",
        "KanaMode",
        "Lang1",
        "Lang2",
        "Lang3",
        "Lang4",
        "Lang5",
        "NonConvert",
        # Control pad section
        "Delete",
        "End",
        "Help",
        "Home",
        "Insert",
        "PageDown",
        "PageUp",
        # Arrow pad section
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        # Numpad section
        "NumLock",
        "Numpad0",
        "Numpad1",
        "Numpad2",
        "Numpad3",
        "Numpad4",
        "Numpad5",
        "Numpad6",
        "Numpad7",
        "Numpad8",
        "Numpad9",
        "NumpadAdd",
        "NumpadBackspace",
        "NumpadClear",
        "NumpadClearEntry",
        "NumpadComma",
        "NumpadDecimal",
        "NumpadDivide",
        "NumpadEnter",
        "NumpadEqual",
        "NumpadHash",
        "NumpadMemoryAdd",
        "NumpadMemoryClear",
        "NumpadMemoryRecall",
        "NumpadMemoryStore",
        "NumpadMemorySubtract",
        "NumpadMultiply",
        "NumpadParenLeft",
        "NumpadParenRight",
        "NumpadStar",
        "NumpadSubtract",
        # Function section
        "Escape",
        "F1",
        "F2",
        "F3",
        "F4",
        "F5",
        "F6",
        "F7",
        "F8",
        "F9",
        "F10",
        "F11",
        "F12",
        "F13",
        "F14",
        "F15",
        "F16",
        "F17",
        "F18",
        "F19",
        "F20",
        "F21",
        "F22",
        "F23",
        "F24",
        "Fn",
        "FnLock",
        "PrintScreen",
        "ScrollLock",
        "Pause",
        # Media / browser / system keys
        "BrowserBack",
        "BrowserFavorites",
        "BrowserForward",
        "BrowserHome",
        "BrowserRefresh",
        "BrowserSearch",
        "BrowserStop",
        "Eject",
        "LaunchApp1",
        "LaunchApp2",
        "LaunchMail",
        "MediaPlayPause",
        "MediaSelect",
        "MediaStop",
        "MediaTrackNext",
        "MediaTrackPrevious",
        "Power",
        "Sleep",
        "AudioVolumeDown",
        "AudioVolumeMute",
        "AudioVolumeUp",
        "WakeUp",
        # Legacy / non-standard / special keys
        "Hyper",
        "Super",
        "Turbo",
        "Abort",
        "Resume",
        "Suspend",
        "Again",
        "Copy",
        "Cut",
        "Find",
        "Open",
        "Paste",
        "Props",
        "Select",
        "Undo",
        "Hiragana",
        "Katakana",
        "Unidentified",
    ]
)


def _build_vocab(codes: Iterable[str]) -> Mapping[str, int]:
    vocab = {}
    for idx, token in enumerate(SPECIAL_TOKENS):
        vocab[token] = idx
    next_idx = len(vocab)
    for code in codes:
        for state in ("DOWN", "UP"):
            token = f"{code}_{state}"
            if token not in vocab:
                vocab[token] = next_idx
                next_idx += 1
    return vocab


def materialize_tokenizer(
    codes: List[str], output_dir: Path
) -> PreTrainedTokenizerFast:
    """Create and save a WordLevel tokenizer tailored to DOWN/UP key tokens."""
    output_dir.mkdir(parents=True, exist_ok=True)
    vocab = _build_vocab(codes)
    tokenizer = Tokenizer(WordLevel(vocab=vocab, unk_token="<unk>"))
    tokenizer.pre_tokenizer = Whitespace()
    pt_tokenizer = PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        bos_token="<s>",
        eos_token="</s>",
        pad_token="<pad>",
        unk_token="<unk>",
    )
    pt_tokenizer.save_pretrained(output_dir)
    with open(output_dir / "codes.json", "w", encoding="utf-8") as handle:
        json.dump({"codes": codes}, handle, indent=2)
    return pt_tokenizer
