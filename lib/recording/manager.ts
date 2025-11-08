import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import type { KeystrokeEvent } from '../websocket/types';

export interface Recording {
	recording_id: string;
	start_timestamp: number;
	end_timestamp?: number;
	keyboard_session_id: string;
	control_session_id: string;
	keystrokes: Array<{
		timestamp: number;
		key: string;
		event_type: 'keydown' | 'keyup';
	}>;
	audio_file: string;
}

export class RecordingManager {
	private recordings: Map<string, Recording> = new Map();
	private audioWriteStreams: Map<string, fs.FileHandle> = new Map();
	private recordingsDir = './recordings';

	constructor() {
		this.ensureRecordingsDir();
	}

	private async ensureRecordingsDir() {
		if (!existsSync(this.recordingsDir)) {
			await fs.mkdir(this.recordingsDir, { recursive: true });
		}
	}

	async startRecording(
		recordingId: string,
		keyboardSessionId: string,
		controlSessionId: string,
		startTimestamp: number
	): Promise<void> {
		const audioFilename = this.generateFilename(startTimestamp, 'webm');
		const audioPath = path.join(this.recordingsDir, audioFilename);

		// Create audio file
		const fileHandle = await fs.open(audioPath, 'w');
		this.audioWriteStreams.set(recordingId, fileHandle);

		// Initialize recording metadata
		const recording: Recording = {
			recording_id: recordingId,
			start_timestamp: startTimestamp,
			keyboard_session_id: keyboardSessionId,
			control_session_id: controlSessionId,
			keystrokes: [],
			audio_file: audioFilename
		};

		this.recordings.set(recordingId, recording);
	}

	async appendAudioChunk(recordingId: string, chunk: Buffer): Promise<void> {
		const fileHandle = this.audioWriteStreams.get(recordingId);
		if (!fileHandle) {
			throw new Error(`No audio stream found for recording ${recordingId}`);
		}

		await fileHandle.write(chunk);
	}

	addKeystroke(recordingId: string, keystroke: KeystrokeEvent): void {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			console.warn(`Recording ${recordingId} not found for keystroke`);
			return;
		}

		recording.keystrokes.push({
			timestamp: keystroke.timestamp,
			key: keystroke.key,
			event_type: keystroke.event_type
		});
	}

	async stopRecording(recordingId: string, endTimestamp: number): Promise<string> {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			throw new Error(`Recording ${recordingId} not found`);
		}

		// Close audio file
		const fileHandle = this.audioWriteStreams.get(recordingId);
		if (fileHandle) {
			await fileHandle.close();
			this.audioWriteStreams.delete(recordingId);
		}

		// Update end timestamp
		recording.end_timestamp = endTimestamp;
		const audioPath = path.join(this.recordingsDir, recording.audio_file);
		const durationSeconds = (endTimestamp - recording.start_timestamp) / 1000;

		await this.finalizeAudioFile(audioPath, durationSeconds);

		// Write JSON metadata
		const jsonFilename = this.generateFilename(recording.start_timestamp, 'json');
		const jsonPath = path.join(this.recordingsDir, jsonFilename);

		await fs.writeFile(jsonPath, JSON.stringify(recording, null, 2), 'utf-8');

		// Clean up from memory
		this.recordings.delete(recordingId);

		return jsonFilename;
	}

	getRecordingByKeyboardSession(keyboardSessionId: string): string | null {
		for (const [recordingId, recording] of this.recordings.entries()) {
			if (recording.keyboard_session_id === keyboardSessionId) {
				return recordingId;
			}
		}
		return null;
	}

	isRecording(recordingId: string): boolean {
		return this.recordings.has(recordingId);
	}

	private generateFilename(timestamp: number, extension: string): string {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');

		return `recording_${year}${month}${day}_${hours}${minutes}${seconds}.${extension}`;
	}

	private async finalizeAudioFile(audioPath: string, durationSeconds: number): Promise<void> {
		try {
			const file = await fs.readFile(audioPath);
			const patched = this.injectDuration(file, durationSeconds);
			if (patched) {
				await fs.writeFile(audioPath, patched);
			} else {
				console.warn('Could not update WebM duration metadata; playback duration may be unavailable.');
			}
		} catch (error) {
			console.warn('Failed to finalize WebM recording; playback duration may be unavailable:', error);
		}
	}

	private injectDuration(buffer: Buffer, durationSeconds: number): Buffer | null {
		const durationElement = Buffer.from([0x44, 0x89]);
		const idx = buffer.indexOf(durationElement);
		if (idx === -1) {
			return null;
		}

		const sizeInfo = this.decodeVint(buffer, idx + 2);
		if (!sizeInfo) {
			return null;
		}

		const { width, value } = sizeInfo;
		const dataOffset = idx + 2 + width;

		if (dataOffset + value > buffer.length) {
			return null;
		}

		const durationValue = durationSeconds * 1000;

		if (value === 4) {
			buffer.writeFloatBE(durationValue, dataOffset);
		} else if (value === 8) {
			buffer.writeDoubleBE(durationValue, dataOffset);
		} else {
			return null;
		}

		return buffer;
	}

	private decodeVint(buffer: Buffer, offset: number): { width: number; value: number } | null {
		if (offset >= buffer.length) {
			return null;
		}

		let first = buffer[offset];
		let mask = 0x80;
		let width = 1;

		while (width <= 8 && (first & mask) === 0) {
			mask >>= 1;
			width++;
		}

		if (width > 8 || offset + width > buffer.length) {
			return null;
		}

		let value = first & (mask - 1);
		for (let i = 1; i < width; i++) {
			value = (value << 8) | buffer[offset + i];
		}

		return { width, value };
	}
}
