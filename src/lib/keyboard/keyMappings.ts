const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const LETTER_CODE_TO_CHAR: Record<string, string> = {};
const LETTER_CHAR_TO_CODE: Record<string, string> = {};

for (const letter of LETTERS) {
	const code = `Key${letter}`;
	LETTER_CODE_TO_CHAR[code] = letter;
	LETTER_CHAR_TO_CODE[letter] = code;
	LETTER_CHAR_TO_CODE[letter.toLowerCase()] = code;
}

const DIGIT_CODE_TO_CHAR: Record<string, string> = {
	Digit0: '0',
	Digit1: '1',
	Digit2: '2',
	Digit3: '3',
	Digit4: '4',
	Digit5: '5',
	Digit6: '6',
	Digit7: '7',
	Digit8: '8',
	Digit9: '9'
};

const SHIFTED_DIGIT_CODE_TO_CHAR: Record<string, string> = {
	Digit0: ')',
	Digit1: '!',
	Digit2: '@',
	Digit3: '#',
	Digit4: '$',
	Digit5: '%',
	Digit6: '^',
	Digit7: '&',
	Digit8: '*',
	Digit9: '('
};

const PUNCT_CODE_TO_CHAR: Record<string, string> = {
	Backquote: '`',
	Minus: '-',
	Equal: '=',
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	IntlBackslash: '\\',
	Semicolon: ';',
	Quote: "'",
	Comma: ',',
	Period: '.',
	Slash: '/'
};

const SHIFTED_PUNCT_CODE_TO_CHAR: Record<string, string> = {
	Backquote: '~',
	Minus: '_',
	Equal: '+',
	BracketLeft: '{',
	BracketRight: '}',
	Backslash: '|',
	IntlBackslash: '|',
	Semicolon: ':',
	Quote: '"',
	Comma: '<',
	Period: '>',
	Slash: '?'
};

const NAMED_CODES = new Set([
	'Backspace',
	'Tab',
	'Enter',
	'Space',
	'ShiftLeft',
	'ShiftRight',
	'ControlLeft',
	'ControlRight',
	'AltLeft',
	'AltRight',
	'MetaLeft',
	'MetaRight',
	'CapsLock',
	'Escape',
	'ContextMenu',
	'Delete',
	'Home',
	'End',
	'PageUp',
	'PageDown',
	'Insert',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'NumLock',
	'ScrollLock',
	'Pause',
	'PrintScreen',
	'Numpad0',
	'Numpad1',
	'Numpad2',
	'Numpad3',
	'Numpad4',
	'Numpad5',
	'Numpad6',
	'Numpad7',
	'Numpad8',
	'Numpad9',
	'NumpadAdd',
	'NumpadSubtract',
	'NumpadMultiply',
	'NumpadDivide',
	'NumpadDecimal',
	'NumpadEnter',
	'NumpadEqual',
	'IntlYen',
	'IntlRo',
	'IntlHash',
	'AudioVolumeMute',
	'AudioVolumeDown',
	'AudioVolumeUp',
	'MediaTrackNext',
	'MediaTrackPrevious',
	'MediaStop',
	'MediaPlayPause',
	'BrightnessUp',
	'BrightnessDown'
]);

for (let idx = 1; idx <= 24; idx += 1) {
	NAMED_CODES.add(`F${idx}`);
}

const NAMED_KEY_ALIASES: Record<string, string> = {
	enter: 'Enter',
	return: 'Enter',
	backspace: 'Backspace',
	delete: 'Delete',
	del: 'Delete',
	space: 'Space',
	spacebar: 'Space',
	tab: 'Tab',
	esc: 'Escape',
	escape: 'Escape',
	contextmenu: 'ContextMenu',
	menu: 'ContextMenu',
	home: 'Home',
	end: 'End',
	pageup: 'PageUp',
	pagedown: 'PageDown',
	insert: 'Insert',
	arrowleft: 'ArrowLeft',
	arrowright: 'ArrowRight',
	arrowup: 'ArrowUp',
	arrowdown: 'ArrowDown',
	left: 'ArrowLeft',
	right: 'ArrowRight',
	up: 'ArrowUp',
	down: 'ArrowDown',
	capslock: 'CapsLock',
	numlock: 'NumLock',
	scrolllock: 'ScrollLock',
	pause: 'Pause',
	printscreen: 'PrintScreen',
	prtscn: 'PrintScreen',
	numpadadd: 'NumpadAdd',
	numpadsubtract: 'NumpadSubtract',
	numpadmultiply: 'NumpadMultiply',
	numpaddivide: 'NumpadDivide',
	numpaddecimal: 'NumpadDecimal',
	numpadenter: 'NumpadEnter',
	numpadequals: 'NumpadEqual'
};

const MODIFIER_ALIASES: Record<string, string> = {
	shift: 'ShiftLeft',
	control: 'ControlLeft',
	ctrl: 'ControlLeft',
	alt: 'AltLeft',
	option: 'AltLeft',
	meta: 'MetaLeft',
	command: 'MetaLeft',
	cmd: 'MetaLeft',
	os: 'MetaLeft',
	win: 'MetaLeft',
	super: 'MetaLeft'
};

