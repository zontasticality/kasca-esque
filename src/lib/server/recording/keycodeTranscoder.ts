import fs from 'node:fs/promises';

export type KeyEventType = 'keydown' | 'keyup';

export interface KeystrokeEvent {
	timestamp: number;
	key: string;
	event_type: KeyEventType;
}

export interface KeystrokeRecording {
	keystrokes: KeystrokeEvent[];
}

export type RecordingFile = KeystrokeRecording & Record<string, unknown>;

export interface EncodedRecording {
	tokenStream: string;
	metadata: Record<string, unknown>;
}

const KEY_CODE_TOKEN_ENTRIES = [
	['Backquote', 'bquote'],
	['Backslash', 'bslash'],
	['BracketLeft', 'lbrack'],
	['BracketRight', 'rbrack'],
	['Comma', 'comma'],
	['Digit0', 'zero'],
	['Digit1', 'one'],
	['Digit2', 'two'],
	['Digit3', 'three'],
	['Digit4', 'four'],
	['Digit5', 'five'],
	['Digit6', 'six'],
	['Digit7', 'seven'],
	['Digit8', 'eight'],
	['Digit9', 'nine'],
	['Equal', 'equal'],
	['IntlBackslash', 'intlbs'],
	['IntlRo', 'intlro'],
	['IntlYen', 'intlyen'],
	['KeyA', 'keya'],
	['KeyB', 'keyb'],
	['KeyC', 'keyc'],
	['KeyD', 'keyd'],
	['KeyE', 'keye'],
	['KeyF', 'keyf'],
	['KeyG', 'keyg'],
	['KeyH', 'keyh'],
	['KeyI', 'keyi'],
	['KeyJ', 'keyj'],
	['KeyK', 'keyk'],
	['KeyL', 'keyl'],
	['KeyM', 'keym'],
	['KeyN', 'keyn'],
	['KeyO', 'keyo'],
	['KeyP', 'keyp'],
	['KeyQ', 'keyq'],
	['KeyR', 'keyr'],
	['KeyS', 'keys'],
	['KeyT', 'keyt'],
	['KeyU', 'keyu'],
	['KeyV', 'keyv'],
	['KeyW', 'keyw'],
	['KeyX', 'keyx'],
	['KeyY', 'keyy'],
	['KeyZ', 'keyz'],
	['Minus', 'minus'],
	['Period', 'dot'],
	['Quote', 'quote'],
	['Semicolon', 'semi'],
	['Slash', 'slash'],
	['AltLeft', 'lalt'],
	['AltRight', 'ralt'],
	['Backspace', 'back'],
	['CapsLock', 'caps'],
	['ContextMenu', 'menu'],
	['ControlLeft', 'lctrl'],
	['ControlRight', 'rctrl'],
	['Enter', 'enter'],
	['MetaLeft', 'lmeta'],
	['MetaRight', 'rmeta'],
	['ShiftLeft', 'lshift'],
	['ShiftRight', 'rshift'],
	['Space', 'space'],
	['Tab', 'tab'],
	['Convert', 'convert'],
	['KanaMode', 'kana'],
	['Lang1', 'langone'],
	['Lang2', 'langtwo'],
	['Lang3', 'langthree'],
	['Lang4', 'langfour'],
	['Lang5', 'langfive'],
	['NonConvert', 'noncon'],
	['Delete', 'del'],
	['End', 'end'],
	['Help', 'help'],
	['Home', 'home'],
	['Insert', 'ins'],
	['PageDown', 'pagedown'],
	['PageUp', 'pageup'],
	['ArrowDown', 'down'],
	['ArrowLeft', 'left'],
	['ArrowRight', 'right'],
	['ArrowUp', 'up'],
	['NumLock', 'numlock'],
	['Numpad0', 'numzero'],
	['Numpad1', 'numone'],
	['Numpad2', 'numtwo'],
	['Numpad3', 'numthree'],
	['Numpad4', 'numfour'],
	['Numpad5', 'numfive'],
	['Numpad6', 'numsix'],
	['Numpad7', 'numseven'],
	['Numpad8', 'numeight'],
	['Numpad9', 'numnine'],
	['NumpadAdd', 'numadd'],
	['NumpadBackspace', 'numback'],
	['NumpadClear', 'numclear'],
	['NumpadClearEntry', 'numclearentry'],
	['NumpadComma', 'numcomma'],
	['NumpadDecimal', 'numdec'],
	['NumpadDivide', 'numdiv'],
	['NumpadEnter', 'numenter'],
	['NumpadEqual', 'numeq'],
	['NumpadHash', 'numhash'],
	['NumpadMemoryAdd', 'nummadd'],
	['NumpadMemoryClear', 'nummclear'],
	['NumpadMemoryRecall', 'nummrecall'],
	['NumpadMemoryStore', 'nummstore'],
	['NumpadMemorySubtract', 'nummsub'],
	['NumpadMultiply', 'nummul'],
	['NumpadParenLeft', 'numlparen'],
	['NumpadParenRight', 'numrparen'],
	['NumpadStar', 'numstar'],
	['NumpadSubtract', 'numsub'],
	['Escape', 'esc'],
	['F1', 'fone'],
	['F2', 'ftwo'],
	['F3', 'fthree'],
	['F4', 'ffour'],
	['F5', 'ffive'],
	['F6', 'fsix'],
	['F7', 'fseven'],
	['F8', 'feight'],
	['F9', 'fnine'],
	['F10', 'ften'],
	['F11', 'feleven'],
	['F12', 'ftwelve'],
	['F13', 'fthirteen'],
	['F14', 'ffourteen'],
	['F15', 'ffifteen'],
	['F16', 'fsixteen'],
	['F17', 'fseventeen'],
	['F18', 'feighteen'],
	['F19', 'fnineteen'],
	['F20', 'ftwenty'],
	['F21', 'ftwentyone'],
	['F22', 'ftwentytwo'],
	['F23', 'ftwentythree'],
	['F24', 'ftwentyfour'],
	['Fn', 'fn'],
	['FnLock', 'fnlock'],
	['PrintScreen', 'print'],
	['ScrollLock', 'scroll'],
	['Pause', 'pause'],
	['BrowserBack', 'browserback'],
	['BrowserFavorites', 'browserfav'],
	['BrowserForward', 'browserfwd'],
	['BrowserHome', 'browserhome'],
	['BrowserRefresh', 'browserfresh'],
	['BrowserSearch', 'browsersearch'],
	['BrowserStop', 'browserstop'],
	['Eject', 'eject'],
	['LaunchApp1', 'appone'],
	['LaunchApp2', 'apptwo'],
	['LaunchMail', 'mail'],
	['MediaPlayPause', 'playpause'],
	['MediaSelect', 'select'],
	['MediaStop', 'stop'],
	['MediaTrackNext', 'next'],
	['MediaTrackPrevious', 'prev'],
	['Power', 'power'],
	['Sleep', 'sleep'],
	['AudioVolumeDown', 'voldown'],
	['AudioVolumeMute', 'mute'],
	['AudioVolumeUp', 'volup'],
	['WakeUp', 'wake'],
	['Hyper', 'hyper'],
	['Super', 'super'],
	['Turbo', 'turbo'],
	['Abort', 'abort'],
	['Resume', 'resume'],
	['Suspend', 'suspend'],
	['Again', 'again'],
	['Copy', 'copy'],
	['Cut', 'cut'],
	['Find', 'find'],
	['Open', 'open'],
	['Paste', 'paste'],
	['Props', 'props'],
	['Select', 'selectkey'],
	['Undo', 'undo'],
	['Hiragana', 'hiragana'],
	['Katakana', 'katakana'],
	['Unidentified', 'unknown']
] as const satisfies ReadonlyArray<readonly [string, string]>;

