import { normalizeDisplayKey, keyLikeToCode } from '$lib/keyboard/keyMappings';
import { findStateByTime } from '$lib/utils/binarySearch';
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
		const key = normalizeKeyValue(event.key);
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
			const index = findStateByTime(states, rel);
			const stored = index >= 0 ? states[index] : states[0];
			return { pressed: new Set(stored.pressed) };
		}
	};
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

	const code = keyLikeToCode(value);
	if (!code) {
		return value.trim().toUpperCase();
	}

	return normalizeDisplayKey(code);
}
