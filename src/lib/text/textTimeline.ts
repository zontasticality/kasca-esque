import {
	codeToDisplayCharacter,
	codeToEditingCommand,
	isCapsLockCode,
	isEventCode,
	isShiftCode,
	keyLikeToCode
} from '$lib/keyboard/keyMappings';
import { findStateByTime } from '$lib/utils/binarySearch';

// Old keystroke-only format (for backward compatibility)
export interface KeystrokeEvent {
	timestamp: number;
	key: string;
	event_type: 'keydown' | 'keyup';
}

// New unified event format
export type RecordingEvent =
	| { type: 'keydown'; ts: number; key: string }
	| { type: 'keyup'; ts: number; key: string }
	| { type: 'mousedown'; ts: number; pos: number }
	| { type: 'mouseup'; ts: number; selectionStart?: number; selectionEnd?: number }
	| { type: 'select'; ts: number; delta: number };

interface TimelineState {
	time: number;
	text: string;
	cursor: number;
	selectionStart: number;
	selectionEnd: number;
}

export interface TextSnapshot {
	text: string;
	cursor: number;
	selectionStart?: number;
	selectionEnd?: number;
}

const EMPTY_SNAPSHOT: TextSnapshot = { text: '', cursor: 0 };

export class TextTimeline {
	private readonly states: TimelineState[];
	readonly baseTime: number;

	constructor(events: readonly KeystrokeEvent[] | readonly RecordingEvent[]) {
		const { states, baseTime } = buildStates(events);
		this.states = states;
		this.baseTime = baseTime;
	}

