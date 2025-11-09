import {
	codeToDisplayCharacter,
	codeToEditingCommand,
	isCapsLockCode,
	isEventCode,
	isShiftCode,
	keyLikeToCode
} from '$lib/keyboard/keyMappings';

export interface KeystrokeEvent {
	timestamp: number;
	key: string;
	event_type: 'keydown' | 'keyup';
}

interface TimelineState {
	time: number;
	text: string;
	cursor: number;
}

export interface TextSnapshot {
	text: string;
	cursor: number;
}

const EMPTY_SNAPSHOT: TextSnapshot = { text: '', cursor: 0 };

export class TextTimeline {
	private readonly states: TimelineState[];
	readonly baseTime: number;

	constructor(keystrokes: readonly KeystrokeEvent[]) {
		const { states, baseTime } = buildStates(keystrokes);
		this.states = states;
		this.baseTime = baseTime;
	}

	getStateAt(timestamp: number): TextSnapshot {
		if (this.states.length === 0) {
			return EMPTY_SNAPSHOT;
		}

		const relativeTime = Math.max(0, timestamp - this.baseTime);
		const index = findStateIndex(this.states, relativeTime);
		if (index < 0) {
			return EMPTY_SNAPSHOT;
		}
		const state = this.states[index];
		return { text: state.text, cursor: state.cursor };
	}

	getTextAt(timestamp: number): string {
		return this.getStateAt(timestamp).text;
	}
}

type ModifierTracker = {
	shiftCodes: Set<string>;
	shift: boolean;
	capsLock: boolean;
};

function buildStates(keystrokes: readonly KeystrokeEvent[]) {
	let text = '';
	let cursor = 0;
	const states: TimelineState[] = [];

	const sorted = [...keystrokes].sort((a, b) => a.timestamp - b.timestamp);
	const baseTime = sorted[0]?.timestamp ?? 0;
	const modifiers: ModifierTracker = {
		shiftCodes: new Set(),
		shift: false,
		capsLock: false
	};

	sorted.forEach((event) => {
		if (event.event_type === 'keydown') {
			const printableKey = resolveTextInput(event, modifiers);
			if (printableKey) {
				const result = applyKey(text, cursor, printableKey);
				text = result.text;
				cursor = result.cursor;

				const relativeTime = event.timestamp - baseTime;
				const last = states[states.length - 1];
				if (!last || last.text !== text || last.cursor !== cursor) {
					states.push({ time: relativeTime, text, cursor });
				}
			}
		}

		updateModifiers(modifiers, event);
	});

	return { states, baseTime };
}

function applyKey(text: string, cursor: number, key: string) {
	if (key === 'Backspace') {
		if (cursor === 0) return { text, cursor };
		return {
			text: text.slice(0, cursor - 1) + text.slice(cursor),
			cursor: cursor - 1
		};
	}

	if (key === 'Delete') {
		if (cursor >= text.length) return { text, cursor };
		return {
			text: text.slice(0, cursor) + text.slice(cursor + 1),
			cursor
		};
	}

	if (key === 'Enter') {
		return insertText(text, cursor, '\n');
	}

	if (key === 'Tab') {
		return insertText(text, cursor, '\t');
	}

	if (key === 'ArrowLeft') {
		return { text, cursor: Math.max(0, cursor - 1) };
	}

	if (key === 'ArrowRight') {
		return { text, cursor: Math.min(text.length, cursor + 1) };
	}

	if (key.length === 1) {
		return insertText(text, cursor, key);
	}

	if (key === ' ') {
		return insertText(text, cursor, ' ');
	}

	if (key.toLowerCase() === 'space') {
		return insertText(text, cursor, ' ');
	}

	return { text, cursor };
}

function insertText(text: string, cursor: number, value: string) {
	return {
		text: text.slice(0, cursor) + value + text.slice(cursor),
		cursor: cursor + value.length
	};
}

function resolveTextInput(event: KeystrokeEvent, modifiers: ModifierTracker) {
	if (!event.key) {
		return '';
	}

	const code = isEventCode(event.key) ? event.key : keyLikeToCode(event.key);
	if (!code) {
		return '';
	}

	const command = codeToEditingCommand(code);
	if (command) {
		return command;
	}

	const char = codeToDisplayCharacter(code, {
		shift: modifiers.shift,
		capsLock: modifiers.capsLock
	});
	return char ?? '';
}

function updateModifiers(modifiers: ModifierTracker, event: KeystrokeEvent) {
	if (!event.key) {
		return;
	}

	if (isShiftCode(event.key)) {
		if (event.event_type === 'keydown') {
			modifiers.shiftCodes.add(event.key);
		} else if (event.event_type === 'keyup') {
			modifiers.shiftCodes.delete(event.key);
		}
		modifiers.shift = modifiers.shiftCodes.size > 0;
		return;
	}

	if (isCapsLockCode(event.key) && event.event_type === 'keydown') {
		modifiers.capsLock = !modifiers.capsLock;
	}
}

function findStateIndex(states: TimelineState[], timestamp: number) {
	let low = 0;
	let high = states.length - 1;
	let result = -1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const midTime = states[mid].time;
		if (midTime <= timestamp) {
			result = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return result;
}