export const keyCodeToTokenMap = new Map<string, string>(KEY_CODE_TOKEN_ENTRIES);

const tokenToKeyCodeMap = new Map<string, string>(
	KEY_CODE_TOKEN_ENTRIES.map(([keyCode, token]) => [token, keyCode])
);

const EVENT_TYPE_TO_SIGN = {
	keydown: '+',
	keyup: '-'
} as const satisfies Record<KeyEventType, '+' | '-'>;

const SIGN_TO_EVENT_TYPE = {
	'+': 'keydown',
	'-': 'keyup'
} as const satisfies Record<'+' | '-', KeyEventType>;

/**
 * Reads a recording JSON file and returns the compact token stream representation.
 */
export async function encodeRecordingFile(jsonPath: string): Promise<string> {
	const { tokenStream } = await encodeRecordingFileWithMetadata(jsonPath);
	return tokenStream;
}

/**
 * Same as {@link encodeRecordingFile} but also returns the non-keystroke metadata so it can be reattached later.
 */
export async function encodeRecordingFileWithMetadata(jsonPath: string): Promise<EncodedRecording> {
	const recording = await readRecordingFromFile(jsonPath);
	return {
		tokenStream: encodeKeystrokeRecording(recording),
		metadata: extractMetadata(recording)
	};
}