	getStateAt(timestamp: number): TextSnapshot {
		if (this.states.length === 0) {
			return EMPTY_SNAPSHOT;
		}

		const relativeTime = Math.max(0, timestamp - this.baseTime);
		const index = findStateByTime(this.states, relativeTime);
		if (index < 0) {
			return EMPTY_SNAPSHOT;
		}
		const state = this.states[index];
		return {
			text: state.text,
			cursor: state.cursor,
			selectionStart: state.selectionStart,
			selectionEnd: state.selectionEnd
		};
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

interface NormalizedEvent {
	ts: number;
	type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'select';
	key?: string;
	pos?: number;
	delta?: number;
	selectionStart?: number;
	selectionEnd?: number;
}

function normalizeEvents(
	events: readonly KeystrokeEvent[] | readonly RecordingEvent[]
): NormalizedEvent[] {
	return events.map((e): NormalizedEvent => {
		// New format check - has 'type' and 'ts'
		if ('type' in e && 'ts' in e) {
			const ev = e as RecordingEvent;
			return {
				ts: ev.ts,
				type: ev.type,
				key: 'key' in ev ? ev.key : undefined,
				pos: 'pos' in ev ? ev.pos : undefined,
				delta: 'delta' in ev ? ev.delta : undefined,
				selectionStart: 'selectionStart' in ev ? ev.selectionStart : undefined,
				selectionEnd: 'selectionEnd' in ev ? ev.selectionEnd : undefined
			};
		}
		// Old KeystrokeEvent format
		const ke = e as KeystrokeEvent;
		return {
			ts: ke.timestamp,
			type: ke.event_type,
			key: ke.key
		};
	});
}

function buildStates(events: readonly KeystrokeEvent[] | readonly RecordingEvent[]) {
	let text = '';
	let cursor = 0;
	let selectionAnchor: number | null = null;
	let selectionDelta = 0;
	const states: TimelineState[] = [];

	const normalized = normalizeEvents(events);
	const sorted = [...normalized].sort((a, b) => a.ts - b.ts);
	const baseTime = sorted[0]?.ts ?? 0;
	const modifiers: ModifierTracker = {
		shiftCodes: new Set(),
		shift: false,
		capsLock: false
	};

	function getSelectionRange(): { start: number; end: number } {
		if (selectionAnchor === null || selectionDelta === 0) {
			return { start: cursor, end: cursor };
		}
		const start = Math.min(selectionAnchor, selectionAnchor + selectionDelta);
		const end = Math.max(selectionAnchor, selectionAnchor + selectionDelta);
		return { start: Math.max(0, start), end: Math.min(text.length, end) };
	}

	function hasSelection(): boolean {
		const { start, end } = getSelectionRange();
		return start !== end;
	}

	function pushState(ts: number) {
		const relativeTime = ts - baseTime;
		const { start, end } = getSelectionRange();
		const last = states[states.length - 1];
		if (!last || last.text !== text || last.cursor !== cursor ||
			last.selectionStart !== start || last.selectionEnd !== end) {
			states.push({
				time: relativeTime,
				text,
				cursor,
				selectionStart: start,
				selectionEnd: end
			});
		}
	}

	sorted.forEach((event) => {
		if (event.type === 'mousedown') {
			// Set cursor and anchor from mousedown position
			const pos = Math.max(0, Math.min(text.length, event.pos ?? 0));
			cursor = pos;
			selectionAnchor = pos;
			selectionDelta = 0;
			pushState(event.ts);
		} else if (event.type === 'mouseup') {
			// If mouseup includes explicit selection bounds, use them for accuracy
			if (event.selectionStart !== undefined && event.selectionEnd !== undefined) {
				const start = Math.max(0, Math.min(text.length, event.selectionStart));
				const end = Math.max(0, Math.min(text.length, event.selectionEnd));

				// Set selection using explicit bounds
				if (start !== end) {
					selectionAnchor = start;
					selectionDelta = end - start;
					cursor = end;
				} else {
					// Just a click, no selection
					cursor = start;
					selectionAnchor = null;
					selectionDelta = 0;
				}
				pushState(event.ts);
			}
			// Older format without explicit bounds: keep selection visible
		} else if (event.type === 'select') {
			// Update selection delta from anchor
			selectionDelta = event.delta ?? 0;
			// Update cursor to the focus position
			if (selectionAnchor !== null) {
				cursor = Math.max(0, Math.min(text.length, selectionAnchor + selectionDelta));
			}
			pushState(event.ts);
		} else if (event.type === 'keydown' && event.key) {
			const printableKey = resolveTextInput({
				timestamp: event.ts,
				key: event.key,
				event_type: 'keydown'
			}, modifiers);

			if (printableKey) {
				// If there's a selection, delete it first
				if (hasSelection()) {
					const { start, end } = getSelectionRange();
					text = text.slice(0, start) + text.slice(end);
					cursor = start;
					selectionAnchor = null;
					selectionDelta = 0;

					// If it's just backspace/delete with selection, we're done
					if (printableKey === 'Backspace' || printableKey === 'Delete') {
						pushState(event.ts);
						updateModifiersFromNormalized(modifiers, event);
						return;
					}
				}

				// Apply the key
				const result = applyKey(text, cursor, printableKey);
				text = result.text;
				cursor = result.cursor;

				// Clear selection after typing
				selectionAnchor = null;
				selectionDelta = 0;

				pushState(event.ts);
			}

			updateModifiersFromNormalized(modifiers, event);
		} else if (event.type === 'keyup' && event.key) {
			updateModifiersFromNormalized(modifiers, event);
		}
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

function updateModifiersFromNormalized(modifiers: ModifierTracker, event: NormalizedEvent) {
	if (!event.key) {
		return;
	}

	if (isShiftCode(event.key)) {
		if (event.type === 'keydown') {
			modifiers.shiftCodes.add(event.key);
		} else if (event.type === 'keyup') {
			modifiers.shiftCodes.delete(event.key);
		}
		modifiers.shift = modifiers.shiftCodes.size > 0;
		return;
	}

	if (isCapsLockCode(event.key) && event.type === 'keydown') {
		modifiers.capsLock = !modifiers.capsLock;
	}
}