const CHARACTER_TO_CODE: Record<string, string> = {
	' ': 'Space',
	...LETTER_CHAR_TO_CODE,
	...Object.fromEntries(Object.entries(DIGIT_CODE_TO_CHAR).map(([code, char]) => [char, code])),
	...Object.fromEntries(Object.entries(PUNCT_CODE_TO_CHAR).map(([code, char]) => [char, code])),
	...Object.fromEntries(Object.entries(SHIFTED_PUNCT_CODE_TO_CHAR).map(([code, char]) => [char, code])),
	...Object.fromEntries(Object.entries(SHIFTED_DIGIT_CODE_TO_CHAR).map(([code, char]) => [char, code]))
};

export type ModifierState = {
	shift: boolean;
	capsLock: boolean;
};

export function isEventCode(value: string | null | undefined): value is string {
	if (typeof value !== 'string') {
		return false;
	}
	if (/^Key[A-Z]$/.test(value)) {
		return true;
	}
	if (/^Digit[0-9]$/.test(value)) {
		return true;
	}
	if (/^Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal)$/.test(value)) {
		return true;
	}
	if (value in PUNCT_CODE_TO_CHAR) {
		return true;
	}
	return NAMED_CODES.has(value);
}

export function keyLikeToCode(inputValue: string | null | undefined): string | null {
	if (typeof inputValue !== 'string') {
		return null;
	}

	if (inputValue === ' ') {
		return 'Space';
	}

	const trimmed = (inputValue as string).trim() as string;
	if (!trimmed) {
		return null;
	}
	const normalized: string = trimmed;

	if (isEventCode(normalized)) {
		return normalized;
	}

	if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(normalized)) {
		return String(normalized).toUpperCase();
	}

	const charCode = CHARACTER_TO_CODE[normalized];
	if (charCode) {
		return charCode;
	}

	const lower = String(normalized).toLowerCase();
	if (lower in MODIFIER_ALIASES) {
		return MODIFIER_ALIASES[lower];
	}

	if (lower in NAMED_KEY_ALIASES) {
		return NAMED_KEY_ALIASES[lower];
	}

	return null;
}


export function codeToDisplayCharacter(
	code: string | null | undefined,
	modifiers?: Partial<ModifierState>
): string | null {
	if (!code) {
		return null;
	}

	if (code === 'Space') {
		return ' ';
	}

	const letter = LETTER_CODE_TO_CHAR[code];
	if (letter) {
		const shouldUppercase = Boolean(modifiers?.shift) !== Boolean(modifiers?.capsLock);
		return shouldUppercase ? letter : letter.toLowerCase();
	}

	if (code in DIGIT_CODE_TO_CHAR) {
		if (modifiers?.shift) {
			return SHIFTED_DIGIT_CODE_TO_CHAR[code] ?? DIGIT_CODE_TO_CHAR[code];
		}
		return DIGIT_CODE_TO_CHAR[code];
	}

	if (code in PUNCT_CODE_TO_CHAR) {
		if (modifiers?.shift) {
			return SHIFTED_PUNCT_CODE_TO_CHAR[code] ?? PUNCT_CODE_TO_CHAR[code];
		}
		return PUNCT_CODE_TO_CHAR[code];
	}

	return null;
}

export function codeToDisplayLabel(code: string | null | undefined): string {
	if (!code) {
		return '';
	}

	if (code === 'Space') {
		return ' ';
	}

	const letter = LETTER_CODE_TO_CHAR[code];
	if (letter) {
		return letter;
	}

	if (code in DIGIT_CODE_TO_CHAR) {
		return DIGIT_CODE_TO_CHAR[code];
	}

	if (code in PUNCT_CODE_TO_CHAR) {
		return PUNCT_CODE_TO_CHAR[code];
	}

	switch (code) {
		case 'ShiftLeft':
		case 'ShiftRight':
			return 'Shift';
		case 'ControlLeft':
		case 'ControlRight':
			return 'Control';
		case 'AltLeft':
		case 'AltRight':
			return 'Alt';
		case 'MetaLeft':
		case 'MetaRight':
			return 'Meta';
		default:
			return code;
	}
}

export function normalizeDisplayKey(value: string | null | undefined): string {
	const code = keyLikeToCode(value ?? '');
	if (!code) {
		return '';
	}

	switch (code) {
		case 'ShiftLeft':
		case 'ShiftRight':
			return 'Shift';
		case 'ControlLeft':
		case 'ControlRight':
			return 'Control';
		case 'AltLeft':
		case 'AltRight':
			return 'Alt';
		case 'MetaLeft':
		case 'MetaRight':
			return 'Meta';
	}

	const label = codeToDisplayLabel(code);
	return label || code;
}

export function isShiftCode(code: string | null | undefined): boolean {
	return code === 'ShiftLeft' || code === 'ShiftRight';
}

export function isCapsLockCode(code: string | null | undefined): boolean {
	return code === 'CapsLock';
}

export function codeToEditingCommand(code: string | null | undefined): string | null {
	if (!code) {
		return null;
	}
	switch (code) {
		case 'Backspace':
		case 'Delete':
		case 'Enter':
		case 'Tab':
		case 'ArrowLeft':
		case 'ArrowRight':
			return code;
		default:
			return null;
	}
}

export function isCharacterProducingCode(code: string | null | undefined): boolean {
	return Boolean(codeToDisplayCharacter(code ?? null));
}
