import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';

const RECORDINGS_DIR = './recordings';
const WEBM_EXTENSION = '.webm';

export const GET: RequestHandler = async () => {
	try {
		const files = await fs.readdir(RECORDINGS_DIR);
		const fileSet = new Set(files);
		const jsonFiles = files.filter((file) => file.endsWith('.json'));

		const recordings = (
			await Promise.all(
				jsonFiles.map(async (file) => {
					try {
						const filePath = path.join(RECORDINGS_DIR, file);
						const content = await fs.readFile(filePath, 'utf-8');
						const data = JSON.parse(content);
						return normalizeRecordingData(file, data, fileSet);
					} catch (error) {
						console.warn('Skipping invalid recording file:', file, error);
						return null;
					}
				})
			)
		).filter((recording): recording is NormalizedRecording => recording !== null);

		// Sort by start timestamp, most recent first
		recordings.sort((a, b) => b.start_timestamp - a.start_timestamp);

		return json(recordings);
	} catch (error) {
		console.error('Error listing recordings:', error);
		return json({ error: 'Failed to list recordings' }, { status: 500 });
	}
};

type NormalizedRecording = {
	filename: string;
	deleted: boolean;
	recording_id: string;
	start_timestamp: number;
	end_timestamp: number;
	keyboard_session_id: string;
	control_session_id: string;
	keystrokes: Array<{
		timestamp: number;
		key: string;
		event_type: 'keydown' | 'keyup';
	}>;
	audio_file: string;
};

function normalizeRecordingData(
	filename: string,
	data: Record<string, unknown>,
	fileSet: Set<string>
): NormalizedRecording {
	const deleted = filename.endsWith('_DELETED.json');
	const baseName = stripJsonSuffix(filename);
	const recordingId = coerceString(data.recording_id) ?? baseName;
	const keystrokes = normalizeKeystrokes(data.keystrokes);
	const { start, end } = inferTimestamps(data, keystrokes);
	const keyboardSession = coerceString(data.keyboard_session_id) ?? baseName;
	const controlSession = coerceString(data.control_session_id) ?? baseName;
	const audioFile = resolveAudioFilename(
		coerceString(data.audio_file),
		deleted,
		fileSet,
		baseName
	);

	return {
		filename,
		deleted,
		recording_id: recordingId,
		start_timestamp: start,
		end_timestamp: end,
		keyboard_session_id: keyboardSession,
		control_session_id: controlSession,
		keystrokes,
		audio_file: audioFile
	};
}

function stripJsonSuffix(filename: string) {
	return filename.replace(/(_DELETED)?\.json$/, '');
}

function normalizeKeystrokes(raw: unknown): NormalizedRecording['keystrokes'] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const entries: NormalizedRecording['keystrokes'] = [];

	for (const value of raw) {
		if (typeof value !== 'object' || value === null) {
			continue;
		}

		const entry = value as Record<string, unknown>;
		const timestamp = coerceNumber(entry.timestamp ?? entry.time) ?? Number.NaN;
		if (!Number.isFinite(timestamp)) {
			continue;
		}
		const key = coerceString(entry.key) ?? '';
		const eventTypeRaw = coerceString(entry.event_type ?? entry.type);
		const eventType: 'keydown' | 'keyup' = eventTypeRaw === 'keyup' ? 'keyup' : 'keydown';

		entries.push({ timestamp, key, event_type: eventType });
	}

	entries.sort((a, b) => a.timestamp - b.timestamp);
	return entries;
}

function inferTimestamps(
	data: Record<string, unknown>,
	keystrokes: NormalizedRecording['keystrokes']
) {
	const startCandidates = [
		data.start_timestamp,
		data.startTime,
		data.start,
		data.started_at,
		keystrokes[0]?.timestamp
	];
	const endCandidates = [
		data.end_timestamp,
		data.endTime,
		data.end,
		data.finished_at,
		keystrokes[keystrokes.length - 1]?.timestamp
	];

	let start = firstFinite(startCandidates) ?? Date.now();
	let end = firstFinite(endCandidates) ?? start;

	if (end < start) {
		end = start;
	}

	return { start, end };
}

function firstFinite(values: Array<unknown>) {
	for (const value of values) {
		const number = coerceNumber(value);
		if (Number.isFinite(number)) {
			return number;
		}
	}
	return undefined;
}

function coerceString(value: unknown) {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function coerceNumber(value: unknown) {
	if (value === null || value === undefined) {
		return undefined;
	}

	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) ? number : undefined;
}

function stripDeletedSuffix(filename: string | undefined, extension: string) {
	if (!filename || !filename.endsWith(extension)) {
		return filename;
	}

	const deletedSuffix = `_DELETED${extension}`;
	if (filename.endsWith(deletedSuffix)) {
		return `${filename.slice(0, -deletedSuffix.length)}${extension}`;
	}

	return filename;
}

function ensureDeletedSuffix(filename: string | undefined, extension: string) {
	if (!filename || !filename.endsWith(extension)) {
		return filename;
	}

	const deletedSuffix = `_DELETED${extension}`;
	if (filename.endsWith(deletedSuffix)) {
		return filename;
	}

	return `${filename.slice(0, -extension.length)}${deletedSuffix}`;
}

function resolveAudioFilename(
	audioFile: string | undefined,
	deleted: boolean,
	fileSet: Set<string>,
	baseName: string
) {
	const defaultBase = `${baseName}.webm`;
	const normalized = stripDeletedSuffix(audioFile ?? defaultBase, WEBM_EXTENSION) ?? defaultBase;
	const deletedVariant =
		ensureDeletedSuffix(normalized, WEBM_EXTENSION) ??
		`${normalized.slice(0, -WEBM_EXTENSION.length)}_DELETED${WEBM_EXTENSION}`;
	const preferred = deleted ? deletedVariant : normalized;
	const fallback = deleted
		? ensureDeletedSuffix(defaultBase, WEBM_EXTENSION) ?? `${baseName}_DELETED${WEBM_EXTENSION}`
		: normalized;

	const candidates = [preferred, normalized, deletedVariant, audioFile, fallback].filter(
		(candidate): candidate is string => Boolean(candidate)
	);

	for (const candidate of candidates) {
		if (fileSet.has(candidate)) {
			return candidate;
		}
	}

	return preferred ?? fallback ?? audioFile ?? defaultBase;
}