/**
 * Converts a structured recording into a compact token stream where each entry looks like:
 * keya+1746047591212
 * ^token^ ^sign^ ^timestamp^
 *
 * Entries are comma separated so they're easy to parse on the way back.
 */
export function encodeKeystrokeRecording(recording: KeystrokeRecording): string {
	if (!recording || !Array.isArray(recording.keystrokes)) {
		throw new Error('Invalid recording payload: expected a keystrokes array.');
	}

	return recording.keystrokes.map(encodeKeystroke).join(',');
}

export function decodeTokenStream(
	serialized: string,
	metadata: Record<string, unknown> = {}
): RecordingFile {
	if (!serialized.trim()) {
		return { ...stripKeystrokes(metadata), keystrokes: [] };
	}

	const entries = serialized
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);

	return { ...stripKeystrokes(metadata), keystrokes: entries.map(decodeEntry) };
}

function encodeKeystroke(keystroke: KeystrokeEvent): string {
	const token = keyCodeToTokenMap.get(keystroke.key);
	if (!token) {
		throw new Error(`Unsupported key code "${keystroke.key}" encountered during encoding.`);
	}

	const sign = EVENT_TYPE_TO_SIGN[keystroke.event_type];
	if (!sign) {
		throw new Error(`Unsupported event type "${keystroke.event_type}" for key "${keystroke.key}".`);
	}

	if (!Number.isFinite(keystroke.timestamp)) {
		throw new Error(`Invalid timestamp for key "${keystroke.key}".`);
	}

	return `${token}${sign}${keystroke.timestamp}`;
}

function decodeEntry(entry: string): KeystrokeEvent {
	const match = entry.match(/^([a-z0-9]+)([+-])(\d+)$/i);

	if (!match) {
		throw new Error(`Invalid token entry "${entry}".`);
	}

	const [, token, sign, timestampText] = match;

	const key = tokenToKeyCodeMap.get(token);
	if (!key) {
		throw new Error(`Unknown token "${token}" encountered while decoding.`);
	}

	const event_type = SIGN_TO_EVENT_TYPE[sign as '+' | '-'];
	if (!event_type) {
		throw new Error(`Unexpected sign "${sign}" in entry "${entry}".`);
	}

	const timestamp = Number(timestampText);
	if (!Number.isFinite(timestamp)) {
		throw new Error(`Invalid timestamp "${timestampText}" in entry "${entry}".`);
	}

	return {
		key,
		event_type,
		timestamp
	};
}

async function readRecordingFromFile(jsonPath: string): Promise<RecordingFile> {
	const content = await fs.readFile(jsonPath, 'utf-8');
	const parsed = JSON.parse(content) as Partial<RecordingFile>;

	if (!parsed.keystrokes) {
		throw new Error(`Recording file ${jsonPath} is missing a keystrokes array.`);
	}

	return parsed as RecordingFile;
}

function extractMetadata(recording: RecordingFile): Record<string, unknown> {
	const { keystrokes, ...metadata } = recording;
	return metadata;
}

function stripKeystrokes(metadata: Record<string, unknown>): Record<string, unknown> {
	const clone = { ...metadata };
	if ('keystrokes' in clone) {
		delete (clone as Record<string, unknown>).keystrokes;
	}
	return clone;
}
