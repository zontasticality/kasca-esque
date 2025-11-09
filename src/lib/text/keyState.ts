import type { KeystrokeEvent } from './textTimeline';

export interface KeySnapshot {
	pressed: Set<string>;
}

interface StoredState {
	time: number;
	pressed: string[];
}

export function buildKeyTimeline(keystrokes: readonly KeystrokeEvent[]) {
	const events = [...keystrokes]
		.filter((event) => Number.isFinite(event.timestamp))
		.sort((a, b) => a.timestamp - b.timestamp);

	const baseTime = events[0]?.timestamp ?? 0;
	const states: StoredState[] = [];
	const pressed = new Set<string>();

	for (const event of events) {
		const key = normalizeKeyValue(event.key || event.text);
		if (!key) continue;

		if (event.event_type === 'keyup') {
			pressed.delete(key);
		} else {
			pressed.add(key);
		}

		const last = states[states.length - 1];
		if (!last || !setEqualsArray(pressed, last.pressed)) {
			states.push({ time: event.timestamp - baseTime, pressed: Array.from(pressed) });
		}
	}

	return {
		baseTime,
		getStateAt(timestamp: number): KeySnapshot {
			if (states.length === 0) {
				return { pressed: new Set() };
			}
			const rel = Math.max(0, timestamp - baseTime);
			const index = findStateIndex(states, rel);
			const stored = index >= 0 ? states[index] : states[0];
			return { pressed: new Set(stored.pressed) };
		}
	};
}

function findStateIndex(states: StoredState[], timestamp: number) {
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

function setEqualsArray(setValue: Set<string>, arr: string[]) {
	if (setValue.size !== arr.length) return false;
	for (const item of arr) {
		if (!setValue.has(item)) return false;
	}
	return true;
}

export function normalizeKeyValue(value: unknown) {
	if (typeof value !== 'string') {
		return '';
	}

	if (value === ' ') {
		return ' ';
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return '';
	}

	switch (trimmed) {
		case 'Space':
		case 'Spacebar':
		case 'Space Bar':
			return ' ';
		case 'ShiftLeft':
		case 'ShiftRight':
			return 'Shift';
		case 'ControlLeft':
		case 'ControlRight':
		case 'Ctrl':
		case 'Control':
			return 'Control';
		case 'AltLeft':
		case 'AltRight':
		case 'Alt':
			return 'Alt';
		case 'MetaLeft':
		case 'MetaRight':
		case 'Meta':
		case 'OS':
			return 'Meta';
		case 'ContextMenu':
		case 'Menu':
			return 'ContextMenu';
		default:
			return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
	}
}
